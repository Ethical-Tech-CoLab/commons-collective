import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { run, summarize } from '../simulation/engine.mjs';
import { ENGINE_VERSION, validateConfig } from '../simulation/config.mjs';
import { exportScenario } from '../simulation/artifacts.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((arg, index, all) =>
  arg.startsWith('--') ? [arg.slice(2), all[index + 1]] : null).filter(Boolean));
if (!args.source || !args.design || !args.output) {
  throw new Error('Use --source scenario.json --design design.json --output results.json [--replications N] [--phase screen|validate] [--periods N] [--paired true] [--profile ID].');
}
const source = JSON.parse(await readFile(path.resolve(args.source), 'utf8'));
const baseline = validateConfig(source.config);
if (baseline.modelId !== 'ai-commons' || baseline.arrangement !== 'A3') throw new Error('This study is scoped to AI Commons A3.');
const design = JSON.parse(await readFile(path.resolve(args.design), 'utf8'));
const replications = Number(args.replications ?? 4);
if (!Number.isSafeInteger(replications) || replications < 1 || replications > 1000) throw new Error('Invalid replication count.');
const periods = Number(args.periods ?? baseline.params.periods);
if (!Number.isSafeInteger(periods) || periods < 1 || periods > 120) throw new Error('Invalid horizon.');
const phase = args.phase ?? 'screen';
const paired = args.paired === 'true';
const profiles = design.profiles.filter(profile => !args.profile || profile.id === args.profile);
if (!profiles.length) throw new Error('No matching study profile.');

function quantile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * fraction;
  const low = Math.floor(index), high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}
function describe(values) {
  return { min: Math.min(...values), p05: quantile(values, 0.05), median: quantile(values, 0.5), p95: quantile(values, 0.95), max: Math.max(...values) };
}
function analyze(world, direct) {
  const p = world.config.params;
  const periodRows = Array.from({ length: p.periods }, (_, period) => ({
    period: period + 1, fees: 0, covenant: 0, costIncurred: 0,
    closingCash: world.timeline[period + 1].operatorCashCents,
    participants: world.timeline[period + 1].participants,
  }));
  const members = new Set();
  const costs = Array(p.consumers).fill(0), comparableRetail = Array(p.consumers).fill(0);
  for (const item of world.ledger.payable) {
    if (item.kind === 'operator-cost') periodRows[Math.floor(item.dueTick / 30)].costIncurred += item.cents;
    if (['service-payment', 'administration-fee'].includes(item.kind) && item.from.startsWith('buyer:')) {
      const buyer = Number(item.from.slice(6));
      costs[buyer] += item.cents;
      if (item.kind === 'service-payment') comparableRetail[buyer] += p.retailPrice;
      else members.add(buyer);
    }
  }
  for (const [tick, from, to, cents, kind] of world.ledger.journal) {
    const row = periodRows[Math.floor(tick / 30)];
    if (kind === 'administration-fee') row.fees += cents;
    if (kind === 'commons-transfer') row.covenant += cents;
    if (kind === 'switch-cost' && from.startsWith('buyer:')) costs[Number(from.slice(6))] += cents;
  }
  const margins = periodRows.map(row => row.fees - row.covenant - row.costIncurred);
  const late = margins.slice(-Math.min(12, margins.length));
  const benefits = [...members].map(id => comparableRetail[id] - costs[id]);
  const operatorArrears = world.ledger.pending.filter(item => item.from === 'operator').reduce((sum, item) => sum + item.cents, 0);
  const summary = summarize(world);
  const earnedSurplus = margins.reduce((a, b) => a + b, 0);
  const lastYearSurplus = late.reduce((a, b) => a + b, 0);
  const financiallyHealthy = !world.institutionFailed && operatorArrears === 0 && earnedSurplus >= 0
    && lastYearSurplus >= 0 && summary.operatorCashCents >= 3 * p.costA3;
  let serviceWorse = null, lostFulfillments = null, extraUnmet = null;
  if (direct) {
    serviceWorse = 0; lostFulfillments = 0;
    for (const id of members) {
      const actor = world.domain.consumers[id], comparison = direct.domain.consumers[id];
      if (actor.attempted < comparison.attempted || actor.fulfilled < comparison.fulfilled) serviceWorse++;
      lostFulfillments += Math.max(0, comparison.fulfilled - actor.fulfilled);
    }
    extraUnmet = world.counters.unmet - direct.counters.unmet;
  }
  const memberCostLosers = benefits.filter(value => value < 0).length;
  const memberCostNonWinners = benefits.filter(value => value <= 0).length;
  const allMemberCostBetter = members.size > 0 && memberCostNonWinners === 0;
  return {
    institutionFailed: world.institutionFailed, firstFailureTick: world.events.find(event => event.type === 'institution-failed')?.tick ?? null,
    financiallyHealthy, jointlyHealthy: direct ? financiallyHealthy && allMemberCostBetter && serviceWorse === 0 && extraUnmet <= 0 : null,
    earnedSurplusCents: earnedSurplus, meanPeriodSurplusCents: earnedSurplus / p.periods,
    lastYearSurplusCents: lastYearSurplus, closingCashCents: summary.operatorCashCents,
    minimumPeriodCashCents: Math.min(p.openingCash, ...periodRows.map(row => row.closingCash)),
    operatorArrearsCents: operatorArrears,
    everPayingMembers: members.size, memberCostLosers, memberCostNonWinners,
    minimumMemberBenefitCents: benefits.length ? Math.min(...benefits) : null,
    medianMemberBenefitCents: quantile(benefits, 0.5), aggregatePurchasingBenefitCents: summary.memberNetBenefitCents,
    meanParticipants: periodRows.reduce((sum, row) => sum + row.participants, 0) / p.periods,
    minimumParticipants: Math.min(...periodRows.map(row => row.participants)),
    noDealPeriods: periodRows.filter(row => row.participants === 0).length,
    serviceWorseMembers: serviceWorse, lostFulfilledTasksAmongMembers: lostFulfillments, extraUnmet,
    attempted: summary.attempted, fulfilled: summary.fulfilled, unmet: summary.unmet,
    qualityRate: summary.qualityRate, commonsWork: summary.commonsWork,
    contributionServicesPurchased: world.domain.purchased,
    contributorPaidCents: summary.contributorPaidCents,
    periods: periodRows.map((row, index) => ({ ...row, surplus: margins[index] })),
  };
}

const started = performance.now();
const results = [];
for (const profile of profiles) {
  const trials = [];
  for (let replication = 0; replication < replications; replication++) {
    const config = validateConfig({
      ...baseline, ...(profile.config ?? {}),
      seed: `viability-${phase}-${String(replication).padStart(4, '0')}`,
      params: { ...baseline.params, ...profile.params, periods },
    });
    const world = run(config);
    const direct = paired ? run({ ...config, arrangement: 'A0' }) : null;
    trials.push({ replication, seed: config.seed, ...analyze(world, direct) });
  }
  const template = validateConfig({ ...baseline, ...(profile.config ?? {}), params: { ...baseline.params, ...profile.params, periods } });
  const counts = {
    trials: replications, financiallyHealthy: trials.filter(row => row.financiallyHealthy).length,
    jointlyHealthy: paired ? trials.filter(row => row.jointlyHealthy).length : null,
    institutionalFailures: trials.filter(row => row.institutionFailed).length,
    anyMemberCostLoss: trials.filter(row => row.memberCostLosers > 0).length,
    anyMemberNotStrictlyBetterOnCost: trials.filter(row => row.memberCostNonWinners > 0 || row.everPayingMembers === 0).length,
    anyServiceWorse: paired ? trials.filter(row => row.serviceWorseMembers > 0).length : null,
  };
  const distributions = Object.fromEntries(['meanPeriodSurplusCents','closingCashCents','minimumPeriodCashCents',
    'meanParticipants','minimumParticipants','everPayingMembers','aggregatePurchasingBenefitCents','commonsWork']
    .map(key => [key, describe(trials.map(row => row[key]))]));
  const summary = { id: profile.id, description: profile.description, config: template, counts, distributions, trials };
  results.push(summary);
  console.log(JSON.stringify({ profile: profile.id, ...counts,
    monthlySurplusMedianUSD: distributions.meanPeriodSurplusCents.median / 100,
    participantsP05: distributions.meanParticipants.p05,
    minMemberBenefitUSD: Math.min(...trials.map(row => row.minimumMemberBenefitCents ?? Infinity)) / 100,
    seconds: Math.round((performance.now() - started) / 1000) }));
}
const output = {
  study: 'AI Commons operator-and-member viability', engineVersion: ENGINE_VERSION,
  createdAt: new Date().toISOString(), phase, paired, replications, periods,
  sourceConfigSha256: createHash('sha256').update(JSON.stringify(baseline)).digest('hex'),
  criteria: {
    financial: 'No funding stop or operator arrears; nonnegative earned surplus excluding opening capital and restricted grants; nonnegative final 12-period surplus; closing unrestricted cash >= three periods of operator cost.',
    memberCost: 'Each consumer ever charged an administration fee pays strictly less, including service obligations, administration fees and completed switch charges, than retail for the same contracted service-period basket.',
    service: 'In a matched A0 run, no paying member loses attempted or fulfilled tasks; total unmet demand does not increase.',
    limitation: 'Synthetic conditional outcomes, not empirical probabilities or proof of contributor welfare. Individual maintenance effort/payments and nonmonetary burdens are not established by this engine.',
  },
  results,
};
await mkdir(path.dirname(path.resolve(args.output)), { recursive: true });
await writeFile(path.resolve(args.output), JSON.stringify(output, null, 2) + '\n');
await writeFile(path.join(path.dirname(path.resolve(args.output)), 'original-operating-scenario.json'), JSON.stringify(exportScenario(baseline), null, 2) + '\n');
if (args.scenarios) {
  await mkdir(path.resolve(args.scenarios), { recursive: true });
  for (const result of results) await writeFile(path.join(path.resolve(args.scenarios), `${result.id}.json`), JSON.stringify(exportScenario(result.config), null, 2) + '\n');
}
