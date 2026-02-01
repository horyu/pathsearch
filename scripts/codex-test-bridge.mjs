import { readFileSync, writeFileSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const tmpDir = path.join(repoRoot, 'tmp');
const requestPath = path.join(tmpDir, 'test.request.json');
const resultPath = path.join(tmpDir, 'test.result.json');
const logPath = path.join(tmpDir, 'test.log');

const timeoutMs = 6000;
const pollIntervalMs = 200;
const maxLogBytes = 10000;
const requestId = new Date().toISOString();

function safeReadJson(filePath) {
  try {
    const raw = readFileSync(filePath, 'utf8');
    const normalized = raw.replace(/^\uFEFF/, '');
    return JSON.parse(normalized);
  } catch {
    return null;
  }
}

function readText(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function emitArtifacts() {
  const requestText = readText(requestPath);
  const resultText = readText(resultPath);
  const logText = readText(logPath);
  process.stdout.write('\n--- test.request.json ---\n');
  process.stdout.write(requestText || '(empty)\n');
  process.stdout.write('\n--- test.result.json ---\n');
  process.stdout.write(resultText || '(empty)\n');
  process.stdout.write('\n--- test.log ---\n');
  if (!logText) {
    process.stdout.write('(empty)\n');
    return;
  }
  if (logText.length <= maxLogBytes) {
    process.stdout.write(logText);
    return;
  }
  const tail = logText.slice(-maxLogBytes);
  process.stdout.write(`(truncated to last ${maxLogBytes} chars)\n`);
  process.stdout.write(tail);
}

await fs.mkdir(tmpDir, { recursive: true });
writeFileSync(requestPath, JSON.stringify({ id: requestId }, null, 2) + '\n', 'utf8');

const startTime = Date.now();
while (Date.now() - startTime < timeoutMs) {
  const result = safeReadJson(resultPath);
  if (result && result.id === requestId && result.code !== null) {
    if (result.code === 0) {
      process.stdout.write('bridge: ok\n');
      process.exit(0);
    }
    emitArtifacts();
    process.stderr.write(`bridge: failed (code ${result.code})\n`);
    process.exit(1);
  }
  await sleep(pollIntervalMs);
}

emitArtifacts();
const lastResult = safeReadJson(resultPath);
if (!lastResult || lastResult.id !== requestId) {
  process.stderr.write('bridge: timeout (bridgeが未起動の可能性)\n');
  process.stderr.write('対処: ユーザー側で `pnpm test:bridge` を起動して再実行してください。\n');
  process.stderr.write('補足: 既存の test.result.json が古い場合は bridge が動いていません。\n');
} else {
  process.stderr.write('bridge: timeout (テストが長時間実行中の可能性)\n');
  process.stderr.write('対処: 長時間テストがあるか確認するか、timeoutを延長してください。\n');
}
process.exit(1);
