import fs from 'node:fs';
import YAML from 'yaml';
import { callLlmApi, getApiUrlAndKey } from './llm';
import type { ReasoningEffort } from './types';
import { parseCommandLineArgs } from './utils';

import { DEFAULT_REPOMIX_EXTRA_ARGS } from './defaultOptions';
import { runCommand } from './spawn';

const REPOMIX_FILE_NAME = 'repomix.result';

export async function selectFilesToBeModified(
  model: string,
  issueContent: string,
  reasoningEffort?: ReasoningEffort,
  repomixExtraArgs?: string
): Promise<string[]> {
  const { url, apiKey } = getApiUrlAndKey(model);

  // Base repomix command arguments
  const repomixArgs = ['--yes', 'repomix@latest', '--output', REPOMIX_FILE_NAME];
  repomixArgs.push(...parseCommandLineArgs(repomixExtraArgs || DEFAULT_REPOMIX_EXTRA_ARGS));

  await runCommand('npx', repomixArgs);
  const context = fs.readFileSync(REPOMIX_FILE_NAME, 'utf8');
  void fs.promises.rm(REPOMIX_FILE_NAME, { force: true });
  const prompt = `
Review the following issue on GitHub and the list of available file paths.
Select the files from the list that need to be modified to address the issue.

GitHub Issue:
\`\`\`\`yml
${YAML.stringify(issueContent).trim()}
\`\`\`\`

Available Files: The user will provide a list of file paths.

Return a list of the selected file paths in the following format:
\`\`\`
- <filePath1>
- <filePath2>
- ...
\`\`\`
`.trim();
  const response = await callLlmApi(
    url,
    apiKey,
    model,
    [
      {
        role: 'system',
        content: prompt,
      },
      {
        role: 'user',
        content: context,
      },
    ],
    reasoningEffort
  );
  const regex = /-\s*`?([^`\n]+)`?/g;
  return [...response.matchAll(regex)].map((match) => match[1]);
}
