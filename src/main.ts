import child_process from 'node:child_process';
import ansis from 'ansis';
import YAML from 'yaml';
import { planCodeChanges } from './plan';
import type { GitHubIssue, ReasoningEffort } from './types';
import { parseCommandLineArgs } from './utils';

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

  let prDiff = '';
  const repoName = getGitRepoName();

  if (repoName) {
    try {
      // Check if the issue number is a PR by trying to view it.
      // We use stdio: [null, null, null] to ignore stdio streams as we only care about success/failure, not the output.
      await runCommand('gh', ['pr', 'view', issueNumber.toString(), '--repo', repoName, '--json', 'number'], {
        stdio: [null, null, null],
      });
      console.info(ansis.green(`Issue #${issueNumber} is a Pull Request. Attempting to fetch its diff.`));

      try {
        const diffOutput = await runCommand('gh', ['pr', 'diff', issueNumber.toString(), '--repo', repoName]);
        if (diffOutput.trim()) {
          prDiff = diffOutput.trim();
          console.info(ansis.green(`Successfully fetched diff for PR #${issueNumber}.`));
        } else {
          console.info(ansis.yellow(`PR #${issueNumber} has no diff content.`));
          // prDiff remains ''
        }
      } catch (diffError) {
        console.warn(
          ansis.yellow(
            `Failed to fetch diff for PR #${issueNumber}: ${diffError instanceof Error ? diffError.message : String(diffError)}`
          )
        );
        // prDiff remains ''
      }
    } catch (prCheckError) {
      // Not a PR or 'gh pr view' failed (e.g., PR not found, network issue, etc.)
      // Log this information and proceed as if it's a regular issue.
      console.info(
        ansis.blue(
          `Issue #${issueNumber} is not a Pull Request, or an error occurred while checking. Proceeding as a regular issue. Error: ${prCheckError instanceof Error ? prCheckError.message : String(prCheckError)}`
        )
      );
      // prDiff remains ''
    }
  } else {
    console.warn(ansis.yellow('Could not determine repository name. Skipping PR diff check.'));
  }

  const issueObject = {
    author: issue.author.login,
    title: issue.title,
    description: issue.body,
    comments: issue.comments.map((c) => ({
      author: c.author.login,
      body: c.body,
    })),
  };
  let issueText = YAML.stringify(issueObject).trim();

  if (prDiff) {
    issueText += `\n\n--- START OF CODE CHANGES (DIFF) ---\n${prDiff}\n--- END OF CODE CHANGES (DIFF) ---`;
    console.info(ansis.green('Appended PR diff to the content for LLM and Aider.'));
  }

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
