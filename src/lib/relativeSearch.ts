import * as path from 'path';
import type { RelativeMatchTarget, RelativeSearchConfig } from './types';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isRelativeMatchTarget(value: string): value is RelativeMatchTarget {
  return value === 'parentDir' || value === 'fileName' || value === 'fileStem';
}

function getRelativeTargetToken(relativeFilePath: string, matchTarget: RelativeMatchTarget): string {
  const normalizedPath = relativeFilePath.replace(/\\/g, '/');
  const directory = path.posix.dirname(normalizedPath);
  switch (matchTarget) {
    case 'parentDir':
      return directory === '.' ? '' : path.posix.basename(directory);
    case 'fileName':
      return path.posix.basename(normalizedPath);
    case 'fileStem':
      return path.posix.basename(normalizedPath, path.posix.extname(normalizedPath));
  }
}

export function buildRelativeSearchQuery(relativeFilePath: string, config: RelativeSearchConfig): string {
  const token = getRelativeTargetToken(relativeFilePath, config.matchTarget);
  if (!token) {
    throw new Error('Relative match target is empty');
  }
  const escapedToken = escapeRegex(token);
  return '((?:\\./|\\.\\./)[^"\'`\\s]*' + escapedToken + '[^"\'`\\s]*)';
}

function normalizeFsPath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export function isRelativeReferenceMatch(
  matchText: string,
  matchFilePath: string,
  targetFilePath: string,
  config: RelativeSearchConfig
): boolean {
  const cleaned = matchText.trim();
  if (!cleaned.startsWith('./') && !cleaned.startsWith('../')) {
    return false;
  }

  if (config.maxDepth !== undefined && config.maxDepth !== null) {
    const depth = cleaned.match(/\.\.\//g)?.length ?? 0;
    if (depth > config.maxDepth) {
      return false;
    }
  }

  const resolvedMatch = normalizeFsPath(path.resolve(path.dirname(matchFilePath), cleaned));
  const resolvedTarget = normalizeFsPath(targetFilePath);

  switch (config.matchTarget) {
    case 'parentDir':
      return resolvedMatch === normalizeFsPath(path.dirname(targetFilePath));
    case 'fileName':
      return resolvedMatch === resolvedTarget;
    case 'fileStem': {
      const ext = path.extname(targetFilePath);
      const targetNoExt = ext ? normalizeFsPath(targetFilePath.slice(0, -ext.length)) : resolvedTarget;
      return resolvedMatch === resolvedTarget || resolvedMatch === targetNoExt;
    }
  }
}
