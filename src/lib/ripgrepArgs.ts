export type RipgrepArgsOptions = {
  searchQuery: string;
  isRegex: boolean;
  maxResults: number;
  searchScope: string[];
  filePattern?: string[];
  includeStats?: boolean;
  maxFileSize?: string;
};

export function buildRipgrepArgs(options: RipgrepArgsOptions): string[] {
  const args: string[] = [
    '--json',
    '--line-number',
    '--column',
    '--max-count',
    String(options.maxResults),
    '--max-filesize',
    options.maxFileSize ?? '10M'
  ];

  if (options.includeStats) {
    args.push('--stats');
  }

  if (!options.isRegex) {
    args.push('--fixed-strings');
  }

  if (options.filePattern) {
    for (const pattern of options.filePattern) {
      args.push('--glob', pattern);
    }
  }

  args.push('--', options.searchQuery, ...options.searchScope);
  return args;
}
