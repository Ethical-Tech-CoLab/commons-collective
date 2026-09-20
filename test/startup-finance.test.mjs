import test from 'node:test';
import assert from 'node:assert/strict';
import { STARTUP_FIELDS, createStartupConfig, validateStartupConfig, projectStartup, summarizeStartupTrials } from '../simulation/startup.mjs';

test('startup defaults fund a priced-member plan with three staff growing to ten', () => {
  const config = createStartupConfig();
  const result = projectStartup(config);
  assert.equal(result.rows[0].staff, 3);
  assert.equal(result.rows[23].staff, 10);
  assert.ok(result.rows.every(row => Number.isInteger(row.staff) && row.staff <= 10));
  assert.equal(result.rows[0].payroll, 3000000);
  assert.equal(result.rows[23].payroll, 10000000);
  assert.equal(result.totals.hiring, 5000000);
  assert.equal(result.summary.operatingBreakEvenMonth, 25);
  assert.equal(result.summary.runRateMembersNeeded, 78919);
  assert.equal(result.summary.capitalRequired, 415129847);
  assert.equal(result.summary.memberPriceProtected, true);
  assert.ok(result.summary.minimumMemberSaving >= 50);
  assert.equal(result.summary.meetsReserveAndContingency, true);
});

test('capital on/off changes funding, not the growth, staffing or business economics', () => {
  const config = createStartupConfig();
  const on = projectStartup(config);
  config.params.capitalEnabled = 0;
  const off = projectStartup(config);
  assert.deepEqual(off.totals, on.totals);
  assert.equal(off.summary.capitalRequired, on.summary.capitalRequired);
  assert.equal(off.summary.operatingBreakEvenMonth, on.summary.operatingBreakEvenMonth);
  assert.equal(off.summary.firstShortfallMonth, 0);
  assert.equal(off.summary.funded, false);
  assert.equal(off.rows.every(row => row.financed === false), true);
  for (let i = 0; i < on.rows.length; i++) {
    assert.equal(off.rows[i].members, on.rows[i].members);
    assert.equal(off.rows[i].cashProfit, on.rows[i].cashProfit);
    assert.equal(on.rows[i].cash - off.rows[i].cash, on.summary.capital);
  }
  assert.match(off.notice, /unfunded plan/);
});

test('all sources and uses reconcile in cents without counting capital as revenue', () => {
  const run = projectStartup(createStartupConfig());
  const uses = Object.values(run.totals).reduce((sum, value) => sum + value, 0);
  assert.equal(run.summary.capital + run.summary.totalFees - uses, run.summary.endingCash);
  assert.ok(Object.values(run.totals).every(Number.isSafeInteger));
  assert.equal(run.totals.commons, run.rows.reduce((sum, row) => sum + row.commons, 0));
  assert.equal(run.totals.setup, 10000000);
  assert.equal(run.summary.capitalRequired, run.summary.capitalWithReserve + run.summary.contingency);
  assert.equal(run.summary.capitalWithReserve, run.summary.capitalForNoShortfall + run.summary.reserveAddon);
  assert.ok(run.summary.capitalForNoShortfall > Math.max(0, -run.rows.at(-1).capitalFreeCash));
});

test('events are lumpy and member churn replacement is funded rather than silently free', () => {
  const config = createStartupConfig();
  const run = projectStartup(config);
  assert.equal(run.rows[0].events, 0);
  assert.equal(run.rows[2].events, 1500000);
  assert.equal(run.rows[3].events, 0);
  const stable = run.rows.at(-1);
  assert.equal(stable.growthAcquisitions, 0);
  assert.equal(stable.replacementAcquisitions, 2250);
  assert.equal(stable.acquisition, 3375000);
  assert.equal(stable.onboarding, 1125000);
  assert.equal(stable.support, 3750000);
});

test('a bad member price blocks fees instead of making the institution healthy at members expense', () => {
  const config = createStartupConfig();
  config.params.feeUsd = 40;
  const run = projectStartup(config);
  assert.equal(run.summary.totalFees, 0);
  assert.equal(run.summary.lastMembers, 0);
  assert.equal(run.summary.memberPriceProtected, false);
  assert.equal(run.summary.operatingBreakEvenMonth, null);
  assert.ok(run.totals.payroll > 0);
  assert.equal(run.rows.every(row => row.desiredMembers > 0 && row.members === 0), true);
});

test('minimum launch cohort protects early members and explicitly delays paid launch', () => {
  const config = createStartupConfig();
  config.params.minimumLaunchMembers = 10000;
  const run = projectStartup(config);
  assert.equal(run.rows[0].members, 0);
  const first = run.rows.find(row => row.members > 0);
  assert.ok(first.month > 1);
  assert.ok(first.members >= 10000);
  assert.ok(first.memberSaving >= 50);
});

test('slower launch and expensive acquisition increase needed capital rather than inventing demand', () => {
  const config = createStartupConfig();
  const base = projectStartup(config);
  config.params.launchDelay = 6;
  const delayed = projectStartup(config);
  assert.ok(delayed.summary.capitalRequired > base.summary.capitalRequired);
  assert.equal(delayed.rows[0].members, 0);
  assert.equal(delayed.rows[0].staff, 3);
  config.params.launchDelay = 0;
  config.params.acquisitionUsd = 30;
  assert.ok(projectStartup(config).summary.capitalRequired > base.summary.capitalRequired);
});

test('cash break-even needs six consecutive months, distinct from average run-rate and capital recovery', () => {
  const config = createStartupConfig();
  config.params.eventUsd = 500000;
  config.params.capitalUsd = 100000000;
  const run = projectStartup(config);
  assert.equal(run.summary.operatingBreakEvenMonth, null);
  assert.equal(run.summary.meetsBreakEvenTarget, false);
  assert.ok(run.rows.some(row => row.cashProfit > 0));
  assert.ok(run.rows.some(row => row.cashProfit < 0));
  const base = projectStartup(createStartupConfig());
  assert.ok(base.summary.potentialCapitalRepaymentMonth > base.summary.operatingBreakEvenMonth);
});

test('an early positive window cannot hide losses after the staff ramp completes', () => {
  const config = createStartupConfig();
  Object.assign(config.params, { targetMembers: 100000, rampMonths: 6, staffStart: 1, staffTarget: 30,
    staffRampMonths: 60, acquisitionUsd: 0, onboardingUsd: 0, breakEvenTarget: 12 });
  const result = projectStartup(config);
  assert.ok(result.summary.operatingBreakEvenMonth !== null && result.summary.operatingBreakEvenMonth <= 12);
  assert.equal(result.summary.matureCashHealthy, false);
  assert.equal(result.summary.meetsBreakEvenTarget, false);
});

test('startup Monte Carlo is seeded, bounded, conditional and reproducible', () => {
  const config = createStartupConfig();
  const a = projectStartup(config, { uncertain: true, replication: 7 });
  const b = projectStartup(config, { uncertain: true, replication: 7 });
  assert.deepEqual(a, b);
  assert.ok(a.factors.growth >= 0.75 && a.factors.growth <= 1.25);
  assert.ok(a.factors.cost >= 0.85 && a.factors.cost <= 1.15);
  assert.ok(a.factors.delay >= 0 && a.factors.delay <= 6);
  const trials = Array.from({ length: 50 }, (_, replication) => projectStartup(config, { uncertain: true, replication }));
  const result = summarizeStartupTrials(config, trials);
  assert.equal(result.trials, 50);
  assert.ok(result.requiredCapital.p05 <= result.requiredCapital.median);
  assert.ok(result.requiredCapital.median <= result.requiredCapital.p95);
  assert.ok(result.successful <= result.trials);
  assert.match(result.notice, /not empirical success probabilities/);
});

test('zero-width uncertainty agrees with the deterministic plan exactly', () => {
  const config = createStartupConfig();
  Object.assign(config.params, { growthUncertainty: 0, costUncertainty: 0, churnUncertainty: 0, delayUncertainty: 0 });
  const base = projectStartup(config);
  const trials = Array.from({ length: 20 }, (_, replication) => projectStartup(config, { uncertain: true, replication }));
  assert.ok(trials.every(trial => trial.summary.capitalRequired === base.summary.capitalRequired));
  assert.equal(summarizeStartupTrials(config, trials).requiredCapital.p95, base.summary.capitalRequired);
});

test('every finance field is registered with a reset default and invalid inputs fail explicitly', () => {
  const config = createStartupConfig();
  assert.equal(Object.keys(config.params).length, STARTUP_FIELDS.length);
  assert.deepEqual(validateStartupConfig(config), config);
  assert.notEqual(createStartupConfig().params, config.params);
  for (const field of STARTUP_FIELDS) {
    const steps = (field.value - field.min) / field.step;
    assert.ok(Math.abs(steps - Math.round(steps)) < 1e-8, `${field.key}: default must fit its HTML input step`);
    const invalid = createStartupConfig();
    invalid.params[field.key] = field.max + 1;
    assert.throws(() => validateStartupConfig(invalid), undefined, field.key);
  }
  config.params.staffStart = 5;
  assert.throws(() => validateStartupConfig(config));
  config.params.staffStart = 3;
  config.params.breakEvenTarget = 60;
  assert.throws(() => validateStartupConfig(config), /six months/);
});
