import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { initializeOutputChannel, logError, logInfo, logWarn } from './lib/logging';
import { getMatchingRules } from './lib/rules';
import { buildRelativeSearchQuery, isRelativeMatchTarget, isRelativeReferenceMatch } from './lib/relativeSearch';
import { buildRipgrepArgs } from './lib/ripgrepArgs';
import { parseRipgrepMatches } from './lib/ripgrepParse';
import { transformPath } from './lib/transformPath';
import type { RelativeSearchConfig, RuleConfig } from './lib/types';

let workspaceState: vscode.Memento | undefined;

function getRelativeFilePath(editor: vscode.TextEditor, workspaceFolder: vscode.WorkspaceFolder): string {
  const filePath = editor.document.uri.fsPath;
  return path.relative(workspaceFolder.uri.fsPath, filePath);
}

async function getRipgrepPath(): Promise<string> {
  const config = vscode.workspace.getConfiguration('pathsearch');
  const customPath = config.get<string>('ripgrepPath', '');
  const inspected = config.inspect<string>('ripgrepPath');
  const hasWorkspaceRipgrepPath = Boolean(inspected?.workspaceValue ?? inspected?.workspaceFolderValue);
  const confirmationKey = 'pathsearch.confirmedWorkspaceRipgrepPath';
  const confirmedPath = workspaceState?.get<string>(confirmationKey);

  if (!customPath) {
    const hasPathRipgrep = await checkRipgrepAvailable('rg');
    if (hasPathRipgrep) {
      return 'rg';
    }

    const bundledPath = getBundledRipgrepPath(vscode.env.appRoot);
    if (bundledPath) {
      return bundledPath;
    }

    throw new Error('Ripgrep not found in PATH or VS Code bundle');
  }

  if (customPath && hasWorkspaceRipgrepPath && confirmedPath !== customPath) {
    const confirm = await vscode.window.showWarningMessage(
      'PathSearch is configured to run a workspace-defined ripgrepPath. Only proceed if you trust this workspace.',
      'Run Anyway',
      'Cancel'
    );
    if (confirm !== 'Run Anyway') {
      logWarn('Aborted running workspace-defined ripgrepPath.');
      throw new Error('Cancelled running workspace-defined ripgrepPath');
    }
    await workspaceState?.update(confirmationKey, customPath);
  }

  if (!/^[a-zA-Z0-9\-_/.:\\]+$/.test(customPath)) {
    logError(`Invalid ripgrep path contains unsafe characters: ${customPath}`);
    throw new Error('Invalid ripgrep path: contains unsafe characters');
  }

  try {
    const resolvedPath = path.resolve(customPath);

    if (!fs.existsSync(resolvedPath)) {
      logError(`ripgrep path does not exist: ${resolvedPath}`);
      throw new Error(`ripgrep path does not exist: ${resolvedPath}`);
    }

    if (process.platform !== 'win32') {
      try {
        fs.accessSync(resolvedPath, fs.constants.X_OK);
      } catch {
        logError(`ripgrep path is not executable: ${resolvedPath}`);
        throw new Error(`ripgrep path is not executable: ${resolvedPath}`);
      }
    }

    return resolvedPath;
  } catch (error) {
    if (error instanceof Error && error.message.includes('PathSearch')) {
      throw error;
    }
    logError('Failed to validate ripgrep path', error);
    throw new Error('Failed to validate ripgrep path');
  }
}

function getBundledRipgrepPath(appRoot: string): string | undefined {
  const binName = process.platform === 'win32' ? 'rg.exe' : 'rg';
  const candidate = path.join(appRoot, 'node_modules/@vscode/ripgrep/bin', binName);
  return fs.existsSync(candidate) ? candidate : undefined;
}

async function checkRipgrepAvailable(rgPath: string): Promise<boolean> {
  return new Promise(resolve => {
    try {
      const proc = spawn(rgPath, ['--version'], {
        env: { PATH: process.env.PATH },
        timeout: 1000
      });

      if (!proc.stdout) {
        resolve(false);
        return;
      }

      let output = '';
      const maxOutput = 1024;

      proc.stdout.on('data', (data: Buffer) => {
        output += data.toString();
        if (output.length > maxOutput) {
          logError('ripgrep output exceeded size limit');
          proc.kill();
          resolve(false);
        }
      });

      proc.on('close', code => {
        if (code !== 0) {
          resolve(false);
          return;
        }

        const isRipgrep = output.toLowerCase().includes('ripgrep');
        if (!isRipgrep) {
          logWarn(`Command succeeded but output does not contain "ripgrep": ${output.substring(0, 100)}`);
        }
        resolve(isRipgrep);
      });

      proc.on('error', () => {
        resolve(false);
      });
    } catch (error) {
      logError('Failed to check ripgrep', error);
      resolve(false);
    }
  });
}

async function searchWithRipgrep(
  searchQuery: string,
  isRegex: boolean,
  maxResults: number,
  rgPath: string,
  workspaceRoot?: string,
  searchScope?: string | string[],
  filePattern?: string | string[],
  relativeOptions?: { targetFilePath: string; config: RelativeSearchConfig }
): Promise<vscode.Location[]> {
  const locations: vscode.Location[] = [];

  if (!workspaceRoot) {
    return locations;
  }

  logInfo(`Search start: "${searchQuery}" (regex: ${isRegex})`);

  const searchPaths = searchScope
    ? (Array.isArray(searchScope) ? searchScope : [searchScope]).map(scope => (scope === '' ? '.' : scope))
    : ['.'];
  for (const p of searchPaths) {
    if (p.includes('..') || path.isAbsolute(p) || p.includes('*')) {
      logError(`Invalid search path: ${p}`);
      throw new Error('Invalid search path');
    }
  }

  const filePatterns = filePattern ? (Array.isArray(filePattern) ? filePattern : [filePattern]) : [];
  for (const pattern of filePatterns) {
    if (pattern.includes('--')) {
      logError(`Invalid file pattern contains "--": ${pattern}`);
      throw new Error('Invalid file pattern');
    }
    if (!/^[\w*.\-/{}!,]+$/.test(pattern)) {
      logError(`Invalid file pattern: ${pattern}`);
      throw new Error('Invalid file pattern');
    }
  }

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

async function runRuleSearch(options: { forcePicker: boolean; showPickerOnMultiple: boolean }): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor');
    return;
  }
  if (editor.document.uri.scheme !== 'file') {
    vscode.window.showWarningMessage('Please run PathSearch from a file editor.');
    return;
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  const config = vscode.workspace.getConfiguration('pathsearch');
  const rules = config.get<RuleConfig[]>('rules', []);
  if (rules.length === 0) {
    vscode.window.showWarningMessage('No rules configured. Please add rules in settings.');
    return;
  }
  const missingNameIndex = rules.findIndex(rule => !rule.name || rule.name.trim().length === 0);
  if (missingNameIndex !== -1) {
    const message = `Invalid rule at index ${missingNameIndex}: "name" is required.`;
    logError(message);
    vscode.window.showErrorMessage(message);
    return;
  }

  const relativeFilePath = getRelativeFilePath(editor, workspaceFolder);
  const matchingRules = getMatchingRules(rules, relativeFilePath);

  if (matchingRules.length === 0) {
    vscode.window.showWarningMessage(`No rule matches "${relativeFilePath}"`);
    return;
  }

  let selectedRule: RuleConfig;
  const shouldShowPicker = options.forcePicker || (matchingRules.length > 1 && options.showPickerOnMultiple);
  if (shouldShowPicker) {
    const picks = matchingRules.map(rule => ({
      label: rule.name,
      detail: `Pattern: ${rule.match}`,
      rule
    }));

    const selected = await vscode.window.showQuickPick(picks, {
      placeHolder: 'Select rule'
    });

    if (!selected) {
      return;
    }

    selectedRule = selected.rule;
  } else {
    selectedRule = matchingRules[0];
  }

  const hasTransforms = Boolean(selectedRule.transforms && selectedRule.transforms.length > 0);
  const hasRelative = Boolean(selectedRule.relative);
  if (!hasTransforms && !hasRelative) {
    vscode.window.showWarningMessage('No transforms or relative search configured in the selected rule.');
    return;
  }

  const workspaceRoot = workspaceFolder.uri.fsPath;
  let rgPath: string;
  try {
    rgPath = await getRipgrepPath();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to validate ripgrep path';
    vscode.window.showErrorMessage(`PathSearch: ${message}`);
    return;
  }

  const hasRipgrep = await checkRipgrepAvailable(rgPath);
  if (!hasRipgrep) {
    const result = await vscode.window.showErrorMessage(
      'PathSearch requires ripgrep to be installed. Please install ripgrep and restart VS Code.',
      'Open Installation Guide',
      'Configure ripgrep Path'
    );

    if (result === 'Open Installation Guide') {
      const installUrl = 'https://github.com/BurntSushi/ripgrep#installation';
      vscode.env.openExternal(vscode.Uri.parse(installUrl));
    } else if (result === 'Configure ripgrep Path') {
      vscode.commands.executeCommand('workbench.action.openSettings', 'pathsearch.ripgrepPath');
    }

    return;
  }

  const maxResults = selectedRule.maxResults ?? config.get<number>('maxResults', 100);
  const locations: vscode.Location[] = [];
  const errors: string[] = [];

  if (hasTransforms && selectedRule.transforms) {
    for (const transform of selectedRule.transforms) {
      const remaining = maxResults - locations.length;
      if (remaining <= 0) {
        break;
      }

      let searchQuery: string;
      try {
        searchQuery = transformPath(transform, relativeFilePath);
      } catch (error) {
        logError('Transform failed', error);
        errors.push(error instanceof Error ? error.message : String(error));
        continue;
      }

      const useRegex = transform.searchAsRegex || false;
      logInfo(`Transformed query: ${searchQuery}, regex: ${useRegex}`);

      try {
        const matches = await searchWithRipgrep(
          searchQuery,
          useRegex,
          remaining,
          rgPath,
          workspaceRoot,
          transform.searchScope,
          transform.filePattern
        );
        locations.push(...matches);
      } catch (error) {
        logError('Search failed', error);
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  if (hasRelative && selectedRule.relative) {
    const remaining = maxResults - locations.length;
    if (remaining > 0) {
      if (!isRelativeMatchTarget(selectedRule.relative.matchTarget)) {
        const message = `Invalid relative.matchTarget: ${selectedRule.relative.matchTarget}`;
        logError(message);
        errors.push(message);
      } else {
        try {
          const searchQuery = buildRelativeSearchQuery(relativeFilePath, selectedRule.relative);
          logInfo(`Relative search query: ${searchQuery}`);
          const targetFilePath = path.resolve(workspaceRoot, relativeFilePath);
          const matches = await searchWithRipgrep(
            searchQuery,
            true,
            remaining,
            rgPath,
            workspaceRoot,
            selectedRule.relative.searchScope,
            selectedRule.relative.filePattern,
            { targetFilePath, config: selectedRule.relative }
          );
          locations.push(...matches);
        } catch (error) {
          logError('Relative search failed', error);
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
    }
  }

  if (locations.length === 0) {
    if (errors.length > 0) {
      vscode.window.showErrorMessage('Search failed. See Output \u2192 PathSearch for details.');
    } else {
      vscode.window.showWarningMessage('No matches found.');
    }
    return;
  }

  const position = editor.selection.active;
  await vscode.commands.executeCommand('editor.action.showReferences', editor.document.uri, position, locations);

  const limitReached = locations.length >= maxResults;
  const message = limitReached
    ? `Found ${locations.length}+ match(es) (limit reached)`
    : `Found ${locations.length} match(es)`;
  vscode.window.showInformationMessage(message);
}

export function activate(context: vscode.ExtensionContext) {
  initializeOutputChannel(context);
  workspaceState = context.workspaceState;

  // Find References: respects showPickerOnMultiple
  context.subscriptions.push(
    vscode.commands.registerCommand('pathsearch.search', async () => {
      const config = vscode.workspace.getConfiguration('pathsearch');
      const showPickerOnMultiple = config.get<boolean>('showPickerOnMultiple', false);
      await runRuleSearch({ forcePicker: false, showPickerOnMultiple });
    })
  );

  // Find References...: always show picker
  context.subscriptions.push(
    vscode.commands.registerCommand('pathsearch.searchWithPicker', async () => {
      await runRuleSearch({ forcePicker: true, showPickerOnMultiple: true });
    })
  );
}

export function deactivate() {}
