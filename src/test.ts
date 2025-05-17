import ansis from 'ansis';
import { buildAiderArgs } from './aiderUtils';
import type { MainOptions } from './main';
import type { ResolutionPlan } from './plan';
import { runCommand, spawnAsync } from './spawn';
import { parseCommandLineArgs } from './utils';

export async function testAndFix(options: MainOptions, resolutionPlan: ResolutionPlan): Promise<string> {
  const maxAttempts = options.maxTestAttempts;
  let attempts = 0;
  let success = false;
  let fixResult = '';

  while (!success && attempts < maxAttempts) {
    attempts++;
    console.info(ansis.cyan(`Executing test command (attempt ${attempts}/${maxAttempts}): ${options.testCommand}`));
    const [commandProgram, ...commandArgs] = parseCommandLineArgs(options.testCommand || '');

    const testResult = await spawnAsync(commandProgram, commandArgs, {
      cwd: process.cwd(),
    });

    if (testResult.status === 0) {
      console.info(ansis.green('Test command passed successfully.'));
      success = true;
      break;
    }

    console.warn(ansis.yellow(`Test command failed with exit code ${testResult.status}.`));

    // Only try to fix if we haven't reached the maximum attempts
    if (attempts >= maxAttempts) {
      console.warn(ansis.yellow(`Maximum fix attempts (${maxAttempts}) reached. Giving up.`));
      break;
    }

    const prompt = `
The previous changes were applied, but the test command "${options.testCommand}" failed.

Exit code: ${testResult.status}

Stdout:
\`\`\`
${testResult.stdout}
\`\`\`

Stderr:
\`\`\`
${testResult.stderr}
\`\`\`

Please analyze the output and fix the errors.
`.trim();

    fixResult += await runAiderFix(options, resolutionPlan, prompt, 'test command');
  }

  return fixResult;
}

/**
 * Helper function to run Aider with a fix prompt
 */
export async function runAiderFix(
  options: MainOptions,
  resolutionPlan: ResolutionPlan,
  prompt: string,
  fixType: string
): Promise<string> {
  const aiderArgs = buildAiderArgs(options, { message: prompt, resolutionPlan });

  console.info(ansis.cyan(`Asking Aider to fix ${fixType}...`));

  const aiderResult = await runCommand('aider', aiderArgs, {
    env: { ...process.env, NO_COLOR: '1' },
  });

  console.info(ansis.green(`Aider has attempted to fix the ${fixType}.`));

  return `\n\n# Aider fix attempt for ${fixType}\n\n${aiderResult.trim()}`;
}
