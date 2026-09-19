import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { browserExecutablePath } from '../scripts/browser.mjs';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const prefix = '/commons-collective/';
let server, browser, base;
before(async () => {
  server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (!url.pathname.startsWith(prefix)) { response.writeHead(404).end(); return; }
      const relative = decodeURIComponent(url.pathname.slice(prefix.length));
      const file = path.resolve(dist, relative.endsWith('/') ? `${relative}index.html` : relative);
      if (path.relative(dist, file).startsWith('..')) { response.writeHead(403).end(); return; }
      const content = await readFile(file);
      const type = { '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' }[path.extname(file)] ?? 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': type }).end(content);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'EISDIR') response.writeHead(404).end();
      else { response.writeHead(500).end(String(error)); }
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}${prefix}simulation/`;
  browser = await chromium.launch({ executablePath: browserExecutablePath(), headless: true });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

test('Pages project-prefix assets and real worker replay work without a backend', { timeout: 60000 }, async () => {
  const page = await browser.newPage();
  const failures = [], pageErrors = [];
  page.on('response', response => { if (response.status() >= 400) failures.push(response.url()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  const result = await page.evaluate(async () => {
    const { createConfig } = await import('./config.mjs');
    const workerRun = payload => new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./worker.mjs', location.href), { type: 'module' });
      const timer = setTimeout(() => { worker.terminate(); reject(new Error('Worker test timeout')); }, 20000);
      worker.onerror = event => { clearTimeout(timer); worker.terminate(); reject(new Error(event.message)); };
      worker.onmessage = event => {
        if (event.data.type === 'error') { clearTimeout(timer); worker.terminate(); reject(new Error(event.data.message)); }
        if (event.data.type === 'complete') { clearTimeout(timer); worker.terminate(); resolve(event.data); }
      };
      worker.postMessage(payload);
    });
    const outputs = [];
    for (const modelId of ['ai-commons', 'library-oer']) {
      const config = createConfig(modelId);
      config.params.periods = 1;
      if (modelId === 'ai-commons') Object.assign(config.params, { consumers: 20, contributors: 4, objects: 10, minimumCommitment: 5 });
      else Object.assign(config.params, { buyers: 2, patrons: 10, resources: 8, maintainers: 2 });
      const first = await workerRun({ type: 'start', generation: 1, runId: `first-${modelId}`, config });
      const replay = await workerRun({ type: 'replay', generation: 2, runId: `replay-${modelId}`, artifact: first.artifact });
      outputs.push({ modelId, tick: replay.summary.tick, verified: replay.replayVerified, same: first.summary.checksum === replay.summary.checksum });
    }
    return outputs;
  });
  assert.ok(result.every(row => row.tick === 30 && row.verified && row.same));
  assert.deepEqual(failures, []);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('Pages worker completes all paired batch trials with progress and model identity', { timeout: 60000 }, async () => {
  const page = await browser.newPage();
  await page.goto(base);
  const result = await page.evaluate(async () => {
    const { createConfig } = await import('./config.mjs');
    const config = createConfig('ai-commons');
    Object.assign(config.params, { periods: 1, consumers: 10, contributors: 2, objects: 8, minimumCommitment: 5 });
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./worker.mjs', location.href), { type: 'module' });
      const progress = [];
      const timer = setTimeout(() => { worker.terminate(); reject(new Error('Batch test timeout')); }, 25000);
      worker.onerror = event => { clearTimeout(timer); worker.terminate(); reject(new Error(event.message)); };
      worker.onmessage = event => {
        if (event.data.type === 'batch-progress') progress.push(event.data.done);
        if (event.data.type === 'error') { clearTimeout(timer); worker.terminate(); reject(new Error(event.data.message)); }
        if (event.data.type === 'batch-complete') {
          clearTimeout(timer); worker.terminate();
          resolve({ progress, ...event.data });
        }
      };
      worker.postMessage({ type: 'batch', generation: 4, runId: 'batch', config, replications: 2 });
    });
  });
  assert.deepEqual(result.progress, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(result.generation, 4);
  assert.equal(result.modelId, 'ai-commons');
  assert.equal(result.result.total, 8);
  assert.equal(result.result.settings[0].comparisons.length, 3);
  await page.close();
});

test('visible controls reset every model field, hidden state, charts and selection', { timeout: 60000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 960 } });
  await page.goto(base);
  await page.waitForFunction(() => !document.querySelector('#model-select').disabled);
  await page.locator('#seed').fill('edited seed');
  await page.locator('#seed').dispatchEvent('change');
  await page.locator('#param-periods').fill('1');
  await page.locator('#param-periods').dispatchEvent('change');
  await page.locator('#advanced-controls summary').click();
  await page.locator('#param-feeA3').fill('999');
  await page.locator('#param-feeA3').dispatchEvent('change');
  await page.locator('#step').click();
  await page.waitForFunction(() => document.querySelector('#tick').textContent === '1');
  await page.locator('#model-select').selectOption('library-oer');
  await page.locator('#model-select').selectOption('ai-commons');
  const reset = await page.evaluate(async () => {
    const { createConfig } = await import('./config.mjs');
    const config = createConfig('ai-commons');
    return {
      same: Object.entries(config.params).every(([key, value]) => Number(document.getElementById(`param-${key}`).value) === value),
      count: document.querySelectorAll('[data-parameter]').length,
      expected: Object.keys(config.params).length,
      seed: document.querySelector('#seed').value === config.seed,
      tick: document.querySelector('#tick').textContent,
      empty: document.querySelector('#snapshot-output').hidden,
      advanced: document.querySelector('#advanced-controls').open,
      status: document.querySelector('#run-status').dataset.state,
    };
  });
  assert.deepEqual(reset, { same: true, count: reset.expected, expected: reset.expected, seed: true, tick: '0', empty: true, advanced: false, status: 'ready' });
  for (const width of [1366, 900, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `horizontal overflow at ${width}`);
  }
  const links = await page.locator('a[href]').evaluateAll(nodes => nodes.map(node => node.href).filter(href => href.startsWith(location.origin)));
  for (const link of links) assert.equal((await page.request.get(link)).status(), 200, link);
  await page.close();
});

test('UI download, explicit file import and verified seeded replay are complete workflows', { timeout: 60000 }, async () => {
  const page = await browser.newPage();
  await page.goto(base);
  const scenario = await page.evaluate(async () => {
    const { createConfig } = await import('./config.mjs');
    const { exportScenario } = await import('./artifacts.mjs');
    const config = createConfig('library-oer');
    Object.assign(config.params, { periods: 1, buyers: 2, resources: 8, maintainers: 2, patrons: 10 });
    return exportScenario(config);
  });
  await page.locator('#artifact-file').setInputFiles({ name: 'scenario.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(scenario)) });
  await page.locator('#import-file').click();
  await page.waitForFunction(() => document.querySelector('#model-select').value === 'library-oer');
  assert.equal(await page.locator('#tick').textContent(), '0');
  await page.locator('#run').click();
  await page.waitForFunction(() => document.querySelector('#run-status').dataset.state === 'complete');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#save-run').click();
  const download = await downloadPromise;
  const saved = await readFile(await download.path());
  const runArtifact = JSON.parse(saved.toString('utf8'));
  assert.equal(runArtifact.summary.tick, 30);
  await page.locator('#reset').click();
  await page.locator('#artifact-file').setInputFiles({ name: 'run.json', mimeType: 'application/json', buffer: saved });
  await page.locator('#import-file').click();
  await page.waitForFunction(() => !document.querySelector('#replay').disabled);
  await page.locator('#replay').click();
  await page.waitForFunction(() => document.querySelector('#run-status').dataset.state === 'complete');
  assert.match(await page.locator('#replay-status').textContent(), /verified/i);
  assert.equal(await page.locator('#tick').textContent(), '30');
  assert.equal(await page.locator('#sim-error').isVisible(), false);
  await page.close();
});

test('a canceled old worker cannot resurrect results after a rapid model switch', { timeout: 30000 }, async () => {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.Worker = class {
      postMessage(message) {
        if (message.type !== 'start') return;
        const callback = this.onmessage;
        setTimeout(() => callback?.({ data: { type: 'snapshot', generation: message.generation, runId: message.runId, modelId: message.config.modelId,
          summary: { modelId: message.config.modelId, tick: 9999 } } }), 150);
      }
      terminate() {}
    };
  });
  await page.goto(base);
  await page.locator('#run').click();
  await page.locator('#model-select').selectOption('library-oer');
  await page.locator('#model-select').selectOption('ai-commons');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#tick').textContent(), '0');
  assert.equal(await page.locator('#run-status').getAttribute('data-state'), 'ready');
  assert.equal(await page.locator('#snapshot-output').isVisible(), false);
  assert.equal(await page.locator('#sim-error').isVisible(), false);
  await page.close();
});

test('worker stepping preserves replay verification, batch finalization and incoming error identity', { timeout: 60000 }, async () => {
  const page = await browser.newPage();
  await page.goto(base);
  const results = await page.evaluate(async () => {
    const { createConfig } = await import('./config.mjs');
    const { run } = await import('./engine.mjs');
    const { exportRun } = await import('./artifacts.mjs');
    const config = createConfig('ai-commons');
    Object.assign(config.params, { periods: 1, consumers: 10, contributors: 2, objects: 8, minimumCommitment: 5 });
    const artifact = exportRun(run(config));
    const execute = messages => new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./worker.mjs', location.href), { type: 'module' });
      const timer = setTimeout(() => { worker.terminate(); reject(new Error('Step regression timeout')); }, 15000);
      worker.onerror = event => { clearTimeout(timer); worker.terminate(); reject(new Error(event.message)); };
      worker.onmessage = event => {
        if (['complete', 'batch-complete', 'error'].includes(event.data.type)) {
          clearTimeout(timer); worker.terminate();
          resolve({ type: event.data.type, generation: event.data.generation, runId: event.data.runId,
            modelId: event.data.modelId, verified: event.data.replayVerified ?? false,
            total: event.data.result?.total ?? 0, error: event.data.message ?? '' });
        }
      };
      for (const message of messages) worker.postMessage(message);
    });
    const identity = { generation: 1, runId: 'step-check', modelId: config.modelId };
    const stepped = initial => [
      { ...identity, ...initial, config },
      { ...identity, type: 'pause' },
      ...Array.from({ length: 25 }, () => ({ ...identity, type: 'step' })),
      { ...identity, type: 'resume' },
    ];
    const corrupted = JSON.parse(JSON.stringify(artifact));
    corrupted.expectedChecksum = '0000000000000000';
    corrupted.summary.checksum = corrupted.expectedChecksum;
    return {
      badReplay: await execute(stepped({ type: 'replay', artifact: corrupted })),
      goodReplay: await execute(stepped({ type: 'replay', artifact })),
      batch: await execute(stepped({ type: 'batch', replications: 2 })),
      invalidInitialization: await execute([
        { generation: 1, runId: 'old', type: 'start', config },
        { generation: 2, runId: 'new', modelId: config.modelId, type: 'replay', config, artifact: {} },
      ]),
    };
  });
  assert.equal(results.badReplay.type, 'error');
  assert.match(results.badReplay.error, /diverged/);
  assert.equal(results.goodReplay.type, 'complete');
  assert.equal(results.goodReplay.verified, true);
  assert.equal(results.batch.type, 'batch-complete');
  assert.equal(results.batch.total, 8);
  assert.equal(results.invalidInitialization.type, 'error');
  assert.equal(results.invalidInitialization.generation, 2);
  assert.equal(results.invalidInitialization.runId, 'new');
  assert.equal(results.invalidInitialization.modelId, 'ai-commons');
  await page.close();
});
