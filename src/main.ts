import * as child_process from 'node:child_process';

const ret = child_process.spawnSync('gh issue view 8 --json title,body,comments', {
  shell: true,
  encoding: 'utf8',
  stdio: 'pipe',
});

const issue = JSON.parse(ret.stdout);
console.log(issue);
