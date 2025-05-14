import fs from 'node:fs';
import YAML from 'yaml';
import { callLlmApi, getApiUrlAndKey } from './llm';
import type { ReasoningEffort } from './types';
import { parseCommandLineArgs } from './utils';

import { DEFAULT_REPOMIX_EXTRA_ARGS } from './defaultOptions';
import { runCommand } from './spawn';

const REPOMIX_FILE_NAME = 'repomix.result';

export type ResolutionPlan = {
  plan?: string;
  filePaths: string[];
};

export async function planCodeChanges(
  model: string,
  issueContent: string,
  detailedPlan: boolean,
  reasoningEffort?: ReasoningEffort,
  repomixExtraArgs?: string
): Promise<ResolutionPlan> {
  const { url, apiKey } = getApiUrlAndKey(model);

  // Base repomix command arguments
  const repomixArgs = ['--yes', 'repomix@latest', '--output', REPOMIX_FILE_NAME];
  repomixArgs.push(...parseCommandLineArgs(repomixExtraArgs || DEFAULT_REPOMIX_EXTRA_ARGS));

  await runCommand('npx', repomixArgs);
  const context = fs.readFileSync(REPOMIX_FILE_NAME, 'utf8');
  void fs.promises.rm(REPOMIX_FILE_NAME, { force: true });

  const planningTask = detailedPlan
    ? `
- Identify the files from the provided list that will need to be modified to implement the plan and resolve the issue.`
    : '';
  const planFormat = detailedPlan
    ? `# Plan to Resolve the Issue

1. <Description of step 1>
2. <Description of step 2>
3. ...

`
    : '';

  const prompt = `
Review the following GitHub issue and the following list of available file paths and their contents.
Based on this information, please perform the following tasks:

- Create a step-by-step plan outlining how to address the GitHub issue. The plan must focus on writing code excluding tests.
${planningTask}

GitHub Issue:
\`\`\`\`yml
${YAML.stringify(issueContent).trim()}
\`\`\`\`

Available files: The user will provide this as a separate message.

Please format your response as follows:
\`\`\`
${planFormat}# File Paths to be Modified

- \`<filePath1>\`
- \`<filePath2>\`
- ...
\`\`\`

Ensure that the file paths are exactly as provided in the input.
`.trim();

  console.info(`Generating plan with ${model} (reasoning effort: ${reasoningEffort}) ...`);
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
  console.info('Planning complete!');

  const planHeader = '# Plan to Resolve the Issue';
  const filesHeader = '# File Paths to be Modified';

  let plan: string | undefined;
  let filePaths: string[] = [];

  const planHeaderIndex = response.indexOf(planHeader);
  const filesHeaderIndex = response.indexOf(filesHeader);

  if (planHeaderIndex !== -1) {
    const planContentStartIndex = planHeaderIndex + planHeader.length;
    // Determine the end of the plan content. It's either the start of the files header or end of the response.
    const planContentEndIndex = filesHeaderIndex !== -1 ? filesHeaderIndex : response.length;
    plan = response.slice(planContentStartIndex, planContentEndIndex).trim();
  }

  if (filesHeaderIndex !== -1) {
    const filesContentStartIndex = filesHeaderIndex + filesHeader.length;
    // The files section goes from after its header to the end of the response.
    const filesSectionText = response.slice(filesContentStartIndex).trim();

    const filePathRegex = /\B-\s*`?([^`\n]+)`?/g;
    const matches = [...filesSectionText.matchAll(filePathRegex)];
    filePaths = matches.map((match) => match[1].trim());
  }

  return { plan, filePaths };
}
