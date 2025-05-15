import child_process from 'node:child_process';
import ansis from 'ansis';
import YAML from 'yaml';
import { planCodeChanges } from './plan';
import type { GitHubIssue, ReasoningEffort } from './types';
import { parseCommandLineArgs, stripHtmlComments } from './utils';

import { DEFAULT_AIDER_EXTRA_ARGS } from './defaultOptions';
import { configureGitUserDetailsIfNeeded } from './profile';
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
  /** Command to run after Aider applies changes to verify them */
  testCommand?: string;
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
  testCommand,
}: MainOptions): Promise<void> {
  if (dryRun) {
    console.info(ansis.yellow('Running in dry-run mode. No branches or PRs will be created.'));
  } else {
    await configureGitUserDetailsIfNeeded();
  }

  await runCommand('python', ['-m', 'pip', 'install', 'aider-install']);
  await runCommand('uv', ['tool', 'uninstall', 'aider-chat'], { ignoreExitStatus: true });
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
  let aiderResult = await runCommand('aider', aiderArgs, {
    env: { ...process.env, FORCE_COLOR: '' },
  });
  let aiderAnswer = aiderResult.trim();

  if (testCommand && !dryRun) {
    console.info(ansis.cyan(`Running test command: ${testCommand}`));
    const [command, ...args] = parseCommandLineArgs(testCommand);
    const testResult = await executeCommandAndGetOutput(command, args);

    if (testResult.exitCode !== 0) {
      console.warn(ansis.yellow(`Test command failed with exit code ${testResult.exitCode}.`));
      console.info(ansis.yellow('Attempting to fix with Aider...'));

      const fixPrompt = `
The previous changes were applied, but the following test command failed:
Command: ${testCommand}
Exit Code: ${testResult.exitCode}
Stdout:
\`\`\`\`
${testResult.stdout}
\`\`\`\`
Stderr:
\`\`\`\`
${testResult.stderr}
\`\`\`\`

Please analyze the test command output and fix the errors in the codebase.
Keep the original issue in mind:
\`\`\`\`yml
${issueText}
\`\`\`\`
${planText ? `\nOriginal plan:\n${planText}` : ''}
`.trim();

      const fixAiderArgs = [
        '--yes-always',
        '--no-check-update',
        '--no-gitignore',
        '--no-show-model-warnings',
        '--no-show-release-notes',
      ];
      fixAiderArgs.push(...parseCommandLineArgs(aiderExtraArgs || DEFAULT_AIDER_EXTRA_ARGS));
      fixAiderArgs.push('--message', fixPrompt);
      if (resolutionPlan && 'filePaths' in resolutionPlan) {
        fixAiderArgs.push(...resolutionPlan.filePaths);
      }

      const fixAiderResult = await runCommand('aider', fixAiderArgs, {
        env: { ...process.env, FORCE_COLOR: '' },
      });
      aiderAnswer += `\n\n--- Test Command Failed, Aider Fix Attempt ---\n\n${fixAiderResult.trim()}`;
    } else {
      console.info(ansis.green('Test command passed.'));
    }
  } else if (testCommand && dryRun) {
    console.info(ansis.yellow(`Would run test command: ${testCommand}`));
    console.info(ansis.yellow('Skipping test command execution and Aider fix attempt in dry-run mode.'));
  }


  // Try commiting changes because aider may fail to commit changes due to pre-commit hooks
  await runCommand('git', ['commit', '-m', `fix: close #${issueNumber}`, '--no-verify'], { ignoreExitStatus: true });
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
