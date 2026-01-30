import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import { minimatch } from 'minimatch';
import * as path from 'path';
import * as vscode from 'vscode';

interface TransformConfig {
  name: string;
  applyTo?: string;
  extractFrom: string;
  searchFor: string;
  description?: string;
  searchAsRegex?: boolean;
  searchIn?: string | string[];
}

function getRelativeFilePath(editor: vscode.TextEditor, workspaceFolder: vscode.WorkspaceFolder): string {
  const filePath = editor.document.uri.fsPath;
  return path.relative(workspaceFolder.uri.fsPath, filePath);
}

function transformPath(config: TransformConfig, relativeFilePath: string): string {
  const targetText = relativeFilePath;

  try {
    const regex = new RegExp(config.extractFrom);
    const match = targetText.match(regex);

    if (!match) {
      throw new Error(`Pattern "${config.extractFrom}" did not match "${targetText}"`);
    }

    let result = config.searchFor;
    match.forEach((group, index) => {
      result = result.replace(new RegExp(`\\$${index}`, 'g'), group || '');
    });

    return result;
  } catch (error) {
    throw new Error(`Transform failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function getMatchingTransforms(configs: TransformConfig[], relativePath: string): TransformConfig[] {
  return configs.filter(config => {
    if (!config.applyTo) {
      return true;
    }
    return minimatch(relativePath, config.applyTo);
  });
}

async function executeSearch(searchQuery: string, isRegex: boolean = false): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.findInFiles', {
    query: searchQuery,
    triggerSearch: true,
    isRegex: isRegex
  });
}

function getRipgrepPath(): string {
  const config = vscode.workspace.getConfiguration('pathsearch');
  const customPath = config.get<string>('ripgrepPath', '');

  if (!customPath) {
    return 'rg';
  }

  if (!/^[a-zA-Z0-9\-_/.:\\]+$/.test(customPath)) {
    console.error(`PathSearch: Invalid ripgrep path contains unsafe characters: ${customPath}`);
    throw new Error('Invalid ripgrep path: contains unsafe characters');
  }

  try {
    const resolvedPath = path.resolve(customPath);

    if (!fs.existsSync(resolvedPath)) {
      console.error(`PathSearch: ripgrep path does not exist: ${resolvedPath}`);
      throw new Error(`ripgrep path does not exist: ${resolvedPath}`);
    }

    if (process.platform !== 'win32') {
      try {
        fs.accessSync(resolvedPath, fs.constants.X_OK);
      } catch {
        console.error(`PathSearch: ripgrep path is not executable: ${resolvedPath}`);
        throw new Error(`ripgrep path is not executable: ${resolvedPath}`);
      }
    }

    return resolvedPath;
  } catch (error) {
    if (error instanceof Error && error.message.includes('PathSearch')) {
      throw error;
    }
    console.error(`PathSearch: Failed to validate ripgrep path:`, error);
    throw new Error('Failed to validate ripgrep path');
  }
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
          console.error(`PathSearch: ripgrep output exceeded size limit`);
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
          console.warn(
            `PathSearch: Command succeeded but output does not contain "ripgrep": ${output.substring(0, 100)}`
          );
        }
        resolve(isRipgrep);
      });

      proc.on('error', () => {
        resolve(false);
      });
    } catch (error) {
      console.error(`PathSearch: Failed to check ripgrep:`, error);
      resolve(false);
    }
  });
}

async function searchWithRipgrep(
  searchQuery: string,
  isRegex: boolean,
  maxResults: number,
  rgPath: string,
  applyTo?: string,
  workspaceRoot?: string,
  searchIn?: string | string[]
): Promise<vscode.Location[]> {
  const locations: vscode.Location[] = [];

  if (!workspaceRoot) {
    return locations;
  }

  console.log(`PathSearch: Using ripgrep for search`);

  const args: string[] = [
    '--json',
    '--line-number',
    '--column',
    '--max-count',
    '100',
    '--max-filesize',
    '10M',
    '--stats'
  ];

  if (!isRegex) {
    args.push('--fixed-strings');
  }

  if (applyTo && applyTo !== '**/*') {
    if (!/^[\w*.\-/{}，,]+$/.test(applyTo)) {
      console.error(`PathSearch: Invalid file pattern: ${applyTo}`);
      throw new Error('Invalid file pattern');
    }
    const simplifiedPattern = applyTo.replace(/^\*\*\//, '');
    args.push('--glob', simplifiedPattern);
  }

  args.push(searchQuery);

  const searchPaths = searchIn ? (Array.isArray(searchIn) ? searchIn : [searchIn]) : ['.'];
  for (const p of searchPaths) {
    if (p.includes('..') || path.isAbsolute(p)) {
      console.error(`PathSearch: Invalid search path: ${p}`);
      throw new Error('Invalid search path');
    }
  }

  const hasGlobPattern = searchPaths.some(p => p.includes('*'));

  if (hasGlobPattern) {
    const expandedPaths: string[] = [];
    const globPatterns: string[] = [];

    for (const p of searchPaths) {
      if (p.includes('*')) {
        const parts = p.split('*');
        const basePath = parts[0];
        const suffix = parts.slice(1).join('*');

        if (!expandedPaths.includes(basePath)) {
          expandedPaths.push(basePath);
        }

        const globPattern = '*' + suffix + (suffix.endsWith('/') ? '**' : '/**');
        globPatterns.push(globPattern);
      } else {
        expandedPaths.push(p);
      }
    }

    expandedPaths.forEach(p => args.push(p));
    globPatterns.forEach(pattern => {
      args.push('--glob', pattern);
    });

    console.log(`PathSearch: Using glob patterns: ${globPatterns.join(', ')}`);
  } else {
    searchPaths.forEach(p => args.push(p));
  }

  console.log(
    `PathSearch: Executing in ${workspaceRoot}: ${rgPath} ${args.map(a => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`
  );

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
      console.error(`PathSearch: ripgrep stderr: ${chunk}`);
    });

    proc.on('close', (code: number | null) => {
      if (code !== 0 && code !== 1) {
        console.error(`PathSearch: Ripgrep exited with code ${code}`);
        console.error(`PathSearch: stderr: ${stderr.substring(0, 200)}`);
        reject(new Error(`Ripgrep search failed`));
        return;
      }

      if (code === 1) {
        console.log(`PathSearch: Ripgrep found no matches`);
        resolve(locations);
        return;
      }

      const lines = stdout
        .trim()
        .split('\n')
        .filter(line => line.length > 0);
      console.log(`PathSearch: Parsing ${lines.length} lines of ripgrep output`);

      for (const line of lines) {
        if (locations.length >= maxResults) {
          break;
        }

        try {
          const result = JSON.parse(line);

          if (result.type === 'match' && result.data) {
            const data = result.data;

            const relativePath = data.path.text;
            if (relativePath.includes('..') || path.isAbsolute(relativePath)) {
              console.warn(`PathSearch: Suspicious path detected: ${relativePath}`);
              continue;
            }

            const filePath = path.resolve(workspaceRoot, relativePath);

            if (!filePath.startsWith(workspaceRoot)) {
              console.warn(`PathSearch: Path outside workspace: ${filePath}`);
              continue;
            }

            const uri = vscode.Uri.file(filePath);

            const line = (data.line_number || 1) - 1;
            const column = data.submatches?.[0]?.start || 0;
            const endColumn = data.submatches?.[0]?.end || column + 1;

            const range = new vscode.Range(new vscode.Position(line, column), new vscode.Position(line, endColumn));

            locations.push(new vscode.Location(uri, range));
          }
        } catch {
          // Ignore JSON parse errors (ripgrep warnings, etc.)
        }
      }

      console.log(`PathSearch: Ripgrep found ${locations.length} matches`);
      resolve(locations);
    });

    proc.on('error', (error: Error) => {
      console.error(`PathSearch: Failed to spawn ripgrep:`, error.message);
      reject(new Error('Failed to execute ripgrep'));
    });
  });
}

async function searchInWorkspace(
  searchQuery: string,
  isRegex: boolean = false,
  maxResults: number = 100,
  applyTo?: string,
  searchIn?: string | string[]
): Promise<vscode.Location[]> {
  console.log(`PathSearch: Starting search for "${searchQuery}" (regex: ${isRegex}, pattern: ${applyTo || '**/*'})`);

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const workspaceRoot = workspaceFolder?.uri.fsPath;

  if (!workspaceRoot) {
    throw new Error('No workspace folder open');
  }

  let rgPath: string;
  try {
    rgPath = getRipgrepPath();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to validate ripgrep path';
    vscode.window.showErrorMessage(`PathSearch: ${message}`);
    throw error;
  }

  const hasRipgrep = await checkRipgrepAvailable(rgPath);

  if (!hasRipgrep) {
    const installUrl = 'https://github.com/BurntSushi/ripgrep#installation';
    const result = await vscode.window.showErrorMessage(
      'PathSearch requires ripgrep to be installed. Please install ripgrep and restart VS Code.',
      'Open Installation Guide',
      'Configure ripgrep Path'
    );

    if (result === 'Open Installation Guide') {
      vscode.env.openExternal(vscode.Uri.parse(installUrl));
    } else if (result === 'Configure ripgrep Path') {
      vscode.commands.executeCommand('workbench.action.openSettings', 'pathsearch.ripgrepPath');
    }

    throw new Error('ripgrep not available');
  }

  return await searchWithRipgrep(searchQuery, isRegex, maxResults, rgPath, applyTo, workspaceRoot, searchIn);
}

export function activate(context: vscode.ExtensionContext) {
  try {
    const rgPath = getRipgrepPath();
    checkRipgrepAvailable(rgPath)
      .then(available => {
        if (!available) {
          const installUrl = 'https://github.com/BurntSushi/ripgrep#installation';
          vscode.window
            .showWarningMessage(
              'PathSearch requires ripgrep. Please install ripgrep for full functionality.',
              'Open Installation Guide',
              'Configure ripgrep Path',
              'Dismiss'
            )
            .then(result => {
              if (result === 'Open Installation Guide') {
                vscode.env.openExternal(vscode.Uri.parse(installUrl));
              } else if (result === 'Configure ripgrep Path') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'pathsearch.ripgrepPath');
              }
            });
        }
      })
      .catch(error => {
        console.error('PathSearch: Failed to check ripgrep on activation:', error);
        vscode.window.showErrorMessage(
          `PathSearch: ${error instanceof Error ? error.message : 'Failed to validate ripgrep path'}`
        );
      });
  } catch (error) {
    console.error('PathSearch: Failed to get ripgrep path on activation:', error);
    vscode.window.showErrorMessage(
      `PathSearch: ${error instanceof Error ? error.message : 'Failed to validate ripgrep path'}`
    );
  }

  // Find Usages: 検索パネルで結果を表示
  context.subscriptions.push(
    vscode.commands.registerCommand('pathsearch.search', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
      }

      const config = vscode.workspace.getConfiguration('pathsearch');
      const transforms = config.get<TransformConfig[]>('transforms', []);
      const autoDetect = config.get<boolean>('autoDetect', true);

      if (transforms.length === 0) {
        vscode.window.showWarningMessage('No transforms configured. Please add transforms in settings.');
        return;
      }

      const relativeFilePath = getRelativeFilePath(editor, workspaceFolder);
      const matchingTransforms = getMatchingTransforms(transforms, relativeFilePath);

      if (matchingTransforms.length === 0) {
        vscode.window.showWarningMessage(`No transform pattern matches "${relativeFilePath}"`);
        return;
      }

      let selectedTransform: TransformConfig;

      if (autoDetect && matchingTransforms.length === 1) {
        selectedTransform = matchingTransforms[0];
      } else {
        const picks = matchingTransforms.map(t => ({
          label: t.name,
          description: t.description || `${t.extractFrom} → ${t.searchFor}`,
          transform: t
        }));

        const selected = await vscode.window.showQuickPick(picks, {
          placeHolder: 'Select transform pattern'
        });

        if (!selected) {
          return;
        }

        selectedTransform = selected.transform;
      }

      try {
        const searchQuery = transformPath(selectedTransform, relativeFilePath);
        vscode.window.showInformationMessage(`Searching for: ${searchQuery}`);
        await executeSearch(searchQuery, selectedTransform.searchAsRegex || false);
      } catch (error) {
        console.error(`PathSearch: Transform failed:`, error);
        vscode.window.showErrorMessage('Transform failed. Please check your configuration.');
      }
    })
  );

  // Peek Usages (メインコマンド): Peekビューで結果を表示
  context.subscriptions.push(
    vscode.commands.registerCommand('pathsearch.peekSearch', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
      }

      const config = vscode.workspace.getConfiguration('pathsearch');
      const transforms = config.get<TransformConfig[]>('transforms', []);
      const autoDetect = config.get<boolean>('autoDetect', true);

      if (transforms.length === 0) {
        vscode.window.showWarningMessage('No transforms configured. Please add transforms in settings.');
        return;
      }

      const relativeFilePath = getRelativeFilePath(editor, workspaceFolder);
      const matchingTransforms = getMatchingTransforms(transforms, relativeFilePath);

      if (matchingTransforms.length === 0) {
        vscode.window.showWarningMessage(`No transform pattern matches "${relativeFilePath}"`);
        return;
      }

      let selectedTransform: TransformConfig;

      if (autoDetect && matchingTransforms.length === 1) {
        selectedTransform = matchingTransforms[0];
      } else {
        const picks = matchingTransforms.map(t => ({
          label: t.name,
          description: t.description || `${t.extractFrom} → ${t.searchFor}`,
          transform: t
        }));

        const selected = await vscode.window.showQuickPick(picks, {
          placeHolder: 'Select transform pattern'
        });

        if (!selected) {
          return;
        }

        selectedTransform = selected.transform;
      }

      try {
        const searchQuery = transformPath(selectedTransform, relativeFilePath);
        console.log(`PathSearch: Transformed query: ${searchQuery}, regex: ${selectedTransform.searchAsRegex}`);

        vscode.window.showInformationMessage(`Searching for: ${searchQuery}`);

        const maxResults = config.get<number>('maxResults', 100);
        const locations = await searchInWorkspace(
          searchQuery,
          selectedTransform.searchAsRegex || false,
          maxResults,
          selectedTransform.applyTo,
          selectedTransform.searchIn
        );

        console.log(`PathSearch: Found ${locations.length} locations`);

        if (locations.length === 0) {
          vscode.window.showWarningMessage(`No matches found for: ${searchQuery}`);
          return;
        }

        // 現在のカーソル位置を取得
        const position = editor.selection.active;

        console.log(`PathSearch: Showing peek view at position ${position.line}:${position.character}`);

        // Peekビューで結果を表示
        await vscode.commands.executeCommand('editor.action.showReferences', editor.document.uri, position, locations);

        const limitReached = locations.length >= maxResults;
        const message = limitReached
          ? `Found ${locations.length}+ match(es) (limit reached)`
          : `Found ${locations.length} match(es)`;
        vscode.window.showInformationMessage(message);
      } catch (error) {
        console.error(`PathSearch: Error in peekSearch:`, error);
        vscode.window.showErrorMessage('Search failed. Please check the console for details.');
      }
    })
  );

  // Find Usages...: 常にパターンピッカーを表示
  context.subscriptions.push(
    vscode.commands.registerCommand('pathsearch.searchWithPicker', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
      }

      const config = vscode.workspace.getConfiguration('pathsearch');
      const transforms = config.get<TransformConfig[]>('transforms', []);

      if (transforms.length === 0) {
        vscode.window.showWarningMessage('No transforms configured. Please add transforms in settings.');
        return;
      }

      const relativeFilePath = getRelativeFilePath(editor, workspaceFolder);
      const picks = transforms.map(t => ({
        label: t.name,
        description: t.description || `${t.extractFrom} → ${t.searchFor}`,
        detail: t.applyTo ? `Pattern: ${t.applyTo}` : 'No pattern filter',
        transform: t
      }));

      const selected = await vscode.window.showQuickPick(picks, {
        placeHolder: 'Select transform pattern'
      });

      if (!selected) {
        return;
      }

      try {
        const searchQuery = transformPath(selected.transform, relativeFilePath);
        vscode.window.showInformationMessage(`Searching for: ${searchQuery}`);
        await executeSearch(searchQuery, selected.transform.searchAsRegex || false);
      } catch (error) {
        console.error(`PathSearch: Transform failed:`, error);
        vscode.window.showErrorMessage('Transform failed. Please check your configuration.');
      }
    })
  );
}

export function deactivate() {}
