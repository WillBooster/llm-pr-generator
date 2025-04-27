import * as child_process from 'node:child_process';
import YAML from 'yaml';
import type { GitHubIssue } from './types';

const ret = child_process.spawnSync('gh issue view 8 --json author,title,body,comments', {
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
