import child_process from 'node:child_process';
import ansis from 'ansis';
import YAML from 'yaml';
import { selectFilesToBeModified } from './selectFiles';
import type { GitHubIssue, ReasoningEffort } from './types';

import { DEFAULT_AIDER_EXTRA_ARGS } from './defaultOptions';
import { runCommand } from './spawn';

/**
 * Options for the main function
 */
export interface MainOptions {
  /** Additional arguments to pass to the aider command */
  aiderExtraArgs?: string;
  /** Run without making actual changes (no branch creation, no PR) */
  dryRun?: boolean;
  /** GitHub issue number to process */
  issueNumber: number;
  /** LLM model to use for selecting files to be modified */
  model?: string;
  /** Level of reasoning effort for the LLM */
  reasoningEffort?: ReasoningEffort;
  /** Extra arguments for repomix when generating context */
  repomixExtraArgs?: string;
}

export async function main(options: MainOptions): Promise<void> {
  const { issueNumber, model, reasoningEffort, aiderExtraArgs } = options;
  const dryRun = options.dryRun ?? false;
  if (dryRun) {
    console.info(ansis.yellow('Running in dry-run mode. No branches or PRs will be created.'));
  }
  await runCommand('python', ['-m', 'pip', 'install', 'aider-install']);
  await runCommand('aider-install', []);
  await runCommand('uv', ['tool', 'run', '--from', 'aider-chat', 'pip', 'install', 'boto3']);

  const issueResult = await runCommand('gh', [
    'issue',
    'view',
    issueNumber.toString(),
    '--json',
    'author,title,body,labels,comments',
  ]);
  const issue: GitHubIssue = JSON.parse(issueResult);

  // if (!issue.labels.some((label) => label.name.includes('llm-pr'))) {
  //   console.warn(ansis.yellow(`Issue #${issueNumber} is missing the required 'llm-pr' label. Processing skipped.`));
  //   process.exit(0);
  // }

  const issueObject = {
    author: issue.author.login,
    title: issue.title,
    description: issue.body,
    comments: issue.comments.map((c) => ({
      author: c.author.login,
      body: c.body,
    })),
  };
  const issueText = YAML.stringify(issueObject).trim();
  const prompt = `
Modify the code to solve the following GitHub issue:
\`\`\`\`yml
${issueText}
\`\`\`\`
`.trim();
  const filePaths =
    (model && (await selectFilesToBeModified(model, issueText, reasoningEffort, options.repomixExtraArgs))) || [];
  console.log('Candidate files to be modified:', filePaths);

  const now = new Date();

  const branchName = `llm-pr-${issueNumber}-${now.getFullYear()}_${getTwoDigits(now.getMonth() + 1)}${getTwoDigits(now.getDate())}_${getTwoDigits(now.getHours())}${getTwoDigits(now.getMinutes())}${getTwoDigits(now.getSeconds())}`;
  if (!dryRun) {
    await runCommand('git', ['switch', '-C', branchName]);
  } else {
    console.info(ansis.yellow(`Would create branch: ${branchName}`));
  }

  // Build aider command arguments
  const aiderArgs = ['--yes-always', '--no-gitignore', '--no-show-model-warnings', '--no-stream'];
  aiderArgs.push(...(aiderExtraArgs || DEFAULT_AIDER_EXTRA_ARGS).split(/\s+/));
  if (dryRun) {
    aiderArgs.push('--dry-run');
  }
  aiderArgs.push('--message', prompt);
  aiderArgs.push(...filePaths);
  const FORCE_COLOR = process.env.FORCE_COLOR;
  process.env.FORCE_COLOR = '0';
  const aiderResult = await runCommand('aider', aiderArgs);
  const aiderAnswer = aiderResult.split(/─+/).at(-1)?.trim() ?? '';
  process.env.FORCE_COLOR = FORCE_COLOR;

  if (!dryRun) {
    await runCommand('git', ['push', 'origin', branchName]);
  } else {
    console.info(ansis.yellow(`Would push branch: ${branchName} to origin`));
  }

  // Create a PR using GitHub CLI
  const prTitle = getHeaderOfFirstCommit();
  const prBody = `Closes #${issueNumber}

\`\`\`\`
${aiderAnswer}
\`\`\`\``;
  if (!dryRun) {
    const repoName = getGitRepoName();
    await runCommand('gh', ['pr', 'create', '--title', prTitle, '--body', prBody, '--repo', repoName]);
  } else {
    console.info(ansis.yellow(`Would create PR with title: ${prTitle}`));
    console.info(ansis.yellow(`PR body would include the aider response and close issue #${issueNumber}`));
  }

  console.info(`\nIssue #${issueNumber} processed successfully.`);
  console.info('AWS_REGION_NAME:', process.env.AWS_REGION_NAME);
}

function getTwoDigits(value: number): string {
  return String(value).padStart(2, '0');
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
