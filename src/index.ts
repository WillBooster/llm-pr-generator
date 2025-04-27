import child_process from 'node:child_process';
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
  .help()
  .alias('help', 'h')
  .parseSync();

const issueNumber = argv.issue;

const ret = child_process.spawnSync(`gh issue view ${issueNumber} --json author,title,body,comments`, {
  shell: true,
  encoding: 'utf8',
  stdio: 'pipe',
});

const issue: GitHubIssue = JSON.parse(ret.stdout);

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
Modify the code set to solve the following GitHub issue:
\`\`\`yml
${YAML.stringify(issueContent)}
\`\`\`
`.trim();

console.info(prompt);
console.info(`\nIssue #${issueNumber} processed successfully.`);
