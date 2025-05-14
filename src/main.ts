import child_process from 'node:child_process';
import ansis from 'ansis';
import YAML from 'yaml';
import { planCodeChanges } from './plan';
import type { GitHubIssue, ReasoningEffort } from './types';
import { parseCommandLineArgs, stripHtmlComments } from './utils';

import { DEFAULT_AIDER_EXTRA_ARGS } from './defaultOptions';
import { runCommand } from './spawn';

/**
 * Options for the main function
 */
export interface MainOptions {
  /** Additional arguments to pass to the aider command */
  aiderExtraArgs?: string;
  /** Whether to generate a detailed plan */
  detailedPlan: boolean;
  /** Run without making actual changes (no branch creation, no PR) */
  dryRun: boolean;
  /** GitHub issue number to process */
  issueNumber: number;
  /** LLM model to use for planning code changes */
  planningModel?: string;
  /** Level of reasoning effort for the LLM */
  reasoningEffort?: ReasoningEffort;
  /** Extra arguments for repomix when generating context */
  repomixExtraArgs?: string;
}

async function configureGitUserDetailsIfNeeded(): Promise<void> {
  // Configure user.name
  let gitUserName = '';
  try {
    gitUserName = (await runCommand('git', ['config', 'user.name'], undefined, true)).trim();
  } catch (error: any) {
    console.warn(
      ansis.yellow(
        `Failed to run 'git config user.name': ${error.message}. Is git installed? Skipping git user configuration.`
      )
    );
    return; // Exit if git command fails
  }

  if (!gitUserName) {
    console.log(ansis.dim('Git user.name not set. Attempting to configure from GitHub profile...'));
    try {
      const githubNameOutput = (await runCommand('gh', ['api', 'user', '--jq', '.name'], undefined, true)).trim();
      if (githubNameOutput && githubNameOutput !== 'null') {
        const nameToSet = githubNameOutput.replace(/^"|"$/g, ''); // Remove potential surrounding quotes
        await runCommand('git', ['config', 'user.name', nameToSet]);
        console.log(ansis.green(`Successfully configured git user.name to "${nameToSet}"`));
      } else {
        console.warn(
          ansis.yellow(
            'Could not retrieve user name from GitHub profile (it might be "null" or not set). Please configure it manually: git config user.name "Your Name"'
          )
        );
      }
    } catch (ghError: any) {
      console.warn(
        ansis.yellow(
          `Failed to execute 'gh' command to fetch user name: ${ghError.message}. Is GitHub CLI installed and authenticated?`
        )
      );
      console.warn(ansis.yellow('Please configure git user.name manually: git config user.name "Your Name"'));
    }
  } else {
    console.log(ansis.dim(`Git user.name already set to "${gitUserName}".`));
  }

  // Configure user.email
  let gitUserEmail = '';
  try {
    gitUserEmail = (await runCommand('git', ['config', 'user.email'], undefined, true)).trim();
  } catch (error: any) {
    console.warn(
      ansis.yellow(
        `Failed to run 'git config user.email': ${error.message}. Is git installed? Skipping git user email configuration.`
      )
    );
    return; // Exit if git command fails
  }

  if (!gitUserEmail) {
    console.log(ansis.dim('Git user.email not set. Attempting to configure from GitHub profile...'));
    try {
      const githubEmailOutput = (await runCommand('gh', ['api', 'user', '--jq', '.email'], undefined, true)).trim();
      if (githubEmailOutput && githubEmailOutput !== 'null') {
        const emailToSet = githubEmailOutput.replace(/^"|"$/g, ''); // Remove potential surrounding quotes
        await runCommand('git', ['config', 'user.email', emailToSet]);
        console.log(ansis.green(`Successfully configured git user.email to "${emailToSet}"`));
      } else {
        console.warn(
          ansis.yellow(
            'Could not retrieve user email from GitHub profile (it might be "null", private, or not set). Please configure it manually: git config user.email "you@example.com"'
          )
        );
      }
    } catch (ghError: any) {
      console.warn(
        ansis.yellow(
          `Failed to execute 'gh' command to fetch user email: ${ghError.message}. Is GitHub CLI installed and authenticated?`
        )
      );
      console.warn(ansis.yellow('Please configure git user.email manually: git config user.email "you@example.com"'));
    }
  } else {
    console.log(ansis.dim(`Git user.email already set to "${gitUserEmail}".`));
  }
}

const MAX_ANSWER_LENGTH = 65000;

export async function main({
  aiderExtraArgs,
  detailedPlan,
  dryRun,
  issueNumber,
  planningModel,
  reasoningEffort,
  repomixExtraArgs,
}: MainOptions): Promise<void> {
  await configureGitUserDetailsIfNeeded();

  if (dryRun) {
    console.info(ansis.yellow('Running in dry-run mode. No branches or PRs will be created.'));
  }
  await runCommand('python', ['-m', 'pip', 'install', 'aider-install']);
  await runCommand('uv', ['tool', 'uninstall', 'aider-chat'], undefined, true);
  await runCommand('aider-install', []);
  await runCommand('uv', ['tool', 'run', '--from', 'aider-chat', 'pip', 'install', 'boto3']);
  // await runCommand('aider', ['--install-main-branch', '--yes-always']);

  const issueResult = await runCommand('gh', [
    'issue',
    'view',
    issueNumber.toString(),
    '--json',
    'author,title,body,labels,comments',
  ]);
  const issue: GitHubIssue = JSON.parse(issueResult);

  // if (!issue.labels.some((label) => label.name.includes('ai-pr'))) {
  //   console.warn(ansis.yellow(`Issue #${issueNumber} is missing the required 'ai-pr' label. Processing skipped.`));
  //   process.exit(0);
  // }

  const cleanedIssueBody = stripHtmlComments(issue.body);
  const issueObject = {
    author: issue.author.login,
    title: issue.title,
    description: cleanedIssueBody,
    comments: issue.comments.map((c) => ({
      author: c.author.login,
      body: c.body,
    })),
  };
  const issueText = YAML.stringify(issueObject).trim();
  const resolutionPlan =
    planningModel && (await planCodeChanges(planningModel, issueText, detailedPlan, reasoningEffort, repomixExtraArgs));
  const planText =
    resolutionPlan && 'plan' in resolutionPlan && resolutionPlan.plan
      ? `
# Plan

${resolutionPlan.plan}
`.trim()
      : '';
  const prompt = `
Modify the code to resolve the following GitHub issue:
\`\`\`\`yml
${issueText}
\`\`\`\`

${planText}
`.trim();
  console.log('Resolution plan:', resolutionPlan);

  const now = new Date();

  const branchName = `ai-pr-${issueNumber}-${now.getFullYear()}_${getTwoDigits(now.getMonth() + 1)}${getTwoDigits(now.getDate())}_${getTwoDigits(now.getHours())}${getTwoDigits(now.getMinutes())}${getTwoDigits(now.getSeconds())}`;
  if (!dryRun) {
    await runCommand('git', ['switch', '-C', branchName]);
  } else {
    console.info(ansis.yellow(`Would create branch: ${branchName}`));
  }

  // Build aider command arguments
  const aiderArgs = [
    '--yes-always',
    '--no-check-update',
    '--no-gitignore',
    '--no-show-model-warnings',
    '--no-show-release-notes',
  ];
  aiderArgs.push(...parseCommandLineArgs(aiderExtraArgs || DEFAULT_AIDER_EXTRA_ARGS));
  if (dryRun) {
    aiderArgs.push('--dry-run');
  }
  aiderArgs.push('--message', prompt);
  if (resolutionPlan && 'filePaths' in resolutionPlan) {
    aiderArgs.push(...resolutionPlan.filePaths);
  }
  const aiderResult = await runCommand('aider', aiderArgs, {
    env: { ...process.env, FORCE_COLOR: '' },
  });
  const aiderAnswer = aiderResult.trim();

  // Try commiting changes because aider may fail to commit changes due to pre-commit hooks
  await runCommand('git', ['commit', '-m', `fix: close #${issueNumber}`, '--no-verify'], undefined, true);
  if (!dryRun) {
    await runCommand('git', ['push', 'origin', branchName, '--no-verify']);
  } else {
    console.info(ansis.yellow(`Would push branch: ${branchName} to origin`));
  }

  // Create a PR using GitHub CLI
  const prTitle = getHeaderOfFirstCommit();
  let prBody = `Closes #${issueNumber}

${planText}
`;
  prBody += `
# Aider Log

\`\`\`\`
${aiderAnswer.slice(0, MAX_ANSWER_LENGTH - prBody.length)}
\`\`\`\``;
  prBody = prBody.replaceAll(/(?:\s*\n){2,}/g, '\n\n').trim();
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
  const firstCommitResult = child_process.spawnSync('git', ['log', 'main..HEAD', '--reverse', '--pretty=%s'], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return firstCommitResult.stdout.trim().split('\n')[0];
}
