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
    description: 'GitHub issue number',
    type: 'number',
    default: 8,
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

const issueNumber = argv.issue;

const ret = child_process.spawnSync(
  'gh',
  ['issue', 'view', issueNumber.toString(), '--json', 'author,title,body,labels,comments'],
  {
    encoding: 'utf8',
    stdio: 'pipe',
  }
);
console.info('gh result:', ret);
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
\`\`\`yml
${YAML.stringify(issueContent).trim()}
\`\`\`
`.trim();

console.info(prompt);

const now = new Date();
const branchName = `llm-pr-${issueNumber}-${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}_${String(now.getDate()).padStart(2, '0')}`;
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
const lastCommitResult = child_process.spawnSync('git', ['log', '-1', '--pretty=%s'], {
  encoding: 'utf8',
  stdio: 'pipe',
});
const prTitle = lastCommitResult.stdout.trim();
const prBody = `Closes #${issueNumber}\n\n${aiderAnswer}`;
runCommand('gh', ['pr', 'create', '--title', prTitle, '--body', prBody]);

console.info(`\nIssue #${issueNumber} processed successfully.`);
console.info('AWS_REGION:', process.env.AWS_REGION);

function runCommand(command: string, args: string[]): void {
  console.info(chalk.green(`$ ${command} ${args}`));
  child_process.spawnSync(command, args, { stdio: 'inherit' });
}
