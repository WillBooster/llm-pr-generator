import child_process from 'node:child_process';
import chalk from 'chalk';
import YAML from 'yaml';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import type { GitHubIssue } from './types';

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('issue', {
    alias: 'i',
    description: 'GitHub issue (or PR) number',
    type: 'number',
    demandOption: true,
  })
  .option('aider-args', {
    description: 'Arguments to pass to aider',
    type: 'string',
    default:
      '--architect --model bedrock/converse/us.deepseek.r1-v1:0 --editor-model bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0',
  })
  .help()
  .alias('help', 'h')
  .parseSync();

function main(): void {
  const issueNumber = argv.issue;

  const ret = child_process.spawnSync(
    'gh',
    ['issue', 'view', issueNumber.toString(), '--json', 'author,title,body,labels,comments'],
    {
      encoding: 'utf8',
      stdio: 'pipe',
    }
  );
  const issue: GitHubIssue = JSON.parse(ret.stdout);

  if (!issue.labels.some((label) => label.name.includes('llm-pr'))) {
    console.warn(chalk.yellow(`Issue #${issueNumber} is missing the required 'llm-pr' label. Processing skipped.`));
    process.exit(0);
  }

  const issueContent = {
    author: issue.author.login,
    title: issue.title,
    description: issue.body,
    comments: issue.comments.map((c) => ({
      author: c.author.login,
      body: c.body,
    })),
  };
  const prompt = `
Modify the code to solve the following GitHub issue:
\`\`\`\`yml
${YAML.stringify(issueContent).trim()}
\`\`\`\`
`.trim();

  const now = new Date();

  const branchName = `llm-pr-${issueNumber}-${now.getFullYear()}_${getTwoDigits(now.getMonth() + 1)}${getTwoDigits(now.getDate())}_${getTwoDigits(now.getHours())}${getTwoDigits(now.getMinutes())}${getTwoDigits(now.getSeconds())}`;
  runCommand('git', ['switch', '-C', branchName]);

  // Build aider command arguments
  const aiderArgs = ['--yes-always', '--no-gitignore', '--no-show-model-warnings', '--no-stream'];
  if (argv['aider-args']) {
    aiderArgs.push(...argv['aider-args'].split(/\s+/));
  }
  aiderArgs.push('--message', prompt);
  console.info(chalk.green(`$ aider ${aiderArgs}`));
  const aiderResult = child_process.spawnSync('aider', aiderArgs, { encoding: 'utf8', stdio: 'pipe' });
  const aiderAnswer = aiderResult.stdout.split(/─+/).at(-1)?.trim() ?? '';

  runCommand('git', ['push', 'origin', branchName]);

  // Create a PR using GitHub CLI
  const repo = getGitRepoName();
  const prTitle = getHeaderOfFirstCommit();
  const prBody = `Closes #${issueNumber}

\`\`\`\`
${aiderAnswer}
\`\`\`\``;
  runCommand('gh', ['pr', 'create', '--title', prTitle, '--body', prBody, '--repo', repo]);

  console.info(`\nIssue #${issueNumber} processed successfully.`);
  console.info('AWS_REGION_NAME:', process.env.AWS_REGION_NAME);
}

function getTwoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

function runCommand(command: string, args: string[]): void {
  console.info(chalk.green(`$ ${command} ${args}`));
  child_process.spawnSync(command, args, { stdio: 'inherit' });
}

function getGitRepoName(): string {
  const repoUrlResult = child_process.spawnSync('git', ['remote', 'get-url', 'origin'], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const repoUrl = repoUrlResult.stdout.trim();
  const repoMatch = repoUrl.match(/github\.com[\/:]([\w-]+\/[\w-]+)(\.git)?$/);
  return repoMatch ? repoMatch[1] : '';
}

function getHeaderOfFirstCommit(): string {
  // Get the first commit of the diff from the main branch
  const firstCommitResult = child_process.spawnSync('git', ['log', 'main..HEAD', '--reverse', '--pretty=%s', '-1'], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return firstCommitResult.stdout.trim();
}

main();
