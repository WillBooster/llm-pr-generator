import child_process from 'node:child_process';
import chalk from 'chalk';
import YAML from 'yaml';
import type { GitHubIssue } from './types';

process.env.FORCE_COLOR = '3';

const aiderExtraArgs =
  '--architect --model bedrock/converse/us.deepseek.r1-v1:0 --editor-model bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0';

export function main(issueNumber: number): void {
  runCommand('python', ['-m', 'pip', 'install', 'aider-install']);
  runCommand('aider-install', []);
  runCommand('uv', ['tool', 'run', '--from', 'aider-chat', 'pip', 'install', 'boto3']);

  const issueResult = runCommandAndGetStdout('gh', [
    'issue',
    'view',
    issueNumber.toString(),
    '--json',
    'author,title,body,labels,comments',
  ]);
  const issue: GitHubIssue = JSON.parse(issueResult);

  // if (!issue.labels.some((label) => label.name.includes('llm-pr'))) {
  //   console.warn(chalk.yellow(`Issue #${issueNumber} is missing the required 'llm-pr' label. Processing skipped.`));
  //   process.exit(0);
  // }

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
  if (aiderExtraArgs) {
    aiderArgs.push(...aiderExtraArgs.split(/\s+/));
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

function runCommandAndGetStdout(command: string, args: string[]): string {
  console.info(chalk.green(`$ ${command} ${args}`));
  const ret = child_process.spawnSync(command, args, { encoding: 'utf8', stdio: 'pipe' });
  console.info(chalk.yellow(`Exit code: ${ret.status}`));
  console.info('stdout:');
  console.info(chalk.cyan(ret.stdout.trim()));
  console.info('stderr:');
  console.info(chalk.magenta(ret.stderr.trim()));
  return ret.stdout;
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
