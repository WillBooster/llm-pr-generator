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

// Build aider command arguments
const aiderArgs = ['--yes-always', '--no-gitignore', '--no-show-model-warnings', '--no-stream'];
if (argv['aider-args']) {
  aiderArgs.push(...argv['aider-args'].split(/s+/));
}
aiderArgs.push('--message', prompt);

// Execute aider command
console.info(`Running aider with ${aiderArgs}`);
child_process.spawnSync('aider', aiderArgs, { stdio: 'inherit', shell: true });
console.info(`\nIssue #${issueNumber} processed successfully.`);

console.info('AWS_REGION:', process.env.AWS_REGION);
