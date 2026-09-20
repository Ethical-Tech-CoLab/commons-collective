import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateUsageAudit, renderUsageAudit, usageAuditSection } from '../scripts/usage-audit.mjs';

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const data = await readJson('../usage/ai-usage.json');
const config = await readJson('../usage/audit-config.json');
const upstream = await readJson('../vendor/usage-calc/UPSTREAM.json');
const adapterSha256 = createHash('sha256').update(
  (await readFile(new URL('../scripts/capture-ai-usage.py', import.meta.url), 'utf8')).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'),
).digest('hex');

test('published usage reconciles by model, role, channel, day, and observed rate', () => {
  assert.equal(validateUsageAudit(data, config, upstream, adapterSha256), data);
  assert.equal(data.models.length, 2);
  assert.deepEqual(Object.fromEntries(data.models.map(row => [row.model, row.requests])), { 'gpt-6-astra': 1153, 'gpt-5.4-mini': 11 });
  assert.equal(data.totals.requests, 1164);
  assert.equal(data.totals.nanoAiu, '88883661940000');
  assert.equal(data.totals.listPriceUsdExact, '888.8366194');
  assert.equal(data.totals.embeddedAgentCount, 24);
  assert.equal(data.totals.requestActiveUnionMs, 37811777);
  assert.equal(data.totals.modelWorkMs, 42016957);
});

test('scope and privacy fields are enforced, not just asserted in prose', () => {
  const changes = [
    copy => { copy.prompt = 'private'; },
    copy => { copy.scope.cwd = 'private'; },
    copy => { copy.models[0].messages = []; },
    copy => { copy.privacy.containsPrompts = true; },
    copy => { copy.scope.cutoffExclusive = '2030-01-01T00:00:00Z'; },
    copy => { copy.upstream.commit = '0'.repeat(40); },
    copy => { copy.models[0].model = 'unreviewed-model'; },
  ];
  for (const change of changes) {
    const copy = structuredClone(data);
    change(copy);
    assert.throws(() => validateUsageAudit(copy, config, upstream, adapterSha256), /AI usage audit/);
  }
});

test('inconsistent numbers and billing claims fail publication', () => {
  const changes = [
    copy => { copy.models[0].requests += 1; },
    copy => { copy.roles[0].tokens.input += 1; },
    copy => { copy.rates[0].nanoAiu = '0'; },
    copy => { copy.rates[0].usdPerMillionTokensExact = '999'; },
    copy => { copy.channels[0].listPriceUsdExact = '0'; },
    copy => { copy.totals.requestActiveUnionMs = copy.totals.modelWorkMs + 1; },
    copy => { copy.pricing.invoiceMeasured = true; },
    copy => { copy.coverage.allSelectedChargesReconciled = false; },
    copy => { copy.timing.calendarDaysInclusive += 1; },
    copy => { copy.timing.recordedSpanMs += 1; },
    copy => { copy.humanTime.actualHumanLaborMeasured = true; },
    copy => { copy.humanTime.inferredHumanMs += 1; },
    copy => { copy.humanTime.sensitivity[0].inferredHumanMs += 1; },
    copy => { copy.humanTime.defaultIdleCutoffMinutes = 30; },
    copy => {
      [copy.roles[0].role, copy.roles[1].role] = [copy.roles[1].role, copy.roles[0].role];
    },
  ];
  for (const change of changes) {
    const copy = structuredClone(data);
    change(copy);
    assert.throws(() => validateUsageAudit(copy, config, upstream, adapterSha256), /AI usage audit/);
  }
  assert.throws(() => validateUsageAudit(data, { ...config, dbPath: 'private' }, upstream, adapterSha256), /unapproved fields/);
  assert.throws(() => validateUsageAudit(data, config, upstream, '0'.repeat(64)), /adapter changed/);
});

test('vendored calculation modules match the pinned normalized source hashes', async () => {
  for (const [path, expected] of Object.entries(upstream.files)) {
    const content = (await readFile(new URL(`../vendor/usage-calc/${path}`, import.meta.url), 'utf8'))
      .replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    assert.equal(createHash('sha256').update(content).digest('hex'), expected, path);
  }
});

test('the actual Python collector passes scoped synthetic-ledger privacy and reconciliation checks', () => {
  const result = spawnSync('python', [fileURLToPath(new URL('./usage-capture-fixture.py', import.meta.url))], {
    encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  assert.equal(result.error, undefined, 'Python 3 is required for the audit collector checks');
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Synthetic audit checks passed/);
});

test('the audit page and live overview explain the measurement boundaries', () => {
  const html = renderUsageAudit(data);
  assert.match(html, /gpt-6-astra/);
  assert.match(html, /gpt-5\.4-mini/);
  assert.match(html, /1,164/);
  assert.match(html, /\$888\.84/);
  assert.match(html, /not a bill/);
  assert.match(html, /unrounded/);
  assert.match(html, /does not independently establish the model weights/);
  assert.match(html, /No prompt text/);
  const section = usageAuditSection(data);
  assert.equal(section.url, './ai-usage.html#usage-summary');
  assert.ok(section.paragraphs.join(' ').includes('not an invoice'));
  const changed = structuredClone(data);
  changed.totals.requests = 1165;
  assert.ok(usageAuditSection(changed).paragraphs[0].includes('1,165'));
  assert.match(html, /Start date \(UTC\)/);
  assert.match(html, /Last update \(UTC\)/);
  assert.match(html, /Days in recorded span/);
  assert.match(html, /Elapsed model usage/);
  assert.match(html, /Interaction-time proxy/);
  assert.match(html, /10\.50 h/);
  assert.match(html, /2\.76 h/);
  assert.match(html, /not a timesheet or a productivity estimate/);
  assert.match(html, /not a confidence interval/);
  assert.ok(section.paragraphs.join(' ').includes('inferred human-side residual'));
});

test('date coverage and human-time inference reconcile without counting idle wall time as labor', () => {
  assert.equal(data.timing.firstRequestStartedAt, '2026-09-18T17:27:17.907Z');
  assert.equal(data.timing.lastRequestCompletedAt, '2026-09-20T19:36:13.463Z');
  assert.equal(data.timing.calendarDaysInclusive, 3);
  assert.equal(data.timing.recordedSpanMs, 180535556);
  assert.equal(data.humanTime.actualHumanLaborMeasured, false);
  assert.equal(data.humanTime.defaultIdleCutoffMinutes, 10);
  assert.equal(data.humanTime.inferredHumanMs, 9936700);
  assert.equal(data.humanTime.engagedUnionMs, 47748477);
  for (const row of data.humanTime.sensitivity) {
    assert.equal(row.engagedUnionMs, data.totals.requestActiveUnionMs + row.inferredHumanMs);
    assert.ok(row.engagedUnionMs < data.timing.recordedSpanMs);
  }
  assert.deepEqual(data.humanTime.sensitivity.map(row => row.idleCutoffMinutes), [2, 5, 10, 30]);
  assert.deepEqual(data.humanTime.sensitivity.map(row => row.inferredHumanMs), [7096347, 9414092, 9936700, 13508361]);
});

test('the initial aggregate snapshot remains a distinct immutable historical boundary', async () => {
  const historical = await readJson('../usage/history/2026-09-19.json');
  const priorConfig = await readJson('../usage/history/2026-09-19-config.json');
  assert.equal(historical.schemaVersion, 1);
  assert.equal(historical.totals.requests, 401);
  assert.equal(historical.totals.listPriceUsdExact, '164.8614025');
  assert.equal(historical.scope.cutoffExclusive, '2026-09-19T13:47:16.543Z');
  assert.equal(priorConfig.cutoffExclusive, historical.scope.cutoffExclusive);
  assert.equal(historical.humanTime, undefined);
  assert.ok(Object.values(historical.privacy).every(value => value === false));
});
