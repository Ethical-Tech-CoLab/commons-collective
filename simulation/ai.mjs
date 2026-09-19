import { chance, random, quote, quality, splitCents, logistic, fraction } from './math.mjs';
import { openAccount, transfer, owe } from './ledger.mjs';

export function initializeAI(world) {
  const { config, ledger } = world, p = config.params;
  const consumers = Array.from({ length: p.consumers }, (_, id) => {
    openAccount(ledger, `buyer:${id}`);
    return { id, provider: id % p.providers, interested: chance(config, `initial-interest:${id}`, p.interest),
      comprehends: chance(config, `comprehension:${id}`, p.comprehension), aspiration: p.quality,
      subscribed: false, pooled: false, pendingSwitch: null, attempted: 0, fulfilled: 0 };
  });
  for (let i = 0; i < p.providers; i++) openAccount(ledger, `provider:${i}`, p.providerCash);
  const objects = Array.from({ length: p.objects }, (_, id) => {
    const position = id / p.objects;
    return { id, category: position < 0.4 ? 'public' : position < 0.7 ? 'private' : position < 0.9 ? 'professional' : 'synthetic',
      allowed: chance(config, `object-authority:${id}`, p.permissionRate), freshness: 1,
      owner: p.contributors ? id % p.contributors : null, expiresAt: p.mandateTicks, maintenanceTick: 0 };
  });
  world.domain = { consumers, objects, providerCoverage: Array(p.providers).fill(0), purchased: 0, expired: 0, poolQuote: 0, poolMembers: [], lastRenewal: -1 };
  world.counters.eligible = p.consumers;
}

function subscriptionPeriod(world, ctx) {
  const { config, ledger, domain: d, counters: c, tick } = world, p = config.params;
  const period = tick / 30;
  for (const actor of d.consumers) transfer(ledger, 'external', `buyer:${actor.id}`, p.budget, 'buyer-income', tick);
  const renew = d.lastRenewal < 0 || period - d.lastRenewal >= p.renewalPeriods || !d.poolMembers.length || world.institutionFailed;
  let candidates = renew
    ? (ctx.activeOperator ? d.consumers.filter(actor => actor.interested && actor.comprehends && actor.aspiration >= p.minimumQuality) : [])
    : d.consumers.filter(actor => d.poolMembers.includes(actor.id));
  candidates = candidates.slice(0, p.providerCapacity);
  let agreed = !renew && candidates.length > 0, total = agreed ? d.poolQuote : 0;
  for (let round = 0; renew && round < 3 && candidates.length >= p.minimumCommitment; round++) {
    total = quote(candidates.length, p.setupCost, p.variableCost, p.markup);
    const accepted = candidates.filter((actor, index) => {
      const price = splitCents(total, candidates.length, index) + ctx.fee;
      const expectedSwitch = actor.provider === 0 ? 0 : p.switchingCost / p.renewalPeriods;
      if (price + (actor.provider === 0 ? 0 : p.switchingCost) > p.budget) return false;
      const advantage = p.retailPrice - price - expectedSwitch;
      const inertia = config.family === 'F1' && actor.pooled ? p.retailPrice * 0.05 : 0;
      return config.mode === 'P0' ? advantage + inertia >= 0
        : random(`${config.modelId}|${config.seed}`, `${period}:offer:${actor.id}`) < logistic((advantage + inertia) / Math.max(1, p.budget));
    });
    if (accepted.length === candidates.length) { agreed = true; break; }
    candidates = accepted;
  }
  if (!agreed) { candidates = []; total = 0; }
  if (renew) {
    d.lastRenewal = period;
    d.poolMembers = candidates.map(actor => actor.id);
  }
  const acceptedIds = new Map(candidates.map((actor, index) => [actor.id, index]));
  const load = Array(p.providers).fill(0);
  d.poolQuote = total;
  // Committed pooled capacity is reserved before admitting additional retail demand.
  const purchaseOrder = [...candidates, ...d.consumers.filter(actor => !acceptedIds.has(actor.id))];
  for (const actor of purchaseOrder) {
    const pooled = acceptedIds.has(actor.id);
    const provider = pooled ? 0 : actor.provider;
    const service = pooled ? splitCents(total, candidates.length, acceptedIds.get(actor.id)) : p.retailPrice;
    const fee = pooled ? ctx.fee : 0;
    actor.subscribed = service + fee <= p.budget && load[provider] < p.providerCapacity && (pooled || actor.aspiration >= p.minimumQuality);
    actor.pooled = pooled && actor.subscribed;
    if (!actor.subscribed) continue;
    load[provider]++;
    c.baselineSpendCents += p.retailPrice;
    owe(ledger, `service:${period}:${actor.id}`, `buyer:${actor.id}`, `provider:${provider}`, service, tick + p.paymentDelay, 'service-payment');
    if (fee) owe(ledger, `fee:${period}:${actor.id}`, `buyer:${actor.id}`, 'operator', fee, tick + p.paymentDelay, 'administration-fee');
    if (pooled && actor.provider !== provider && !actor.pendingSwitch) {
      actor.pendingSwitch = { provider, due: tick + p.switchDelay };
      c.switchAttempts++;
    }
  }
  for (let provider = 0; provider < p.providers; provider++) {
    const setup = provider === 0 && candidates.length ? p.setupCost : 0;
    owe(ledger, `provider-cost:${period}:${provider}`, `provider:${provider}`, 'outside',
      load[provider] * p.variableCost + setup, tick, 'provider-cost');
  }
  c.participants = d.consumers.filter(actor => actor.pooled).length;
  ctx.emit('procurement', `${c.participants} of ${p.consumers} consumers contracted through ${config.arrangement}; others retain eligible retail alternatives.`, { poolQuoteCents: total });
  contributions(world, ctx, load);
}

function contributions(world, ctx, load) {
  const { config, domain: d, ledger, counters: c, tick } = world, p = config.params;
  const candidates = d.objects.filter(object => ['professional', 'synthetic'].includes(object.category) && object.owner !== null);
  d.providerCoverage.fill(0);
  for (let provider = 0; provider < p.providers; provider++) {
    let spend = 0, coverage = 0;
    for (const object of candidates) {
      if (!object.allowed || tick >= object.expiresAt || (p.withdrawTick >= 0 && tick >= p.withdrawTick)) {
        c.denied++;
        continue;
      }
      const next = Math.min(1, coverage + object.freshness / Math.max(1, candidates.length));
      const extraTasks = (quality(p.quality, p.qualityEffect * next) - quality(p.quality, p.qualityEffect * coverage)) * load[provider] * p.tasks;
      const expectedValue = Math.floor(extraTasks * p.successValue);
      const cost = p.objectPrice + p.verificationCost;
      if (expectedValue <= cost || spend + cost > p.contributionBudget || ledger.accounts[`provider:${provider}`] < cost) continue;
      transfer(ledger, `provider:${provider}`, 'outside', p.verificationCost, 'verification', tick);
      transfer(ledger, `provider:${provider}`, 'agency', p.objectPrice, 'contribution-receipt', tick);
      owe(ledger, `contributor:${tick}:${provider}:${object.id}`, 'agency', 'contributors', p.objectPrice, tick + p.paymentDelay, 'contributor-payment');
      c.contributorEffortCents += p.effortCost;
      spend += cost; coverage = next; d.purchased++;
    }
    d.providerCoverage[provider] = coverage;
  }
  ctx.emit('contribution-market', `Authorized service purchases to date: ${d.purchased}. Zero incremental value creates no automatic payment entitlement.`);
}

export function tickAI(world, ctx) {
  const { config, domain: d, ledger, counters: c, tick } = world, p = config.params;
  for (const object of d.objects) object.freshness *= 1 - p.decay;
  if (tick === p.withdrawTick) {
    c.withdrawals++;
    d.providerCoverage.fill(0);
    ctx.emit('withdrawal', 'Prospective contribution mandates withdrawn. Private context was never offered for pooled sale; accrued payments remain owed.');
  }
  if (tick > 0 && tick % p.mandateTicks === 0) {
    d.providerCoverage.fill(0);
    d.expired++;
    ctx.emit('mandate-expiry', 'Contribution mandate term ended; no automatic extension. New uses are blocked.');
  }
  if (tick % 30 === 0) subscriptionPeriod(world, ctx);
  const perActorTasks = Math.floor(((tick % 30) + 1) * p.tasks / 30) - Math.floor((tick % 30) * p.tasks / 30);
  let fulfilled = 0, attempted = 0, unmet = 0;
  for (const actor of d.consumers) {
    if (actor.pendingSwitch && actor.pendingSwitch.due <= tick) {
      const succeeds = ctx.chance(`switch:${actor.id}`, p.switchSuccess);
      if (succeeds && transfer(ledger, `buyer:${actor.id}`, 'outside', p.switchingCost, 'switch-cost', tick)) {
        actor.provider = actor.pendingSwitch.provider;
        c.switches++;
      } else actor.subscribed = false;
      actor.pendingSwitch = null;
    }
    if (!actor.subscribed || actor.pendingSwitch) { unmet += perActorTasks; continue; }
    const currentCoverage = tick >= p.mandateTicks || (p.withdrawTick >= 0 && tick >= p.withdrawTick) ? 0 : d.providerCoverage[actor.provider];
    const probability = quality(p.quality, p.qualityEffect * currentCoverage);
    for (let task = 0; task < perActorTasks; task++) {
      attempted++; actor.attempted++;
      if (ctx.chance(`task:${actor.id}:${task}`, probability)) { fulfilled++; actor.fulfilled++; }
    }
    if (config.family === 'F1' && perActorTasks) {
      const observed = fraction(actor.fulfilled, actor.attempted);
      actor.aspiration = 0.8 * actor.aspiration + 0.2 * observed;
    }
  }
  c.attempted += attempted; c.fulfilled += fulfilled; c.unmet += unmet;
  if (tick % 30 === 29) ctx.emit('service', `${fulfilled}/${attempted} attempted AI tasks succeeded on this tick; ${unmet} requests were unmet.`);
  if (tick % 30 === 15 && p.contributors > 0) {
    const eligible = d.objects.filter(object => object.category === 'public' && object.allowed)
      .sort((a, b) => a.maintenanceTick - b.maintenanceTick || a.id - b.id);
    for (const object of eligible) {
      if (ledger.accounts.commons < p.maintenanceCost) break;
      transfer(ledger, 'commons', 'agency', p.maintenanceCost, 'commons-maintenance', tick);
      owe(ledger, `maintenance:${tick}:${object.id}`, 'agency', 'contributors', p.maintenanceCost, tick, 'contributor-payment');
      if (ctx.chance(`maintenance:${object.id}`, p.maintenanceSuccess)) {
        object.freshness = 1; object.maintenanceTick = tick; c.commonsWork++;
      }
    }
  }
}
export function aiMetrics(world) {
  const { domain: d, counters: c, config: { params: p } } = world;
  return [
    { label: 'Distinct eligible consumers (contributor roles overlap)', value: p.consumers, unit: 'people' },
    { label: 'Completed / attempted provider switches', value: `${c.switches} / ${c.switchAttempts}`, unit: '' },
    { label: 'Purchased purpose-scoped contribution services', value: d.purchased, unit: 'services' },
    { label: 'Contribution mandates expired', value: d.expired, unit: 'expiry boundaries' },
    { label: 'Private objects excluded from pooled sale', value: d.objects.filter(object => object.category === 'private').length, unit: 'objects' },
    { label: 'Contributor receipts less modeled effort', value: c.contributorPaidCents - c.contributorEffortCents, unit: 'cents' },
  ];
}
