import { ENGINE_VERSION, validateConfig } from './config.mjs';
import { hash, stableStringify, random, fraction } from './math.mjs';
import { createLedger, transfer, owe, settle, assertLedger } from './ledger.mjs';
import { initializeAI, tickAI, aiMetrics } from './ai.mjs';
import { initializeLibrary, tickLibrary, libraryMetrics } from './library.mjs';

export { ENGINE_VERSION };
export function createWorld(input) {
  const config = validateConfig(input);
  Object.freeze(config.params);
  Object.freeze(config);
  const world = {
    config, configKey: hash(stableStringify(config)), tick: 0, horizon: config.params.periods * 30,
    status: 'ready', institutionFailed: false, ledger: createLedger(), domain: null,
    counters: { attempted: 0, fulfilled: 0, denied: 0, unmet: 0, buyerSpendCents: 0, baselineSpendCents: 0,
      contributorPaidCents: 0, contributorEffortCents: 0, commonsWork: 0, participants: 0, eligible: 0,
      withdrawals: 0, switches: 0, switchAttempts: 0, complaints: 0, resolved: 0, governanceApprovals: 0 },
    events: [], timeline: [],
  };
  if (config.arrangement !== 'A0') transfer(world.ledger, 'external', 'operator', config.params.openingCash, 'opening-capital', 0);
  if (config.modelId === 'ai-commons') initializeAI(world);
  else initializeLibrary(world);
  assertLedger(world.ledger);
  world.timeline.push(point(world));
  return world;
}
function point(world) {
  return {
    tick: world.tick, operatorCashCents: world.ledger.accounts.operator,
    qualityRate: fraction(world.counters.fulfilled, world.counters.attempted),
    participants: world.counters.participants, commonsWork: world.counters.commonsWork,
  };
}
function emit(world, type, message, data) {
  if (world.events.length >= 20000) throw new Error('Event limit exceeded; this run is incomplete.');
  world.events.push({ tick: world.tick, type, message, ...(data ? { data } : {}) });
}
function governance(world, rng) {
  const p = world.config.params;
  const sizes = world.config.modelId === 'ai-commons' ? [p.consumers, p.contributors] : [p.buyers, p.maintainers];
  const chambers = sizes.map((eligible, chamber) => {
    let turnout = 0, yes = 0;
    for (let i = 0; i < eligible; i++) {
      if (rng(`vote:${chamber}:${i}:turnout`) < p.participationRate) {
        turnout++;
        if (rng(`vote:${chamber}:${i}:yes`) < p.approvalRate) yes++;
      }
    }
    return { eligible, turnout, yes, approved: eligible > 0 && turnout * 2 > eligible && yes * 2 > turnout };
  });
  world.governanceApproved = chambers.every(chamber => chamber.approved);
  if (world.governanceApproved) world.counters.governanceApprovals++;
  emit(world, 'ratification', world.governanceApproved ? 'Both chambers ratified this period’s bounded service mandate.' : 'Chamber quorum or approval failed: no new pooled mandate this period.', { chambers });
}
export function advanceWorld(world, steps = 1) {
  if (!Number.isSafeInteger(steps) || steps < 1 || steps > 36000) throw new RangeError('Invalid tick count.');
  if (world.status === 'complete') return world;
  world.status = 'running';
  const p = world.config.params, arrangement = world.config.arrangement;
  for (let step = 0; step < steps && world.tick < world.horizon; step++) {
    const periodStart = world.tick % 30 === 0;
    const rng = key => random(`${world.config.modelId}|${world.config.seed}`, `${world.tick}|${key}`);
    const fee = arrangement === 'A1' ? p.feeHost : arrangement === 'A2' ? p.feeA2 : arrangement === 'A3' ? p.feeA3 : 0;
    const cost = arrangement === 'A1' ? p.costHost : arrangement === 'A2' ? p.costA2 : arrangement === 'A3' ? p.costA3 : 0;
    if (periodStart) {
      if (world.tick / 30 < p.grantPeriods) transfer(world.ledger, 'external', 'commons', p.grant, 'restricted-grant', world.tick);
      if (arrangement !== 'A0' && !world.institutionFailed) owe(world.ledger, `operator:${world.tick}`, 'operator', 'outside', cost, world.tick, 'operator-cost');
      world.counters.complaints += p.complaints;
      const pending = world.counters.complaints - world.counters.resolved;
      world.counters.resolved += Math.min(p.reviewCapacity, pending);
      world.governanceApproved = true;
      if (arrangement === 'A3' && !world.institutionFailed) governance(world, rng);
    }
    const ctx = {
      emit: (type, message, data) => emit(world, type, message, data),
      random: rng, chance: (key, probability) => rng(key) < probability,
      fee, operatorCost: cost,
      activeOperator: arrangement !== 'A0' && !world.institutionFailed && world.governanceApproved !== false,
    };
    if (world.config.modelId === 'ai-commons') tickAI(world, ctx);
    else tickLibrary(world, ctx);
    const settled = [];
    let paid;
    do {
      paid = settle(world.ledger, world.tick);
      settled.push(...paid);
    } while (paid.length);
    if (arrangement === 'A3') {
      for (const payment of settled.filter(item => item.kind === 'administration-fee')) {
        const allocation = Math.floor(payment.cents * p.covenant / 10000);
        owe(world.ledger, `covenant:${payment.id}`, 'operator', 'commons', allocation, world.tick, 'commons-transfer');
      }
      do { paid = settle(world.ledger, world.tick); } while (paid.length);
    }
    if (!world.institutionFailed && world.ledger.pending.some(item => item.from === 'operator' && item.dueTick <= world.tick)) {
      world.institutionFailed = true;
      emit(world, 'institution-failed', 'Operator has unfunded obligations. New collective commitments stop; protected balances remain untouched.');
    }
    world.counters.buyerSpendCents = (world.ledger.totals['service-payment'] || 0) + (world.ledger.totals['administration-fee'] || 0) + (world.ledger.totals['switch-cost'] || 0);
    world.counters.contributorPaidCents = world.ledger.totals['contributor-payment'] || 0;
    assertLedger(world.ledger);
    world.tick++;
    if (world.tick % 30 === 0 || world.tick === world.horizon) world.timeline.push(point(world));
  }
  if (world.tick === world.horizon) {
    world.status = 'complete';
    if (!world.events.some(event => event.type === 'complete')) emit(world, 'complete', 'Declared horizon reached. Outstanding obligations remain in the reported balances.');
  }
  return world;
}
export function summarize(world) {
  const c = world.counters, l = world.ledger;
  const unpaidPurchases = l.pending.filter(item => ['service-payment', 'administration-fee'].includes(item.kind)).reduce((sum, item) => sum + item.cents, 0);
  return {
    modelId: world.config.modelId, configKey: world.configKey, tick: world.tick, horizon: world.horizon,
    period: Math.floor(world.tick / 30), status: world.status, institutionFailed: world.institutionFailed,
    qualityRate: fraction(c.fulfilled, c.attempted), fulfilled: c.fulfilled, attempted: c.attempted,
    denied: c.denied, unmet: c.unmet, operatorCashCents: l.accounts.operator,
    commonsCashCents: l.accounts.commons, agencyCashCents: l.accounts.agency,
    liabilityCents: l.pending.reduce((sum, item) => sum + item.cents, 0),
    memberNetBenefitCents: c.baselineSpendCents - c.buyerSpendCents - unpaidPurchases,
    contributorPaidCents: c.contributorPaidCents, contributorNetCents: c.contributorPaidCents - c.contributorEffortCents,
    commonsWork: c.commonsWork, participantCount: c.participants, eligibleCount: c.eligible,
    domainMetrics: [
      ...(world.config.modelId === 'ai-commons' ? aiMetrics(world) : libraryMetrics(world)),
      { label: 'Agency cash protected for contributors', value: l.accounts.agency, unit: 'cents' },
      { label: 'Unpaid buyer obligations (included in cost)', value: unpaidPurchases, unit: 'cents' },
      { label: 'Resolved / generated complaints', value: `${c.resolved} / ${c.complaints}`, unit: '' },
      { label: 'Approved A3 period mandates', value: c.governanceApprovals, unit: 'count' },
    ],
    timeline: world.timeline.map(item => ({ ...item })),
    events: world.events.slice(-40).map(item => ({ ...item })),
    checksum: world.status === 'complete' ? hash(stableStringify({ config: world.config, tick: world.tick, counters: c, accounts: l.accounts, payable: l.payable, domain: world.domain })) : null,
  };
}
export function run(config) {
  const world = createWorld(config);
  advanceWorld(world, world.horizon);
  return world;
}
