/**
 * Parses a command line string into an array of arguments, preserving quoted strings.
 *
 * This function handles:
 * - Space-separated arguments
 * - Double-quoted strings (preserves spaces within)
 * - Single-quoted strings (preserves spaces within)
 *
 * @param argsString The command line string to parse
 * @returns An array of parsed arguments
 */
export function parseCommandLineArgs(argsString: string): string[] {
  if (!argsString) return [];

  const result: string[] = [];
  let current = '';
  let inDoubleQuote = false;
  let inSingleQuote = false;

  for (let i = 0; i < argsString.length; i++) {
    const char = argsString[i];

    // Handle quotes
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    // Handle spaces (only split on spaces outside of quotes)
    if (char === ' ' && !inDoubleQuote && !inSingleQuote) {
      if (current) {
        result.push(current);
        current = '';
      }
      continue;
    }

    // Add character to current argument
    current += char;
  }

  // Add the last argument if there is one
  if (current) {
    result.push(current);
  }

  return result;
}
