// Codex環境ではrg実行を含む統合テストが制限されるため、ユーザー環境での実行を前提にするブリッジ。
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const tmpDir = path.join(repoRoot, 'tmp');
const requestPath = path.join(tmpDir, 'test.request.json');
const resultPath = path.join(tmpDir, 'test.result.json');
const logPath = path.join(tmpDir, 'test.log');

const testCommand = 'pnpm';
const testArgs = ['test'];
const testCommandLabel = `${testCommand} ${testArgs.join(' ')}`.trim();

mkdirSync(tmpDir, { recursive: true });

let running = false;
let pending = false;
let lastRequestId = '';

function safeReadRequest() {
  try {
    const raw = readFileSync(requestPath, 'utf8');
    const normalized = raw.replace(/^\uFEFF/, '');
    const data = JSON.parse(normalized);
    return typeof data === 'object' && data ? data : null;
  } catch {
    return null;
  }
}

function writeResult(payload) {
  const json = JSON.stringify(payload, null, 2) + '\n';
  writeFileSync(resultPath, json, 'utf8');
}

function writeLog(text) {
  writeFileSync(logPath, text, 'utf8');
}

function appendLog(text) {
  appendFileSync(logPath, text, 'utf8');
}

function runTests(request) {
  running = true;
  const startedAt = new Date().toISOString();
  appendLog(`[test-bridge] start ${request?.id ?? ''}\n`);

  const proc = spawn(testCommand, testArgs, { cwd: repoRoot });

  let stdout = '';
  let stderr = '';
  let finished = false;
  const timeout = setTimeout(() => {
    if (finished) {
      return;
    }
    finished = true;
    proc.kill();
    const finishedAt = new Date().toISOString();
    appendLog(`[test-bridge] timeout ${request?.id ?? ''}\n`);
    writeResult({
      id: request?.id ?? '',
      command: testCommandLabel,
      code: -1,
      startedAt,
      finishedAt,
      error: 'timeout'
    });
    writeLog(stdout + (stderr ? `\n${stderr}` : '') + `\ntimeout`);
    running = false;
  }, 5000);

  proc.stdout.on('data', chunk => {
    stdout += chunk.toString();
  });
  proc.stderr.on('data', chunk => {
    stderr += chunk.toString();
  });

  proc.on('close', code => {
    if (finished) {
      return;
    }
    finished = true;
    clearTimeout(timeout);
    const finishedAt = new Date().toISOString();
    appendLog(`[test-bridge] finished ${request?.id ?? ''} (${code})\n`);
    const result = {
      id: request?.id ?? '',
      command: testCommandLabel,
      code,
      startedAt,
      finishedAt
    };
    writeResult(result);
    writeLog(stdout + (stderr ? `\n${stderr}` : ''));
    running = false;
    if (pending) {
      pending = false;
      const nextRequest = safeReadRequest();
      if (nextRequest) {
        lastRequestId = String(nextRequest.id ?? '');
        runTests(nextRequest);
      }
    }
  });

  proc.on('error', error => {
    if (finished) {
      return;
    }
    finished = true;
    clearTimeout(timeout);
    const finishedAt = new Date().toISOString();
    appendLog(`[test-bridge] error ${request?.id ?? ''} (${error.message})\n`);
    writeResult({
      id: request?.id ?? '',
      command: testCommandLabel,
      code: -1,
      startedAt,
      finishedAt,
      error: error.message
    });
    writeLog(stdout + (stderr ? `\n${stderr}` : '') + `\n${error.message}`);
    running = false;
  });
}

function handleRequest(request) {
  if (!request) {
    return;
  }
  const requestId = String(request.id ?? '');
  if (!requestId || requestId === lastRequestId) {
    return;
  }
  appendLog(`[test-bridge] request ${requestId}\n`);
  lastRequestId = requestId;
  if (running) {
    pending = true;
  } else {
    runTests(request);
  }
}

async function watchRequests() {
  try {
    await fs.access(requestPath);
  } catch {
    await fs.writeFile(requestPath, '{}\n', 'utf8');
  }

  let timer = null;
  const watcher = fs.watch(requestPath, { persistent: true });
  for await (const _event of watcher) {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      const request = safeReadRequest();
      handleRequest(request);
    }, 200);
  }
}

writeResult({
  id: '',
  command: testCommandLabel,
  code: null,
  startedAt: new Date().toISOString(),
  finishedAt: null
});
writeLog('[test-bridge] waiting for request...\n');
watchRequests();
