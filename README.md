# generate-pr-with-ai

[![Test](https://github.com/WillBooster/generate-pr-with-ai/actions/workflows/test.yml/badge.svg)](https://github.com/WillBooster/generate-pr-with-ai/actions/workflows/test.yml)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

A CLI and GitHub Action that automatically generate pull requests using AI (specifically, a Large Language Model or LLM).

## Requirements

- For development:
  - [asdf](https://asdf-vm.com/)
- For execution:
  - [gh](https://github.com/cli/cli)

## Usage

- GitHub Actions
  See [action.yml](action.yml) and [.github/workflows/generate-pr.yml](.github/workflows/generate-pr.yml).
- CLI
```sh
bun start -i 37 -m gemini-2.5-pro-preview-05-06 -e high -r="--compress --remove-empty-lines --include 'src/**/*.ts'" -a="--model gemini/gemini-2.5-pro-preview-05-06 --edit-format diff-fenced --test-cmd='yarn check-for-ai' --auto-test"
```

## License

Apache License 2.0
