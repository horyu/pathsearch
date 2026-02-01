import { spawn, type ChildProcess } from 'child_process';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { logError, logInfo, logWarn } from './logging';
import { buildRipgrepArgs } from './ripgrepArgs';
import { parseRipgrepMatches } from './ripgrepParse';
import type { RelativeSearchConfig } from './types';
import { isRelativeReferenceMatch } from './relativeSearch';
import {
  normalizeFilePatterns,
  normalizeSearchScope,
  validateFilePatterns,
  validateSearchScope
} from './ripgrepValidation';

type SearchOptions = {
  searchQuery: string;
  isRegex: boolean;
  maxResults: number;
  rgPath: string;
  workspaceRoot?: string;
  searchScope?: string | string[];
  filePattern?: string | string[];
  relativeOptions?: { targetFilePath: string; config: RelativeSearchConfig };
};

export async function searchWithRipgrep(options: SearchOptions): Promise<vscode.Location[]> {
  const locations: vscode.Location[] = [];
  const { searchQuery, isRegex, maxResults, rgPath, workspaceRoot, searchScope, filePattern, relativeOptions } =
    options;

  if (!workspaceRoot) {
    return locations;
  }

  logInfo(`Search start: "${searchQuery}" (regex: ${isRegex})`);

  const searchPaths = normalizeSearchScope(searchScope);
  validateSearchScope(searchPaths);

  const filePatterns = normalizeFilePatterns(filePattern);
  validateFilePatterns(filePatterns);

  const args = buildRipgrepArgs({
    searchQuery,
    isRegex,
    maxResults,
    searchScope: searchPaths,
    filePattern: filePatterns,
    includeStats: true,
    maxFileSize: '10M'
  });

  logInfo(`Executing in ${workspaceRoot}: ${rgPath} ${args.map(a => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`);

  return new Promise((resolve, reject) => {
    const proc: ChildProcess = spawn(rgPath, args, {
      cwd: workspaceRoot
    });

    let stdout = '';
    let stderr = '';
    let dataSize = 0;
    const maxDataSize = 5 * 1024 * 1024; // 5MB制限

    if (!proc.stdout || !proc.stderr) {
      reject(new Error('Failed to create process streams'));
      return;
    }

    proc.stdout.on('data', (data: Buffer) => {
      dataSize += data.length;
      if (dataSize > maxDataSize) {
        proc.kill();
        reject(new Error('Output size exceeded'));
        return;
      }
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;
      logError(`ripgrep stderr: ${chunk}`);
    });

    proc.on('close', (code: number | null) => {
      if (code !== 0 && code !== 1) {
        logError(`Ripgrep exited with code ${code}`);
        if (stderr) {
          logError(`Ripgrep stderr: ${stderr.substring(0, 200)}`);
        }
        reject(new Error('Ripgrep search failed'));
        return;
      }

      if (code === 1) {
        logInfo('Search complete: 0 matches');
        resolve(locations);
        return;
      }

      const matches = parseRipgrepMatches(stdout);

      for (const match of matches) {
        if (locations.length >= maxResults) {
          break;
        }

        const relativePath = match.relativePath;
        if (relativePath.includes('..') || path.isAbsolute(relativePath)) {
          logWarn(`Suspicious path detected: ${relativePath}`);
          continue;
        }

        const filePath = path.resolve(workspaceRoot, relativePath);

        if (!filePath.startsWith(workspaceRoot)) {
          logWarn(`Path outside workspace: ${filePath}`);
          continue;
        }

        if (
          relativeOptions &&
          !isRelativeReferenceMatch(match.matchText, filePath, relativeOptions.targetFilePath, relativeOptions.config)
        ) {
          continue;
        }

        const uri = vscode.Uri.file(filePath);
        const range = new vscode.Range(
          new vscode.Position(match.lineNumber, match.column),
          new vscode.Position(match.lineNumber, match.endColumn)
        );

        locations.push(new vscode.Location(uri, range));
      }

      logInfo(`Search complete: ${locations.length} matches`);
      resolve(locations);
    });

    proc.on('error', (error: Error) => {
      logError('Failed to spawn ripgrep', error);
      reject(new Error('Failed to execute ripgrep'));
    });
  });
}
