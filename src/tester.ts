import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { main } from './main';

// Parse command line arguments using yargs
const argv = await yargs(hideBin(process.argv))
  .option('issue-number', {
    alias: 'i',
    description: 'GitHub issue number to process',
    type: 'number',
    demandOption: true,
  })
  .help().argv;

main(argv['issue-number']);
