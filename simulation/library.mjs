import { chance, quote, splitCents, fraction } from './math.mjs';
import { openAccount, transfer, owe } from './ledger.mjs';

export function initializeLibrary(world) {
  const { config, ledger } = world, p = config.params;
  const categoryCount = Math.min(4, p.resources);
  const patrons = Array.from({ length: p.patrons }, (_, id) => ({
    id, personId: `person:${id}`, buyer: id % p.buyers, category: id % categoryCount,
    accessibilityNeed: chance(config, `library:patron:${id}:accessibility`, p.accessibleShare),
  }));
  const buyers = Array.from({ length: p.buyers }, (_, id) => {
    openAccount(ledger, `buyer:${id}`);
    const members = patrons.filter(patron => patron.buyer === id);
    return {
      id, patronIds: members.map(patron => patron.id), categories: [...new Set(members.map(patron => patron.category))],
      integrated: {}, baselineUnits: {}, budgetRemaining: 0, periodCommittedCents: 0, lastPriceCents: 0, unitsUsed: 0, pooledUnitsUsed: 0, fees: {}, contractActive: true,
      mandateExpiresAt: p.mandateTicks, nextRenewal: p.renewalPeriods * 30,
      observedAttempts: 0, observedFulfilled: 0, observedAcceptance: null, aspiration: null,
    };
  });
  const vendors = Array.from({ length: p.vendors }, (_, id) => {
    openAccount(ledger, `vendor:${id}`, p.providerCash);
    return { id, unitsUsed: 0, completed: 0 };
  });
  const resources = Array.from({ length: p.resources }, (_, id) => {
    const permitted = chance(config, `library:resource:${id}:authority`, p.permissionRate);
    return {
      id, version: 1, category: id % categoryCount, license: permitted ? 'synthetic-open' : 'unresolved',
      available: true, authority: { retrieval: permitted, integration: permitted, maintenance: permitted, modelTraining: false },
      expiresAt: p.mandateTicks, linkDefect: false, accessibilityDefect: false,
      observedLink: false, observedAccessibility: false, lastMaintenanceTick: null,
    };
  });
  world.domain = {
    kind: 'library-oer', patrons, buyers, vendors, resources,
    resourcesByCategory: Array.from({ length: categoryCount }, (_, category) => resources.filter(resource => resource.category === category).map(resource => resource.id)),
    maintainers: Array.from({ length: p.maintainers }, (_, id) => ({
      id, personId: `person:${id}`, active: true, unitsUsed: 0, completed: 0, receivedCents: 0, effortCents: 0,
    })),
    orders: [], activeOrders: [], pendingKeys: {}, pendingReceipts: [], pendingPayroll: [],
    nextOrder: 0, commonsCommittedCents: 0, withdrawalApplied: false, expiryReported: false,
    completedWork: 0, successfulRepairs: 0, failedRepairs: 0, integrations: 0, canceledWork: 0,
    newDefects: 0, observedDefects: 0, failedTasks: 0, noResourceTasks: 0, commonsAttempts: 0,
    invoiceCents: 0, receivedCents: 0, renewalAccepted: 0, renewalRejected: 0, noEvidenceRenewals: 0, fallbackUnits: 0,
    contractTerms: 'Vendor-financed fixed-price completed attempts; setup is vendor risk. Canceled units are not billed. Failed repair attempts earn the agreed wage. Public retrieval does not require a maintenance subscription.',
  };
}

function workAuthorized(world, resource, kind) {
  const p = world.config.params;
  return resource.available && resource.authority[kind === 'integration' ? 'integration' : 'maintenance']
    && world.tick < resource.expiresAt && (p.withdrawTick < 0 || world.tick < p.withdrawTick);
}

function receipts(world) {
  const d = world.domain;
  d.pendingReceipts = d.pendingReceipts.filter(receipt => {
    if (receipt.liability && !receipt.liability.paid) return true;
    d.receivedCents += receipt.cents;
    if (receipt.commons) d.commonsCommittedCents -= receipt.cents;
    return false;
  });
  d.pendingPayroll = d.pendingPayroll.filter(payroll => {
    if (payroll.liability && !payroll.liability.paid) return true;
    d.maintainers[payroll.maintainer].receivedCents += payroll.cents;
    return false;
  });
}

function obligation(world, id, from, to, cents, kind) {
  if (!cents) return null;
  owe(world.ledger, id, from, to, cents, world.tick + world.config.params.paymentDelay, kind);
  return world.ledger.payable[world.ledger.payable.length - 1];
}

function beginPeriod(world, ctx) {
  const { domain: d, config, ledger, tick } = world, p = config.params;
  for (const vendor of d.vendors) vendor.unitsUsed = 0;
  for (const maintainer of d.maintainers) {
    maintainer.unitsUsed = 0;
    maintainer.active = maintainer.completed === 0 || maintainer.receivedCents >= maintainer.effortCents;
  }
  let renewed = 0, rejected = 0, unknown = 0;
  for (const buyer of d.buyers) {
    transfer(ledger, 'external', `buyer:${buyer.id}`, p.budget, 'buyer-budget', tick);
    if (buyer.periodCommittedCents) buyer.lastPriceCents = buyer.periodCommittedCents;
    buyer.budgetRemaining = p.budget;
    buyer.periodCommittedCents = 0;
    buyer.unitsUsed = 0;
    buyer.pooledUnitsUsed = 0;
    if (tick < buyer.nextRenewal) continue;
    const observed = fraction(buyer.observedFulfilled, buyer.observedAttempts);
    buyer.observedAcceptance = observed;
    const threshold = config.family === 'F1' && buyer.aspiration !== null
      ? Math.max(p.minimumQuality, buyer.aspiration * 0.95) : p.minimumQuality;
    const authority = (config.arrangement === 'A0' || !ctx.activeOperator || tick < buyer.mandateExpiresAt)
      && d.resources.some(resource => buyer.categories.includes(resource.category) && workAuthorized(world, resource, 'integration'));
    const affordable = buyer.lastPriceCents <= p.budget && ctx.fee <= p.budget;
    buyer.contractActive = observed !== null && observed >= threshold && authority && affordable;
    if (observed === null) { unknown++; d.noEvidenceRenewals++; }
    if (observed !== null) buyer.aspiration = buyer.aspiration === null ? observed : 0.8 * buyer.aspiration + 0.2 * observed;
    if (buyer.contractActive) { renewed++; d.renewalAccepted++; }
    else { rejected++; d.renewalRejected++; }
    buyer.observedAttempts = 0;
    buyer.observedFulfilled = 0;
    buyer.nextRenewal = tick + p.renewalPeriods * 30;
  }
  if (renewed || rejected) ctx.emit('library-renewal', 'Maintenance renewal uses observed retrieval acceptance; price, authority, and capacity are checked for each new order.', { renewed, rejected, unknown });
}

function applyAuthority(world, ctx) {
  const d = world.domain, p = world.config.params;
  if (!d.withdrawalApplied && p.withdrawTick >= 0 && world.tick >= p.withdrawTick) {
    d.withdrawalApplied = true;
    world.counters.withdrawals++;
    ctx.emit('library-authority-withdrawn', 'Integration and repair authority withdrawn. Public retrieval rights and already earned compensation are unchanged.');
  }
  if (!d.expiryReported && world.tick >= p.mandateTicks) {
    d.expiryReported = true;
    ctx.emit('library-mandate-expired', 'Synthetic integration/repair mandates expired; no implicit renewal or new maintenance access is permitted.');
  }
}

function finishOrders(world, ctx, day) {
  const { domain: d, ledger, tick, counters: c, config } = world, p = config.params;
  const remaining = [];
  for (const order of d.activeOrders) {
    const invalid = order.jobs.some(job => !workAuthorized(world, d.resources[job.resource], job.kind));
    if (order.dueTick > tick && !invalid) { remaining.push(order); continue; }
    const completedByBuyer = new Map();
    let earned = 0;
    for (const job of order.jobs) {
      if (job.status !== 'accepted') continue;
      const resource = d.resources[job.resource];
      if (!workAuthorized(world, resource, job.kind)) {
        job.status = 'canceled';
        d.canceledWork++; day.canceled++;
        if (order.commons) d.commonsCommittedCents -= job.priceCents;
        else if (order.period === Math.floor(tick / 30)) d.buyers[job.buyer].budgetRemaining += job.priceCents;
      } else if (order.dueTick > tick) {
        continue;
      } else {
        job.status = 'completed';
        const maintainer = d.maintainers[job.maintainer];
        transfer(ledger, order.account, 'outside', p.variableCost - p.wage, 'vendor-nonlabor-cost', tick);
        transfer(ledger, order.account, 'agency', p.wage, 'contributor-receipt', tick);
        const liability = obligation(world, `library:wage:${order.id}:${job.key}`, 'agency', 'contributors', p.wage, 'contributor-payment');
        d.pendingPayroll.push({ maintainer: maintainer.id, cents: p.wage, liability });
        maintainer.completed++; maintainer.effortCents += p.effortCost;
        c.contributorEffortCents += p.effortCost;
        d.completedWork++; day.completed++; d.vendors[order.vendor].completed++;
        const success = job.kind === 'integration' || ctx.chance(`library:repair:${resource.id}:${job.kind}`, p.repairSuccess);
        job.success = success;
        if (job.kind === 'integration') {
          d.buyers[job.buyer].integrated[resource.id] = true;
          d.integrations++;
        } else if (success) {
          resource[job.kind === 'link' ? 'linkDefect' : 'accessibilityDefect'] = false;
          resource[job.kind === 'link' ? 'observedLink' : 'observedAccessibility'] = false;
          resource.lastMaintenanceTick = tick;
          resource.version++;
          d.successfulRepairs++;
        } else d.failedRepairs++;
        if (order.commons) {
          d.commonsAttempts++;
          if (success) c.commonsWork++;
        } else {
          const delivered = completedByBuyer.get(job.buyer) || { quantity: 0, cents: 0 };
          delivered.quantity++; delivered.cents += job.priceCents;
          completedByBuyer.set(job.buyer, delivered);
        }
        earned += job.priceCents;
      }
      delete d.pendingKeys[job.key];
    }
    if (order.jobs.some(job => job.status === 'accepted')) { remaining.push(order); continue; }
    // Costs are prefunded by the vendor, not by uncollected buyer invoices.
    const refund = ledger.accounts[order.account];
    transfer(ledger, order.account, `vendor:${order.vendor}`, refund, 'vendor-capital-return', tick);
    order.status = order.jobs.some(job => job.status === 'completed') ? 'completed' : 'canceled';
    order.completedTick = tick;
    order.invoiceCents = earned;
    d.invoiceCents += earned;
    if (order.commons) {
      const liability = obligation(world, `library:commons:${order.id}`, 'commons', `vendor:${order.vendor}`, earned, 'commons-maintenance');
      d.pendingReceipts.push({ cents: earned, commons: true, liability });
    } else {
      for (const [buyerId, delivered] of completedByBuyer) {
        const buyer = d.buyers[buyerId];
        const liability = obligation(world, `library:invoice:${order.id}:${buyerId}`, `buyer:${buyerId}`, `vendor:${order.vendor}`, delivered.cents, 'service-payment');
        d.pendingReceipts.push({ cents: delivered.cents, commons: false, liability });
        const priorUnits = buyer.baselineUnits[order.period] || 0;
        buyer.baselineUnits[order.period] = priorUnits + delivered.quantity;
        // One independent buyer-period quote, even if pooled work used several vendors.
        c.baselineSpendCents += quote(priorUnits + delivered.quantity, p.setupCost, p.variableCost, p.markup)
          - quote(priorUnits, p.setupCost, p.variableCost, p.markup);
        const fee = buyer.fees[order.period];
        if (order.pooled && fee && !fee.billed) {
          obligation(world, `library:fee:${order.period}:${buyerId}`, `buyer:${buyerId}`, 'operator', fee.cents, 'administration-fee');
          fee.billed = true;
        }
      }
    }
  }
  d.activeOrders = remaining;
}

function resourceUse(world, ctx, day) {
  const { domain: d, config, counters: c, tick } = world, p = config.params;
  for (const resource of d.resources) {
    for (const [flag, stream] of [['linkDefect', 'link'], ['accessibilityDefect', 'accessibility']]) {
      if (!resource[flag] && ctx.chance(`library:defect:${resource.id}:${stream}`, p.decay)) {
        resource[flag] = true; d.newDefects++; day.defects++;
      }
    }
  }
  const dayIndex = tick % 30;
  const first = Math.floor(dayIndex * p.tasks / 30), last = Math.floor((dayIndex + 1) * p.tasks / 30);
  for (const buyer of d.buyers) {
    if (!buyer.patronIds.length) continue;
    for (let task = first; task < last; task++) {
      const patronIndex = config.mode === 'P0' ? (task + buyer.id) % buyer.patronIds.length
        : Math.floor(ctx.random(`library:task:${buyer.id}:${task}:patron`) * buyer.patronIds.length);
      const patron = d.patrons[buyer.patronIds[patronIndex]];
      const inventory = d.resourcesByCategory[patron.category];
      c.attempted++; buyer.observedAttempts++; day.attempted++;
      if (!inventory.length) { c.unmet++; d.noResourceTasks++; continue; }
      const resourceIndex = config.mode === 'P0' ? (task + tick + buyer.id) % inventory.length
        : Math.floor(ctx.random(`library:task:${buyer.id}:${task}:resource`) * inventory.length);
      const resource = d.resources[inventory[resourceIndex]];
      if (!resource.authority.retrieval) { c.denied++; continue; }
      if (!resource.available) { c.unmet++; d.noResourceTasks++; continue; }
      if (resource.linkDefect) {
        if (!resource.observedLink) { resource.observedLink = true; d.observedDefects++; day.discovered++; }
        d.failedTasks++;
      } else if (patron.accessibilityNeed && resource.accessibilityDefect) {
        if (!resource.observedAccessibility) { resource.observedAccessibility = true; d.observedDefects++; day.discovered++; }
        d.failedTasks++;
      } else {
        c.fulfilled++; buyer.observedFulfilled++; day.fulfilled++;
      }
    }
  }
}

function buyerEligible(world, ctx, buyer) {
  return buyer.contractActive && buyer.patronIds.length > 0 && world.config.params.tasks > 0
    && (world.config.arrangement === 'A0' || !ctx.activeOperator || world.tick < buyer.mandateExpiresAt);
}

function collectJobs(world, ctx, commons = false) {
  const d = world.domain, p = world.config.params, jobs = [], assigned = Array(p.buyers).fill(0);
  const eligibleBuyers = commons ? [] : d.buyers.filter(buyer => buyerEligible(world, ctx, buyer) && buyer.unitsUsed < p.units);
  if (!commons && !eligibleBuyers.length) return jobs;
  for (const resource of d.resources) {
    for (const [kind, observed] of [['link', resource.observedLink], ['accessibility', resource.observedAccessibility]]) {
      const key = `${kind}:${resource.id}`;
      if (!observed || d.pendingKeys[key] || !workAuthorized(world, resource, kind)) continue;
      const buyer = commons ? null : eligibleBuyers.find(candidate => candidate.categories.includes(resource.category) && candidate.unitsUsed + assigned[candidate.id] < p.units);
      if (!commons && !buyer) continue;
      jobs.push({ key, resource: resource.id, kind, buyer: buyer?.id ?? null });
      if (buyer) assigned[buyer.id]++;
    }
  }
  if (commons) return jobs;
  for (const buyer of eligibleBuyers) {
    for (const resource of d.resources) {
      if (buyer.unitsUsed + assigned[buyer.id] >= p.units) break;
      const key = `integration:${buyer.id}:${resource.id}`;
      if (!buyer.categories.includes(resource.category) || buyer.integrated[resource.id] || d.pendingKeys[key] || !workAuthorized(world, resource, 'integration')) continue;
      jobs.push({ key, resource: resource.id, kind: 'integration', buyer: buyer.id });
      assigned[buyer.id]++;
    }
  }
  return jobs;
}

function capacity(world, vendor, maximum) {
  const p = world.config.params, cash = world.ledger.accounts[`vendor:${vendor.id}`];
  if (cash < p.setupCost) return 0;
  const financed = p.variableCost ? Math.floor((cash - p.setupCost) / p.variableCost) : maximum;
  const labor = world.domain.maintainers.reduce((sum, person) => sum + (person.active ? Math.max(0, p.workCapacity - person.unitsUsed) : 0), 0);
  return Math.min(maximum, Math.max(0, p.vendorCapacity - vendor.unitsUsed), financed, labor);
}

function affordableJobs(world, ctx, candidates, commons) {
  const d = world.domain, p = world.config.params, period = Math.floor(world.tick / 30);
  if (commons) {
    const cash = world.ledger.accounts.commons - d.commonsCommittedCents;
    let low = 0, high = candidates.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (quote(middle, p.setupCost, p.variableCost, p.markup) <= cash) low = middle;
      else high = middle - 1;
    }
    return candidates.slice(0, low);
  }
  let jobs = candidates;
  while (jobs.length) {
    const total = quote(jobs.length, p.setupCost, p.variableCost, p.markup);
    const costs = new Map();
    for (let i = 0; i < jobs.length; i++) costs.set(jobs[i].buyer, (costs.get(jobs[i].buyer) || 0) + splitCents(total, jobs.length, i));
    const rejected = new Set();
    for (const [id, cents] of costs) {
      const fee = d.buyers[id].fees[period] ? 0 : ctx.fee;
      if (cents + fee > d.buyers[id].budgetRemaining) rejected.add(id);
    }
    if (!rejected.size) return jobs;
    // A buyer may accept fewer requested units, but never an unaffordable invoice.
    const removed = new Set();
    jobs = jobs.filter(job => {
      if (!rejected.has(job.buyer) || removed.has(job.buyer)) return true;
      removed.add(job.buyer);
      return false;
    });
  }
  return [];
}

function startOrder(world, ctx, jobs, vendor, commons, day) {
  if (!jobs.length) return;
  const { domain: d, config, ledger, tick } = world, p = config.params, period = Math.floor(tick / 30);
  const pooled = config.arrangement !== 'A0' && ctx.activeOperator;
  const id = d.nextOrder++, account = `library-order:${id}`;
  const total = quote(jobs.length, p.setupCost, p.variableCost, p.markup);
  openAccount(ledger, account);
  transfer(ledger, `vendor:${vendor.id}`, account, p.setupCost + jobs.length * p.variableCost, 'vendor-work-capital', tick);
  transfer(ledger, account, 'outside', p.setupCost, 'vendor-setup-cost', tick);
  let personIndex = 0;
  const assignedJobs = jobs.map((job, index) => {
    while (personIndex < d.maintainers.length && (!d.maintainers[personIndex].active || d.maintainers[personIndex].unitsUsed >= p.workCapacity)) personIndex++;
    const maintainer = d.maintainers[personIndex];
    maintainer.unitsUsed++;
    const priceCents = splitCents(total, jobs.length, index);
    d.pendingKeys[job.key] = id + 1;
    if (!commons) {
      const buyer = d.buyers[job.buyer];
      buyer.unitsUsed++;
      if (pooled) buyer.pooledUnitsUsed++;
      else if (config.arrangement !== 'A0') d.fallbackUnits++;
      buyer.budgetRemaining -= priceCents;
      buyer.periodCommittedCents += priceCents;
      if (pooled && !buyer.fees[period]) {
        buyer.fees[period] = { cents: ctx.fee, billed: false };
        buyer.budgetRemaining -= ctx.fee;
        buyer.periodCommittedCents += ctx.fee;
      }
    }
    return { ...job, maintainer: maintainer.id, priceCents, status: 'accepted' };
  });
  vendor.unitsUsed += jobs.length;
  if (commons) d.commonsCommittedCents += total;
  const order = { id, account, vendor: vendor.id, period, commons, pooled, quoteCents: total, acceptedTick: tick, dueTick: tick + p.repairDelay, status: 'accepted', jobs: assignedJobs };
  d.orders.push(order);
  d.activeOrders.push(order);
  day.started += jobs.length;
}

function commission(world, ctx, day) {
  const { domain: d, config, tick } = world, p = config.params;
  if (tick + p.repairDelay >= world.horizon) return;
  if (!d.maintainers.some(person => person.active && person.unitsUsed < p.workCapacity)) return;
  let jobs = collectJobs(world, ctx);
  const groups = config.arrangement === 'A0' || !ctx.activeOperator ? d.buyers.map(buyer => jobs.filter(job => job.buyer === buyer.id)) : [jobs];
  for (const group of groups) {
    let remaining = group;
    for (const vendor of d.vendors) {
      const count = capacity(world, vendor, remaining.length);
      if (!count) continue;
      const accepted = affordableJobs(world, ctx, remaining.slice(0, count), false);
      startOrder(world, ctx, accepted, vendor, false, day);
      const keys = new Set(accepted.map(job => job.key));
      remaining = remaining.filter(job => !keys.has(job.key));
      if (!remaining.length) break;
    }
  }
  if (config.arrangement !== 'A3' || !ctx.activeOperator) return;
  jobs = collectJobs(world, ctx, true);
  for (const vendor of d.vendors) {
    const count = capacity(world, vendor, jobs.length);
    if (!count) continue;
    const accepted = affordableJobs(world, ctx, jobs.slice(0, count), true);
    startOrder(world, ctx, accepted, vendor, true, day);
    const keys = new Set(accepted.map(job => job.key));
    jobs = jobs.filter(job => !keys.has(job.key));
  }
}

export function tickLibrary(world, ctx) {
  if (world.config.arrangement === 'A0' || !ctx.activeOperator) ctx = { ...ctx, fee: 0 };
  const d = world.domain, day = { attempted: 0, fulfilled: 0, defects: 0, discovered: 0, started: 0, completed: 0, canceled: 0 };
  receipts(world);
  applyAuthority(world, ctx);
  if (world.tick % 30 === 0) beginPeriod(world, ctx);
  finishOrders(world, ctx, day);
  resourceUse(world, ctx, day);
  commission(world, ctx, day);
  world.counters.eligible = d.buyers.filter(buyer => buyer.patronIds.length && world.config.params.tasks > 0).length;
  world.counters.participants = d.buyers.filter(buyer => buyer.pooledUnitsUsed > 0).length;
  world.counters.buyerSpendCents = (world.ledger.totals['service-payment'] || 0) + (world.ledger.totals['administration-fee'] || 0);
  world.counters.contributorPaidCents = world.ledger.totals['contributor-payment'] || 0;
  if (Object.values(day).some(value => value > 0)) ctx.emit('library-day', 'Observed retrieval, resource hazards, and finite completed-attempt work contracts.', day);
}

export function libraryMetrics(world) {
  const d = world.domain;
  const defects = d.resources.filter(resource => resource.linkDefect || resource.accessibilityDefect).length;
  const observed = d.resources.reduce((sum, resource) => sum + Number(resource.observedLink) + Number(resource.observedAccessibility), 0);
  const active = d.activeOrders.reduce((sum, order) => sum + order.jobs.filter(job => job.status === 'accepted').length, 0);
  const latePayroll = d.pendingPayroll.filter(payroll => payroll.liability && !payroll.liability.paid && payroll.liability.dueTick < world.tick).reduce((sum, payroll) => sum + payroll.cents, 0);
  return [
    { label: 'OER resource versions', value: d.resources.length, unit: 'resources' },
    { label: 'Resources with actual defects (diagnostic, not queue knowledge)', value: defects, unit: 'resources' },
    { label: 'Observed outstanding defect flags', value: observed, unit: 'flags' },
    { label: 'Work awaiting its lead time', value: active, unit: 'units' },
    { label: 'Completed integration units', value: d.integrations, unit: 'units' },
    { label: 'Direct fallback work units contracted', value: d.fallbackUnits, unit: 'units' },
    { label: 'Successful / failed repair attempts', value: `${d.successfulRepairs} / ${d.failedRepairs}`, unit: 'units' },
    { label: 'Canceled unbilled units', value: d.canceledWork, unit: 'units' },
    { label: 'Commons completed repair attempts', value: d.commonsAttempts, unit: 'units' },
    { label: 'Observed retrieval acceptance', value: fraction(world.counters.fulfilled, world.counters.attempted), unit: 'fraction' },
    { label: 'Renewals lacking task evidence', value: d.noEvidenceRenewals, unit: 'count' },
    { label: 'Active maintainers', value: d.maintainers.filter(person => person.active).length, unit: 'people' },
    { label: 'Unique patrons and maintainers (overlap counted once)', value: Math.max(d.patrons.length, d.maintainers.length), unit: 'people' },
    { label: 'Late protected contributor payables', value: latePayroll, unit: 'cents' },
  ];
}
