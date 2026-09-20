import test from 'node:test';
import assert from 'node:assert/strict';
import { createStartupConfig, projectStartup } from '../simulation/startup.mjs';
import { createConfig } from '../simulation/config.mjs';
import { createWorld, advanceWorld, run, summarize } from '../simulation/engine.mjs';
import { exportRun } from '../simulation/artifacts.mjs';
import { startupMoney, operatingMoney } from '../simulation/money.mjs';
import { renderMoneyHTML } from '../simulation/money-render.mjs';
import { startupMoneyRequest, operatingMoneyRequest, moneyRequestFromFile, validateMoneyRequest } from '../simulation/money-request.mjs';

test('every startup money window equals the detailed projection and never allocates capital as revenue', () => {
  for (const capitalEnabled of [0, 1]) {
    const config = createStartupConfig(); config.params.capitalEnabled = capitalEnabled;
    const projection = projectStartup(config);
    for (let month = 0; month <= config.params.horizon; month++) {
      const view = startupMoney(projection, month), account = view.accounts[0];
      assert.equal(account.inflowsCents - account.outflowsCents, account.closingCents);
      assert.equal(account.closingCents, month ? projection.rows[month - 1].cash : projection.summary.capital - projection.totals.setup);
      assert.equal(account.sources.find(item => item.id === 'capital').cents, projection.summary.capital);
      assert.equal(account.sources.find(item => item.id === 'fees').cents, projection.rows.filter(row => row.month <= month).reduce((sum, row) => sum + row.fees, 0));
      assert.equal(account.obligationsCents, null, 'forecast does not invent unpaid-liability data');
      assert.equal(view.source.through, month);
      assert.equal(view.source.identity, projection.id);
    }
    const target = startupMoney(projection);
    assert.deepEqual(target.budget, projection.budgetToTarget);
    const horizon = startupMoney(projection, config.params.horizon);
    assert.deepEqual(horizon.budget.uses, projection.totals);
    assert.equal(horizon.accounts[0].closingCents, projection.summary.endingCash);
  }
});

test('the reference cash equation and all Lab use categories match in exact cents', () => {
  const p = projectStartup(createStartupConfig()), view = startupMoney(p), account = view.accounts[0];
  assert.equal(account.inflowsCents, 1578130500);
  assert.equal(account.outflowsCents, 1077650975);
  assert.equal(account.closingCents, 500479525);
  assert.equal(account.uses.find(item => item.id === 'commons').cents, 195626100);
  for (const line of account.uses) assert.equal(line.cents, p.budgetToTarget.uses[line.id]);
  const bad = structuredClone(p);
  bad.rows[0].payroll++;
  assert.throws(() => startupMoney(bad), /reconcile|differs/);
  assert.throws(() => startupMoney(p, 61));
  assert.throws(() => startupMoney(p, NaN));
});

test('operating accounts reconcile to real journal entries with inter-account transfers eliminated', () => {
  for (const modelId of ['ai-commons', 'library-oer']) {
    const config = createConfig(modelId);
    config.params.periods = 2;
    config.params.grant = 10000;
    if (modelId === 'ai-commons') Object.assign(config.params, { consumers: 20, contributors: 4, objects: 10, minimumCommitment: 5, qualityEffect: 3, objectPrice: 1, verificationCost: 0, tasks: 100 });
    else Object.assign(config.params, { buyers: 2, patrons: 10, resources: 8, maintainers: 2 });
    const complete = run(config), checksum = summarize(complete).checksum;
    for (let period = 0; period <= 2; period++) {
      const prefix = createWorld(config);
      if (period) advanceWorld(prefix, period * 30);
      const view = operatingMoney(prefix, checksum);
      for (const account of view.accounts) {
        assert.equal(account.closingCents, prefix.ledger.accounts[account.id]);
        assert.equal(account.inflowsCents - account.outflowsCents, account.closingCents);
        assert.equal(account.obligationsCents, prefix.ledger.pending.filter(item => item.from === account.id).reduce((sum, item) => sum + item.cents, 0));
      }
      assert.equal(view.consolidation.externalInCents - view.consolidation.externalOutCents, view.consolidation.closingCents);
      assert.equal(view.accounts[2].closingCents, view.accounts[2].obligationsCents);
      assert.equal(view.indicators[0].cents, summarize(prefix).memberNetBenefitCents);
    }
  }
});

test('delayed contributor payouts remain liabilities and are not operator income', () => {
  const config = createConfig('ai-commons');
  Object.assign(config.params, { periods: 1, consumers: 20, contributors: 4, objects: 10, minimumCommitment: 5,
    qualityEffect: 3, objectPrice: 1, verificationCost: 0, tasks: 100, paymentDelay: 180 });
  const world = run(config), view = operatingMoney(world, summarize(world).checksum);
  assert.ok(view.accounts[2].closingCents > 0);
  assert.equal(view.accounts[2].closingCents, view.accounts[2].obligationsCents);
  assert.equal(view.accounts[2].overdueCents, 0);
  assert.equal(view.accounts[0].sources.filter(item => item.classification === 'earned-revenue').reduce((sum, item) => sum + item.cents, 0), 0);
});

test('source requests are versioned, bounded, and cannot replace an uncertain projection silently', () => {
  const projection = projectStartup(createStartupConfig());
  assert.equal(moneyRequestFromFile(projection).kind, 'startup');
  const editedNumbers = structuredClone(projection);
  editedNumbers.summary.endingCash = 1;
  assert.deepEqual(moneyRequestFromFile(editedNumbers), moneyRequestFromFile(projection), 'stored amounts are not trusted');
  const uncertain = projectStartup(createStartupConfig(), { uncertain: true, replication: 1 });
  assert.throws(() => moneyRequestFromFile(uncertain), /sampled projection/);
  assert.throws(() => moneyRequestFromFile({ format: 'ccsl-money-rollup' }));
  assert.throws(() => validateMoneyRequest({ ...startupMoneyRequest(projection.config), madeUpRevenue: 100 }));
  assert.throws(() => startupMoneyRequest(projection.config, -1));
  const config = createConfig('ai-commons');
  Object.assign(config.params, { periods: 1, consumers: 10, contributors: 2, objects: 8 });
  const artifact = exportRun(run(config));
  assert.equal(operatingMoneyRequest(artifact).through, 1);
  assert.throws(() => operatingMoneyRequest(artifact, 2));
  artifact.expectedChecksum = 'tampered';
  assert.throws(() => operatingMoneyRequest(artifact));
});

test('the high-level renderer shows checked rollups, not adjustable percentage arithmetic', () => {
  const view = startupMoney(projectStartup(createStartupConfig()));
  const html = renderMoneyHTML(view);
  assert.match(html, /Sources, including financing/);
  assert.match(html, /\$5,004,795\.25/);
  assert.match(html, /Reconciliation difference: \$0\.00/);
  assert.doesNotMatch(html, /<input/);
  const bad = structuredClone(view); bad.accounts[0].closingCents++;
  assert.throws(() => renderMoneyHTML(bad), /unreconciled/);
});
