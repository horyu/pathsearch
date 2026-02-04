import * as path from 'node:path';

export function normalizeSearchScope(searchScope?: string | string[]): string[] {
  if (!searchScope) {
    return ['.'];
  }
  const scopes = Array.isArray(searchScope) ? searchScope : [searchScope];
  return scopes.map(scope => (scope === '' ? '.' : scope));
}

export function validateSearchScope(searchPaths: string[]): void {
  for (const p of searchPaths) {
    if (p.includes('..') || path.isAbsolute(p) || p.includes('*') || /[{}]/.test(p)) {
      throw new Error(`Invalid search path: ${p}`);
    }
  }
}

export function normalizeFilePatterns(filePattern?: string | string[]): string[] {
  if (!filePattern) {
    return [];
  }
  return Array.isArray(filePattern) ? filePattern : [filePattern];
}

export function validateFilePatterns(filePatterns: string[]): void {
  for (const pattern of filePatterns) {
    if (pattern.includes('--')) {
      throw new Error(`Invalid file pattern contains "--": ${pattern}`);
    }
    if (!/^[\w*.\-/{}!,]+$/.test(pattern)) {
      throw new Error(`Invalid file pattern: ${pattern}`);
    }
  }
}
