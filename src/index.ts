import core from '@actions/core';
import { main } from './main';

// Get inputs
const issueNumber = core.getInput('issue-number', { required: true });

console.log('Hello, World!');

main(Number(issueNumber));
