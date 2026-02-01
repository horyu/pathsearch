import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | undefined;

export function initializeOutputChannel(context: vscode.ExtensionContext): void {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('PathSearch');
    context.subscriptions.push(outputChannel);
  }
}

function formatLogError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
}

function appendLogLine(level: 'INFO' | 'WARN' | 'ERROR', message: string, error?: unknown): void {
  if (!outputChannel) {
    console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](`PathSearch: ${message}`, error ?? '');
    return;
  }

  const prefix = `[${level}] PathSearch:`;
  if (error !== undefined) {
    outputChannel.appendLine(`${prefix} ${message} ${formatLogError(error)}`);
    return;
  }

  outputChannel.appendLine(`${prefix} ${message}`);
}

export const logInfo = (message: string): void => appendLogLine('INFO', message);
export const logWarn = (message: string): void => appendLogLine('WARN', message);
export const logError = (message: string, error?: unknown): void => appendLogLine('ERROR', message, error);
