import { DEFAULT_AIDER_EXTRA_ARGS } from './defaultOptions';
import type { MainOptions } from './main';
import type { ResolutionPlan } from './plan';
import { parseCommandLineArgs } from './utils';

/**
 * Builds the command line arguments for the aider command
 *
 * @param options The main options object
 * @param additionalArgs Additional arguments to include
 * @returns An array of command line arguments for aider
 */
export function buildAiderArgs(
  options: MainOptions,
  additionalArgs: { message?: string; resolutionPlan?: ResolutionPlan } = {}
): string[] {
  const aiderArgs = [
    '--yes-always',
    '--no-check-update',
    '--no-gitignore',
    '--no-show-model-warnings',
    '--no-show-release-notes',
    ...parseCommandLineArgs(options.aiderExtraArgs || DEFAULT_AIDER_EXTRA_ARGS),
  ];

  if (options.dryRun) {
    aiderArgs.push('--dry-run');
  }

  if (additionalArgs.message) {
    aiderArgs.push('--message', additionalArgs.message);
  }

  if (additionalArgs.resolutionPlan && 'filePaths' in additionalArgs.resolutionPlan) {
    aiderArgs.push(...additionalArgs.resolutionPlan.filePaths);
  }

  return aiderArgs;
}
