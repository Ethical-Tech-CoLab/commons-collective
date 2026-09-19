import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfig, validateConfig, MODELS } from '../simulation/config.mjs';
import { quote, random, hash, stableStringify } from '../simulation/math.mjs';
import { createLedger, openAccount, transfer, owe, settle, assertLedger } from '../simulation/ledger.mjs';
import { createWorld, advanceWorld, summarize, run } from '../simulation/engine.mjs';
import { exportScenario, exportRun, importArtifact } from '../simulation/artifacts.mjs';
import { createExperiment, analyzeExperiment, runExperiment } from '../simulation/experiment.mjs';

function tiny(modelId = 'ai-commons') {
  const config = createConfig(modelId);
  config.params.periods = 2;
  if (modelId === 'ai-commons') {
    Object.assign(config.params, { consumers: 20, contributors: 4, objects: 10, minimumCommitment: 5 });
  } else Object.assign(config.params, { buyers: 2, patrons: 10, resources: 8, maintainers: 2 });
  return config;
}
test('model defaults are complete, disjoint, fresh, and strictly validated', () => {
  for (const model of MODELS) {
    const config = createConfig(model.id);
    assert.deepEqual(validateConfig(config), config);
    config.params.periods = 1;
    assert.equal(createConfig(model.id).params.periods, 36);
    for (const bad of [NaN, Infinity, -1, '36']) {
      config.params.periods = bad;
      assert.throws(() => validateConfig(config));
    }
    const extra = createConfig(model.id);
    extra.params.unknown = 1;
    assert.throws(() => validateConfig(extra));
    const missing = createConfig(model.id);
    delete missing.params.periods;
    assert.throws(() => validateConfig(missing));
  }
  assert.throws(() => createConfig('community-observations'));
  const config = tiny(); config.mode = 'P2';
  assert.throws(() => validateConfig(config), /P2/);
  assert.notDeepEqual(Object.keys(createConfig('ai-commons').params), Object.keys(createConfig('library-oer').params));
});
test('documented procurement and covariance examples reconcile', () => {
  assert.equal(quote(1000, 20000, 1400, 1500), 1633000);
  assert.equal(quote(5, 20000, 8000, 2000) * 6, 432000);
  assert.equal(quote(30, 20000, 8000, 2000), 312000);
  assert.equal(312000 + 6 * 25000, 462000);
  assert.equal(400000 - 80000 - 350000, -30000);
  assert.equal(quote(0, 20000, 8000, 2000), 0);
});
test('named random draws do not depend on call order or another actor', () => {
  const first = random('test', 'actor:1:tick:2');
  random('test', 'other actor');
  assert.equal(random('test', 'actor:1:tick:2'), first);
  assert.notEqual(first, random('other seed', 'actor:1:tick:2'));
  assert.ok(first >= 0 && first < 1);
  assert.equal(hash(stableStringify({ b: 1, a: 2 })), hash(stableStringify({ a: 2, b: 1 })));
});
test('protected money, exact cash, and outstanding liabilities survive delays', () => {
  const ledger = createLedger();
  openAccount(ledger, 'payer', 1000);
  assert.ok(transfer(ledger, 'payer', 'agency', 401, 'contribution-receipt', 0));
  owe(ledger, 'a', 'agency', 'contributors', 401, 10, 'contributor-payment');
  assertLedger(ledger);
  assert.throws(() => transfer(ledger, 'agency', 'operator', 1, 'operator-cost', 0));
  assert.throws(() => transfer(ledger, 'commons', 'operator', 0.5, 'operator-cost', 0));
  settle(ledger, 9);
  assert.equal(ledger.accounts.agency, 401);
  settle(ledger, 10);
  assert.equal(ledger.accounts.contributors, 401);
  assertLedger(ledger);
  assert.throws(() => owe(ledger, 'a', 'payer', 'operator', 1, 11, 'fee'));
});
test('both domain worlds replay identically across tick chunk sizes and preserve cash', () => {
  for (const model of MODELS) {
    const config = tiny(model.id);
    const continuous = run(config);
    const stepped = createWorld(config);
    while (stepped.tick < stepped.horizon) advanceWorld(stepped, 7);
    assert.equal(summarize(continuous).checksum, summarize(stepped).checksum);
    assertLedger(continuous.ledger);
    assert.equal(continuous.tick, 60);
    assert.equal(continuous.timeline.length, 3);
    const historyLength = continuous.ledger.journal.length;
    advanceWorld(continuous);
    assert.equal(continuous.ledger.journal.length, historyLength);
    assert.ok(summarize(continuous).domainMetrics.length > 0);
  }
});
test('AI private objects never enter the paid pool and zero incremental value buys no contributions', () => {
  const config = tiny();
  config.params.qualityEffect = 0;
  const world = run(config);
  assert.equal(world.domain.purchased, 0);
  assert.ok(world.domain.objects.some(object => object.category === 'private'));
  assert.ok(world.domain.consumers.every(actor => Number.isFinite(actor.aspiration)));
});
test('positive funded AI contribution value can trade; withdrawal blocks future purchases', () => {
  const config = tiny();
  Object.assign(config.params, { qualityEffect: 3, objectPrice: 1, verificationCost: 0, effortCost: 0, tasks: 100, permissionRate: 1, withdrawTick: 30 });
  const world = createWorld(config);
  advanceWorld(world, 30);
  const purchases = world.domain.purchased;
  assert.ok(purchases > 0, 'positive authorized value should admit a trade');
  advanceWorld(world, 30);
  assert.equal(world.domain.purchased, purchases);
  assert.equal(world.counters.withdrawals, 1);
  assert.equal(world.domain.providerCoverage.every(value => value === 0), true);
  assertLedger(world.ledger);
});
test('operator failure is a completed modeled outcome, not a computational success fallback', () => {
  const config = tiny();
  config.params.openingCash = 0;
  config.params.costA3 = 1000000;
  const world = run(config);
  assert.equal(world.institutionFailed, true);
  assert.equal(world.status, 'complete');
  assert.ok(summarize(world).liabilityCents > 0);
  assert.ok(world.events.some(event => event.type === 'institution-failed'));
});
test('unpaid buyer purchases cannot masquerade as savings', () => {
  const direct = tiny();
  direct.arrangement = 'A0';
  direct.params.paymentDelay = 180;
  const summary = summarize(run(direct));
  assert.equal(summary.memberNetBenefitCents, 0);
  assert.ok(summary.liabilityCents > 0);
});
test('completed run and scenario artifacts validate identity and reject corruption', () => {
  const config = tiny();
  assert.deepEqual(importArtifact(exportScenario(config)).config, config);
  const artifact = exportRun(run(config));
  assert.equal(importArtifact(artifact).kind, 'run');
  assert.equal(summarize(run(importArtifact(artifact).config)).checksum, artifact.expectedChecksum);
  for (const mutate of [
    value => { value.version = 99; },
    value => { value.buildId = 'different'; },
    value => { value.config.modelId = 'library-oer'; },
    value => { value.summary.tick = 1; },
    value => { value.expectedChecksum = 'not-a-checksum'; },
    value => { value.config.params.rogue = 3; },
  ]) {
    const corrupted = JSON.parse(JSON.stringify(artifact)); mutate(corrupted);
    assert.throws(() => importArtifact(corrupted));
  }
  assert.throws(() => exportRun(createWorld(config)));
});
test('paired Monte Carlo and a parameter sweep execute every declared arrangement', () => {
  const config = tiny(); config.params.periods = 1;
  const result = runExperiment(config, 2, 'feeA3', [0, 400]);
  assert.equal(result.total, 16);
  assert.equal(result.settings.length, 2);
  for (const setting of result.settings) {
    assert.equal(setting.arrangements.length, 4);
    assert.ok(setting.arrangements.every(row => row.runs === 2));
    assert.ok(setting.comparisons.every(row => row.pairs === 2 && Number.isFinite(row.standardErrorCents)));
  }
  const plan = createExperiment(config, 2);
  assert.throws(() => analyzeExperiment(plan, []), /incomplete/);
  assert.throws(() => createExperiment(config, 1));
  assert.throws(() => createExperiment(config, 2, 'unknown', [0, 1]));
  assert.throws(() => createExperiment(config, 2, 'periods', [0, 1]));
});

test('pooled commitments reserve capacity and fund exactly the quoted contract', () => {
  const config = tiny();
  Object.assign(config, { arrangement: 'A2', mode: 'P0', seed: 'capacity-0' });
  Object.assign(config.params, {
    consumers: 20, contributors: 0, providers: 2, providerCapacity: 10, minimumCommitment: 10,
    interest: 0.8, comprehension: 1, setupCost: 1000, variableCost: 100, markup: 0,
    feeA2: 0, switchingCost: 0,
  });
  const world = createWorld(config);
  advanceWorld(world);
  const members = world.domain.consumers.filter(actor => actor.pooled);
  assert.equal(members.length, world.domain.poolMembers.length);
  assert.equal(members.length, 10);
  const memberAccounts = new Set(members.map(actor => `buyer:${actor.id}`));
  const invoices = world.ledger.payable.filter(item => item.kind === 'service-payment' && memberAccounts.has(item.from));
  assert.equal(invoices.reduce((sum, item) => sum + item.cents, 0), world.domain.poolQuote);
  assert.equal(world.domain.poolQuote, 2000);
});

test('settlement filters the pending queue once, including thousands of future invoices', () => {
  const ledger = createLedger();
  openAccount(ledger, 'payer', 10000);
  for (let i = 0; i < 2000; i++) owe(ledger, `future:${i}`, 'payer', 'operator', 1, 180, 'fee');
  let pending = ledger.pending, writes = 0;
  Object.defineProperty(ledger, 'pending', {
    get: () => pending,
    set: value => { writes++; pending = value; },
  });
  assert.deepEqual(settle(ledger, 0), []);
  assert.equal(writes, 1);
  assert.equal(ledger.pending.length, 2000);
  assert.equal(settle(ledger, 180).length, 2000);
  assert.equal(writes, 2);
  assert.equal(ledger.pending.length, 0);
  assertLedger(ledger);
});
