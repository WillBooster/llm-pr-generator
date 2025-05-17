// We should specify the language. cf. https://github.com/Aider-AI/aider/issues/3971
export const DEFAULT_AIDER_EXTRA_ARGS =
  '--model gemini/gemini-2.5-pro-preview-05-06 --edit-format diff-fenced --chat-language English';
export const DEFAULT_REPOMIX_EXTRA_ARGS = '--compress --remove-empty-lines --include "src/**/*.{ts,tsx},**/*.md"';
export const DEFAULT_MAX_TEST_ATTEMPTS = 5;
