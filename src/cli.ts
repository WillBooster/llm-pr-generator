import process from 'node:process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { DEFAULT_AIDER_EXTRA_ARGS, DEFAULT_REPOMIX_EXTRA_ARGS } from './defaultOptions';
import { main } from './main';
import type { ReasoningEffort } from './types';

// Parse command line arguments using yargs
const argv = await yargs(hideBin(process.argv))
  // Options same with the GitHub Actions workflow
  .option('issue-number', {
    alias: 'i',
    description: 'GitHub issue number to process',
    type: 'number',
    demandOption: true,
  })
  .option('planning-model', {
    alias: 'm',
    description: 'LLM (OpenAI or Gemini) for planning code changes',
    type: 'string',
  })
  .option('detailed-plan', {
    alias: 'p',
    description: 'Whether to generate a detailed plan to write code (increases LLM cost but improves quality)',
    type: 'boolean',
    default: true,
  })
  .option('reasoning-effort', {
    alias: 'e',
    description: 'Constrains effort on reasoning for planning models. Supported values are low, medium, and high.',
    type: 'string',
    choices: ['low', 'medium', 'high'],
  })
  .option('aider-extra-args', {
    alias: 'a',
    description: 'Additional arguments to pass to the aider command',
    type: 'string',
    default: DEFAULT_AIDER_EXTRA_ARGS,
  })
  .option('repomix-extra-args', {
    alias: 'r',
    description: 'Additional arguments for repomix when generating context',
    type: 'string',
    default: DEFAULT_REPOMIX_EXTRA_ARGS,
  })
  .option('dry-run', {
    alias: 'd',
    description: 'Run without making actual changes (no branch creation, no PR)',
    type: 'boolean',
    default: false,
  })
  // Options only for this standalone tool --------------------
  .option('working-dir', {
    alias: 'w',
    description: 'Working directory path for commands',
    type: 'string',
  })
  // ----------------------------------------------------------
  .help().argv;

if (argv['working-dir']) {
  process.chdir(argv['working-dir']);
  console.info(`Changed working directory to: ${process.cwd()}`);
}

await main({
  aiderExtraArgs: argv['aider-extra-args'],
  dryRun: argv['dry-run'],
  detailedPlan: argv['detailed-plan'],
  issueNumber: argv['issue-number'],
  model: argv['planning-model'],
  reasoningEffort: argv['reasoning-effort'] as ReasoningEffort,
  repomixExtraArgs: argv['repomix-extra-args'],
});
