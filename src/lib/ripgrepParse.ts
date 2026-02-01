export type RipgrepMatch = {
  relativePath: string;
  lineNumber: number;
  column: number;
  endColumn: number;
  matchText: string;
};

export function parseRipgrepMatches(output: string): RipgrepMatch[] {
  if (!output.trim()) {
    return [];
  }

  const matches: RipgrepMatch[] = [];
  const lines = output
    .trim()
    .split(/\r?\n/)
    .filter(line => line.length > 0);

  for (const line of lines) {
    try {
      const result = JSON.parse(line);
      if (result.type !== 'match' || !result.data) {
        continue;
      }

      const data = result.data;
      const submatch = data.submatches?.[0];
      if (!submatch || !data.lines?.text) {
        continue;
      }

      const matchText = data.lines.text.slice(submatch.start, submatch.end);
      matches.push({
        relativePath: data.path.text,
        lineNumber: (data.line_number || 1) - 1,
        column: submatch.start || 0,
        endColumn: submatch.end || (submatch.start || 0) + 1,
        matchText
      });
    } catch {
      // Ignore JSON parse errors (ripgrep warnings, etc.)
    }
  }

  return matches;
}
