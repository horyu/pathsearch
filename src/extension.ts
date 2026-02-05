import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { initializeOutputChannel, logError, logInfo, logWarn } from './logging';
import { getMatchingRules } from './lib/rules';
import { buildRelativeSearchQuery, isRelativeMatchTarget } from './lib/relativeSearch';
import { transformPath } from './lib/transformPath';
import { searchWithRipgrep } from './ripgrepRunner';
import type { RuleConfig } from './lib/types';

let workspaceState: vscode.Memento | undefined;

function getRelativeFilePath(editor: vscode.TextEditor, workspaceFolder: vscode.WorkspaceFolder): string {
  const filePath = editor.document.uri.fsPath;
  return path.relative(workspaceFolder.uri.fsPath, filePath);
}

async function getRipgrepPath(workspaceFolder?: vscode.WorkspaceFolder): Promise<string> {
  const config = workspaceFolder
    ? vscode.workspace.getConfiguration('pathsearch', workspaceFolder.uri)
    : vscode.workspace.getConfiguration('pathsearch');
  const customPath = config.get<string>('ripgrepPath', '');
  const inspected = config.inspect<string>('ripgrepPath');
  const hasWorkspaceRipgrepPath = Boolean(inspected?.workspaceValue ?? inspected?.workspaceFolderValue);
  const confirmationKey = workspaceFolder
    ? `pathsearch.confirmedWorkspaceRipgrepPath:${workspaceFolder.uri.toString()}`
    : 'pathsearch.confirmedWorkspaceRipgrepPath';
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
    if (!vscode.workspace.isTrusted) {
      const message = 'Workspace is not trusted. Trust the workspace or move ripgrepPath to user settings.';
      logWarn(message);
      throw new Error(message);
    }

    const confirm = await vscode.window.showWarningMessage(
      `PathSearch is configured to run a workspace-defined ripgrepPath: ${customPath}. Only proceed if you trust this workspace.`,
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

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder found for the active file');
    return;
  }

  const config = vscode.workspace.getConfiguration('pathsearch', workspaceFolder.uri);
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
  const workspaceName = workspaceFolder.name || path.basename(workspaceFolder.uri.fsPath);
  const matchingRules = getMatchingRules(rules, relativeFilePath, workspaceName);

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
    rgPath = await getRipgrepPath(workspaceFolder);
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

      let searchQuery: string | null;
      try {
        searchQuery = transformPath(transform, relativeFilePath);
      } catch (error) {
        logError('Transform failed', error);
        errors.push(error instanceof Error ? error.message : String(error));
        continue;
      }
      if (searchQuery === null) {
        logInfo(`Transform skipped (no match): ${transform.extractFrom}`);
        continue;
      }

      const useRegex = transform.searchAsRegex || false;
      logInfo(`Transformed query: ${searchQuery}, regex: ${useRegex}`);

      try {
        const matches = await searchWithRipgrep({
          searchQuery,
          isRegex: useRegex,
          maxResults: remaining,
          rgPath,
          workspaceRoot,
          searchScope: transform.searchScope,
          filePattern: transform.filePattern
        });
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
          const matches = await searchWithRipgrep({
            searchQuery,
            isRegex: true,
            maxResults: remaining,
            rgPath,
            workspaceRoot,
            searchScope: selectedRule.relative.searchScope,
            filePattern: selectedRule.relative.filePattern,
            relativeOptions: { targetFilePath, config: selectedRule.relative }
          });
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
      if (errors.length === 1) {
        vscode.window.showErrorMessage(`Search failed: ${errors[0]}`);
      } else {
        vscode.window.showErrorMessage('Search failed with multiple errors. See Output \u2192 PathSearch for details.');
      }
    } else {
      vscode.window.showWarningMessage('No matches found.');
    }
    return;
  }

  const position = editor.selection.active;
  await vscode.commands.executeCommand('editor.action.showReferences', editor.document.uri, position, locations);
  const closeDisposable = vscode.window.onDidChangeActiveTextEditor(() => {
    void vscode.commands.executeCommand('closeReferenceSearch');
    closeDisposable.dispose();
  });

  const limitReached = locations.length >= maxResults;
  if (limitReached) {
    vscode.window.showInformationMessage(`Found ${locations.length}+ match(es) (limit reached)`);
  }
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
