import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfig } from '../simulation/config.mjs';
import { random, quote } from '../simulation/math.mjs';
import { createLedger, transfer, settle, assertLedger } from '../simulation/ledger.mjs';
import { initializeLibrary, tickLibrary, libraryMetrics } from '../simulation/library.mjs';
import { createWorld, advanceWorld } from '../simulation/engine.mjs';

function fixture(overrides = {}, arrangement = 'A0') {
  const config = createConfig('library-oer');
  config.arrangement = arrangement;
  Object.assign(config.params, {
    periods: 3, buyers: 2, patrons: 8, maintainers: 2, vendors: 2, resources: 8,
    tasks: 30, units: 2, decay: 0, repairSuccess: 1, workCapacity: 3,
    mandateTicks: 180, providerCash: 1000000,
  }, overrides);
  const world = {
    config, tick: 0, horizon: config.params.periods * 30, domain: null,
    ledger: createLedger(), institutionFailed: false, events: [], timeline: [],
    counters: Object.fromEntries(['attempted', 'fulfilled', 'denied', 'unmet', 'buyerSpendCents',
      'baselineSpendCents', 'contributorPaidCents', 'contributorEffortCents', 'commonsWork',
      'participants', 'eligible', 'withdrawals'].map(key => [key, 0])),
  };
  initializeLibrary(world);
  return world;
}

function context(world) {
  const p = world.config.params, arrangement = world.config.arrangement;
  const draw = key => random(`${world.config.modelId}|${world.config.seed}`, `${world.tick}|${key}`);
  return {
    random: draw, chance: (key, probability) => draw(key) < probability,
    fee: arrangement === 'A0' ? 0 : arrangement === 'A1' ? p.feeHost : arrangement === 'A2' ? p.feeA2 : p.feeA3,
    operatorCost: 0, activeOperator: !world.institutionFailed && arrangement !== 'A0',
    emit: (type, message, data) => world.events.push({ tick: world.tick, type, message, data }),
  };
}

function step(world, count = 1) {
  for (let i = 0; i < count; i++) {
    tickLibrary(world, context(world));
    assertLedger(world.ledger);
    while (settle(world.ledger, world.tick).length) {}
    assertLedger(world.ledger);
    world.counters.buyerSpendCents = (world.ledger.totals['service-payment'] || 0) + (world.ledger.totals['administration-fee'] || 0);
    world.counters.contributorPaidCents = world.ledger.totals['contributor-payment'] || 0;
    world.tick++;
  }
  return world;
}

function noIntegration(world) {
  for (const buyer of world.domain.buyers) {
    for (const resource of world.domain.resources) buyer.integrated[resource.id] = true;
  }

  test('library P0 requests are deterministic while P1 samples patron/resource decisions', () => {
    for (const mode of ['P0', 'P1']) {
      const world = fixture();
      world.config.mode = mode;
      const ctx = context(world);
      let taskDraws = 0;
      const draw = ctx.random;
      ctx.random = key => {
        if (key.startsWith('library:task:')) taskDraws++;
        return draw(key);
      };
      tickLibrary(world, ctx);
      assert.equal(world.counters.attempted, 2);
      if (mode === 'P0') assert.equal(taskDraws, 0);
      else assert.ok(taskDraws >= 2);
      assertLedger(world.ledger);
    }
  });
}

test('library initialization changes only domain and opens sourced buyer/vendor accounts', () => {
  const world = fixture();
  assert.ok(Object.values(world.counters).every(value => value === 0));
  assert.equal(world.tick, 0);
  assert.equal(world.events.length, 0);
  assert.equal(world.domain.kind, 'library-oer');
  assert.equal(world.domain.resources.length, 8);
  assert.equal(world.domain.patrons.length, 8);
  assert.equal(world.domain.maintainers[0].personId, world.domain.patrons[0].personId);
  assert.ok(world.domain.resources.every(resource => !resource.linkDefect && !resource.accessibilityDefect && !resource.authority.modelTraining));
  assert.equal(world.domain.consumers, undefined);
  assert.equal(world.domain.objects, undefined);
  assert.equal(world.ledger.accounts['vendor:0'], 1000000);
  assert.equal(world.ledger.accounts['buyer:0'], 0);
  assertLedger(world.ledger);
});

test('eligible delivered hand-check orders reproduce all four price totals', () => {
  assert.equal(quote(5, 20000, 8000, 2000) * 6, 432000);
  assert.equal(quote(30, 20000, 8000, 2000), 312000);
  for (const [arrangement, service, full] of [
    ['A0', 432000, 432000], ['A1', 312000, 372000], ['A2', 312000, 462000], ['A3', 312000, 462000],
  ]) {
    const world = fixture({ buyers: 6, patrons: 200, maintainers: 20, resources: 60, units: 5, vendors: 3 }, arrangement);
    step(world, 4);
    assert.equal(world.domain.completedWork, 30, arrangement);
    assert.equal(world.ledger.totals['service-payment'], service, arrangement);
    assert.equal(world.counters.buyerSpendCents, full, arrangement);
    assert.equal(world.counters.baselineSpendCents, 432000, arrangement);
    assert.equal(world.ledger.totals['vendor-setup-cost'], arrangement === 'A0' ? 120000 : 20000);
    assert.equal(world.ledger.totals['vendor-nonlabor-cost'], 90000);
    assert.equal(world.counters.contributorPaidCents, 150000);
    assert.equal(world.counters.contributorEffortCents, 90000);
    assert.equal(world.domain.orders.length, arrangement === 'A0' ? 6 : 1);
  }
});

test('zero setup provides no automatic collective discount and no phantom setup order', () => {
  const direct = step(fixture({ setupCost: 0 }, 'A0'), 4);
  const pooled = step(fixture({ setupCost: 0, feeHost: 0 }, 'A1'), 4);
  assert.equal(direct.ledger.totals['service-payment'], pooled.ledger.totals['service-payment']);
  assert.equal(direct.ledger.totals['vendor-setup-cost'] || 0, 0);
  assert.equal(step(fixture({ units: 0 }), 5).domain.orders.length, 0);
});

test('permission zero denies retrieval, integration, repair, and commons admission', () => {
  const world = fixture({ permissionRate: 0, decay: 1 }, 'A3');
  transfer(world.ledger, 'external', 'commons', 1000000, 'restricted-grant', 0);
  step(world, 30);
  assert.equal(world.domain.orders.length, 0);
  assert.equal(world.counters.attempted, 60);
  assert.equal(world.counters.denied, 60);
  assert.equal(world.counters.fulfilled, 0);
  assert.equal(world.counters.commonsWork, 0);
  assert.equal(world.ledger.accounts.commons, 1000000);
});

test('withdrawal and exact mandate expiry cancel uncompleted work without billing or wages', () => {
  for (const override of [{ withdrawTick: 2 }, { mandateTicks: 2 }]) {
    const world = fixture({ ...override, repairDelay: 2 }, 'A1');
    step(world, 5);
    assert.ok(world.domain.canceledWork > 0);
    assert.equal(world.domain.completedWork, 0);
    assert.equal(world.counters.buyerSpendCents, 0);
    assert.equal(world.counters.baselineSpendCents, 0);
    assert.equal(world.counters.contributorPaidCents, 0);
    assert.equal(world.ledger.accounts.agency, 0);
    assert.equal(world.domain.activeOrders.length, 0);
    assert.ok(world.domain.orders.every(order => order.jobs.every(job => job.status === 'canceled')));
    assert.ok(world.counters.fulfilled > 0, 'withdrawal does not erase public retrieval rights');
    assert.equal(world.counters.withdrawals, override.withdrawTick ? 1 : 0);
  }
});

test('finite vendor and maintainer capacity counts accepted jobs once per period', () => {
  const world = fixture({ maintainers: 1, workCapacity: 1, vendorCapacity: 1, units: 5 });
  step(world, 30);
  assert.equal(world.domain.completedWork, 1);
  assert.equal(world.domain.orders.length, 1);
  assert.equal(world.domain.maintainers[0].unitsUsed, 1);
  assert.equal(world.domain.vendors.reduce((sum, vendor) => sum + vendor.unitsUsed, 0), 1);
  assert.equal(world.counters.baselineSpendCents, quote(1, 20000, 8000, 2000));
  const zero = step(fixture({ maintainers: 0 }), 30);
  assert.equal(zero.domain.orders.length, 0);
  assert.equal(zero.counters.buyerSpendCents, 0);
});

test('fragmented vendor orders cannot multiply the independent buyer-period baseline setup', () => {
  const world = step(fixture({ buyers: 1, patrons: 4, vendorCapacity: 1, units: 2, feeHost: 0 }, 'A1'), 4);
  assert.equal(world.domain.completedWork, 2);
  assert.equal(world.domain.orders.length, 2);
  assert.equal(world.counters.buyerSpendCents, 2 * quote(1, 20000, 8000, 2000));
  assert.equal(world.counters.baselineSpendCents, quote(2, 20000, 8000, 2000));
  assert.equal(world.counters.baselineSpendCents - world.counters.buyerSpendCents, -24000);
  const limitedBudget = step(fixture({ buyers: 1, patrons: 4, units: 5, budget: 50000 }), 4);
  assert.equal(limitedBudget.domain.completedWork, 2);
  assert.equal(limitedBudget.counters.buyerSpendCents, 43200);
  assert.equal(limitedBudget.counters.baselineSpendCents, 43200);
});

test('completed work is vendor-financed and agency cash always has exact protected payables', () => {
  const world = fixture({ paymentDelay: 10 });
  step(world, 2);
  tickLibrary(world, context(world));
  assert.ok(world.ledger.accounts.agency > 0);
  assert.equal(world.ledger.totals['service-payment'] || 0, 0);
  assert.equal(world.ledger.accounts.agency, world.domain.completedWork * world.config.params.wage);
  assertLedger(world.ledger);
  world.tick++;
  step(world, 10);
  assert.equal(world.ledger.accounts.agency, 0);
  assert.equal(world.counters.contributorPaidCents, 20000);
  assert.equal(world.ledger.totals['vendor-nonlabor-cost'], 12000);
  assert.equal(world.ledger.totals['vendor-setup-cost'], 40000);
  const paid = world.counters.contributorPaidCents;
  step(world, 10);
  assert.equal(world.counters.contributorPaidCents, paid);
  assert.equal(world.domain.maintainers.reduce((sum, actor) => sum + actor.receivedCents, 0), paid);
  assert.equal(world.ledger.pending.length, 0);
});

test('unfunded vendors do not invent delivery, labor payments, or buyer savings', () => {
  const world = step(fixture({ providerCash: 0 }), 30);
  assert.equal(world.domain.completedWork, 0);
  assert.equal(world.domain.orders.length, 0);
  assert.equal(world.counters.baselineSpendCents, 0);
  assert.equal(world.counters.contributorPaidCents, 0);
  assert.equal(world.counters.buyerSpendCents, 0);
});

test('the repair queue learns only from allowed retrieval observations', () => {
  const world = fixture({ buyers: 1, patrons: 1, resources: 1, tasks: 1, units: 1, repairDelay: 1 });
  noIntegration(world);
  world.domain.resources[0].linkDefect = true;
  step(world, 29);
  assert.equal(world.domain.resources[0].observedLink, false);
  assert.equal(world.domain.orders.length, 0);
  step(world);
  assert.equal(world.domain.resources[0].observedLink, true);
  assert.equal(world.domain.orders.length, 1);
  assert.equal(world.domain.orders[0].jobs[0].kind, 'link');
  step(world);
  assert.equal(world.domain.resources[0].linkDefect, false);
  assert.equal(world.domain.resources[0].lastMaintenanceTick, 30);
});

test('inaccessible resources fail only accessibility tasks; failed repair attempts still earn wages', () => {
  const world = fixture({ buyers: 1, patrons: 1, resources: 1, accessibleShare: 1, units: 1, repairSuccess: 0, repairDelay: 1 });
  noIntegration(world);
  world.domain.resources[0].accessibilityDefect = true;
  step(world, 3);
  assert.equal(world.counters.fulfilled, 0);
  assert.equal(world.domain.failedRepairs, 1);
  assert.equal(world.domain.successfulRepairs, 0);
  assert.equal(world.domain.resources[0].accessibilityDefect, true);
  assert.equal(world.counters.contributorPaidCents, 5000);
  assert.equal(world.domain.orders[0].jobs[0].success, false);
  const accessible = fixture({ buyers: 1, patrons: 1, resources: 1, accessibleShare: 0, units: 0 });
  accessible.domain.resources[0].accessibilityDefect = true;
  step(accessible, 2);
  assert.equal(accessible.counters.fulfilled, 2);
  assert.equal(accessible.domain.resources[0].observedAccessibility, false);
});

test('daily hazards use separate flags and never rediscover persistent defects as new hazards', () => {
  const world = fixture({ resources: 1, decay: 1, units: 0, tasks: 0 });
  step(world, 4);
  assert.equal(world.domain.newDefects, 2);
  assert.equal(world.domain.observedDefects, 0);
  assert.equal(world.domain.resources[0].linkDefect, true);
  assert.equal(world.domain.resources[0].accessibilityDefect, true);
});

test('no-task observations are unknown, not a renewal pass or a source of busywork', () => {
  for (const overrides of [{ tasks: 0 }, { patrons: 0 }]) {
    const world = step(fixture({ ...overrides, renewalPeriods: 1 }), 31);
    assert.equal(world.domain.orders.length, 0);
    assert.equal(world.counters.attempted, 0);
    assert.equal(world.domain.noEvidenceRenewals, 2);
    assert.ok(world.domain.buyers.every(buyer => buyer.observedAcceptance === null && !buyer.contractActive));
    assert.equal(libraryMetrics(world).find(metric => metric.label === 'Observed retrieval acceptance').value, null);
  }
});

test('low quality and unaffordable prices block contracts; operator failure permits direct fallback', () => {
  const failedQuality = fixture({ decay: 1, units: 0, renewalPeriods: 1, minimumQuality: 0.5 });
  step(failedQuality, 31);
  assert.ok(failedQuality.domain.buyers.every(buyer => buyer.contractActive === false));
  assert.equal(failedQuality.domain.renewalRejected, 2);
  const poor = step(fixture({ budget: 1 }, 'A2'), 5);
  assert.equal(poor.domain.orders.length, 0);
  const failedOperator = fixture({}, 'A3');
  failedOperator.institutionFailed = true;
  step(failedOperator, 5);
  assert.equal(failedOperator.domain.orders.length, 2);
  assert.ok(failedOperator.domain.orders.every(order => !order.pooled && !order.commons));
  assert.equal(failedOperator.domain.fallbackUnits, 4);
  assert.equal(failedOperator.counters.participants, 0);
  assert.equal(failedOperator.ledger.totals['administration-fee'] || 0, 0);
  assert.ok(failedOperator.counters.fulfilled > 0);
});

test('engine ratification failure uses independent quotes and no administration fees', () => {
  const config = fixture({ participationRate: 0, costA3: 0 }, 'A3').config;
  const world = createWorld(config);
  advanceWorld(world, 4);
  assert.equal(world.governanceApproved, false);
  assert.equal(world.domain.orders.length, 2);
  assert.equal(world.domain.completedWork, 4);
  assert.equal(world.counters.buyerSpendCents, 2 * quote(2, 20000, 8000, 2000));
  assert.equal(world.ledger.totals['administration-fee'] || 0, 0);
  assert.equal(world.counters.participants, 0);
  assertLedger(world.ledger);
});

test('completed pooled obligations survive failure while subsequent orders fall back directly', () => {
  const world = fixture({ renewalPeriods: 1, resources: 20 }, 'A3');
  step(world, 4);
  assert.equal(world.domain.orders.length, 1);
  const originalFees = world.ledger.totals['administration-fee'];
  world.institutionFailed = true;
  step(world, 30);
  assert.equal(world.domain.orders.length, 3);
  assert.ok(world.domain.orders.slice(1).every(order => !order.pooled));
  assert.equal(world.ledger.totals['administration-fee'], originalFees);
  assert.equal(world.domain.fallbackUnits, 4);
  assert.ok(world.domain.buyers.every(buyer => buyer.contractActive));
});

test('renewal includes historical aspiration, full previous price, and live authority', () => {
  for (const [family, expected] of [['F0', true], ['F1', false]]) {
    const world = fixture({ renewalPeriods: 1, minimumQuality: 0.8 });
    world.config.family = family;
    world.tick = 30;
    for (const buyer of world.domain.buyers) {
      buyer.observedAttempts = 10;
      buyer.observedFulfilled = 9;
      buyer.aspiration = 1;
    }
    step(world);
    assert.ok(world.domain.buyers.every(buyer => buyer.contractActive === expected));
  }
  for (const overrides of [{ mandateTicks: 30 }, {}]) {
    const world = fixture({ renewalPeriods: 1, ...overrides });
    world.tick = 30;
    for (const buyer of world.domain.buyers) {
      buyer.observedAttempts = 10;
      buyer.observedFulfilled = 10;
      if (!overrides.mandateTicks) buyer.lastPriceCents = world.config.params.budget + 1;
    }
    step(world);
    assert.ok(world.domain.buyers.every(buyer => !buyer.contractActive));
  }
});

test('commons orders use restricted funds, observed defects, and the same work capacity', () => {
  const world = fixture({ buyers: 1, patrons: 1, resources: 1, units: 0, maintainers: 1, workCapacity: 1, repairDelay: 1 }, 'A3');
  noIntegration(world);
  world.domain.resources[0].linkDefect = true;
  transfer(world.ledger, 'external', 'commons', 33599, 'restricted-grant', 0);
  step(world);
  assert.equal(world.domain.orders.length, 0);
  assert.equal(world.counters.commonsWork, 0);
  transfer(world.ledger, 'external', 'commons', 1, 'restricted-grant', world.tick);
  step(world);
  assert.equal(world.domain.orders.length, 1);
  assert.equal(world.counters.commonsWork, 0);
  assert.equal(world.ledger.accounts.commons, 33600, 'restricted commitment is not a completed repair');
  step(world, 2);
  assert.equal(world.counters.commonsWork, 1);
  assert.equal(world.domain.commonsAttempts, 1);
  assert.equal(world.ledger.totals['commons-maintenance'], 33600);
  assert.equal(world.ledger.accounts.commons, 0);
  assert.equal(world.domain.commonsCommittedCents, 0);
  assert.equal(world.counters.buyerSpendCents, 0);
  assert.equal(world.counters.baselineSpendCents, 0);
  assert.equal(world.counters.contributorPaidCents, 5000);
});

test('buyer work precedes commons work and failed commons repairs are not successful commons output', () => {
  const world = fixture({ buyers: 1, patrons: 1, resources: 2, maintainers: 1, workCapacity: 1, units: 1, repairDelay: 1 }, 'A3');
  transfer(world.ledger, 'external', 'commons', 100000, 'restricted-grant', 0);
  step(world, 3);
  assert.equal(world.domain.orders.length, 1);
  assert.equal(world.domain.orders[0].commons, false);
  assert.equal(world.ledger.accounts.commons, 100000);
  const failed = fixture({ buyers: 1, patrons: 1, resources: 1, units: 0, maintainers: 1, workCapacity: 1, repairDelay: 1, repairSuccess: 0 }, 'A3');
  failed.domain.resources[0].linkDefect = true;
  transfer(failed.ledger, 'external', 'commons', 33600, 'restricted-grant', 0);
  step(failed, 3);
  assert.equal(failed.domain.commonsAttempts, 1);
  assert.equal(failed.counters.commonsWork, 0);
  assert.equal(failed.counters.contributorPaidCents, 5000);
});

test('task allocation honors the full configured 10,000 tasks without per-task event growth', () => {
  const world = step(fixture({ buyers: 1, patrons: 1, resources: 1, tasks: 10000, units: 0 }), 30);
  assert.equal(world.counters.attempted, 10000);
  assert.equal(world.counters.fulfilled, 10000);
  assert.equal(world.events.filter(event => event.type === 'library-day').length, 30);
});

test('tiny runs are deterministic and undercompensated maintainers stop accepting additional work', () => {
  const make = () => fixture({ periods: 2, decay: 0.05, repairSuccess: 0.5, renewalPeriods: 1 });
  assert.deepEqual(step(make(), 60), step(make(), 60));
  const lowWage = step(fixture({ wage: 1000, effortCost: 3000 }), 31);
  assert.ok(lowWage.domain.maintainers.some(person => !person.active));
  assert.equal(lowWage.domain.orders.filter(order => order.acceptedTick >= 30).length, 0);
});
