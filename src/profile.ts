import ansis from 'ansis';
import { runCommand } from './spawn';

export async function configureGitUserDetailsIfNeeded(): Promise<void> {
  const gitUserName = (await runCommand('git', ['config', 'user.name'])).trim();
  if (!gitUserName) {
    console.log(ansis.dim('Git user.name not set. Attempting to configure from GitHub profile...'));
    const githubNameOutput = (await runCommand('gh', ['api', 'user', '--jq', '.name'])).trim();
    if (githubNameOutput && githubNameOutput !== 'null') {
      const nameToSet = githubNameOutput.replace(/^"|"$/g, ''); // Remove potential surrounding quotes
      await runCommand('git', ['config', 'user.name', nameToSet]);
      console.log(ansis.green(`Successfully configured git user.name to "${nameToSet}"`));
    } else {
      console.warn(ansis.yellow('Could not retrieve user name from GitHub profile (it might be "null" or not set).'));
    }
  }

  const gitUserEmail = (await runCommand('git', ['config', 'user.email'])).trim();
  if (!gitUserEmail) {
    console.log(ansis.dim('Git user.email not set. Attempting to configure from GitHub profile...'));
    const githubEmailOutput = (await runCommand('gh', ['api', 'user', '--jq', '.email'])).trim();
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
  }
}
