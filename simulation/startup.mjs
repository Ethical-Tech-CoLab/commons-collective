import { random, quote, stableStringify, hash } from './math.mjs';

export const STARTUP_VERSION = '1.0.0';
const field = (key, label, value, min, max, step, unit, group, kind = 'number') =>
  ({ key, label, value, min, max, step, unit, group, kind });
export const STARTUP_FIELDS = Object.freeze([
  field('capitalEnabled', 'Investor capital available', 1, 0, 1, 1, '', 'Capital and goals', 'toggle'),
  field('capitalUsd', 'Committed startup capital', 6000000, 0, 100000000, 10000, 'USD', 'Capital and goals'),
  field('horizon', 'Planning horizon', 60, 12, 120, 1, 'months', 'Capital and goals'),
  field('breakEvenTarget', 'Target cash break-even', 36, 1, 120, 1, 'month', 'Capital and goals'),
  field('reserveMonths', 'Operating cash reserve', 3, 0, 12, 1, 'months', 'Capital and goals'),
  field('contingencyBps', 'Capital contingency above reserve requirement', 1500, 0, 10000, 100, 'basis points', 'Capital and goals'),
  field('startingMembers', 'Initial planned paying members', 0, 0, 2000000, 100, 'people', 'Member ramp'),
  field('targetMembers', 'Stable planned paying members', 150000, 100, 2000000, 100, 'people', 'Member ramp'),
  field('rampMonths', 'Time to planned member scale', 24, 1, 120, 1, 'months', 'Member ramp'),
  field('rampExponent', 'Ramp shape (1 = linear; above 1 = slower start)', 1.6, 0.5, 3, 0.1, 'coefficient', 'Member ramp'),
  field('launchDelay', 'Planned launch delay', 0, 0, 36, 1, 'months', 'Member ramp'),
  field('minimumLaunchMembers', 'Minimum paid launch cohort', 600, 1, 100000, 1, 'people', 'Member ramp'),
  field('monthlyChurn', 'Monthly member churn to replace', 0.015, 0, 0.25, 0.005, 'fraction', 'Member ramp'),
  field('feeUsd', 'Monthly membership service fee', 3, 0.25, 50, 0.25, 'USD/member', 'Member value'),
  field('covenantBps', 'Commons share of received service fees', 2000, 0, 10000, 100, 'basis points', 'Member value'),
  field('retailUsd', 'Comparable individual AI subscription', 20, 1, 1000, 1, 'USD/month', 'Member value'),
  field('providerVariableUsd', 'Provider cost per member', 14, 0, 1000, 0.5, 'USD/month', 'Member value'),
  field('providerSetupUsd', 'Provider contract setup per period', 200, 0, 1000000, 100, 'USD/month', 'Member value'),
  field('providerMarkupBps', 'Provider markup', 1500, 0, 10000, 100, 'basis points', 'Member value'),
  field('minimumSavingUsd', 'Required member saving after fees', 0.5, 0.01, 100, 0.01, 'USD/month', 'Member value'),
  field('staffStart', 'Initial staff', 3, 1, 4, 1, 'people', 'Staffing'),
  field('staffTarget', 'Staff at stable scale', 10, 1, 30, 1, 'people', 'Staffing'),
  field('staffRampMonths', 'Hiring ramp', 24, 1, 120, 1, 'months', 'Staffing'),
  field('annualStaffUsd', 'Fully loaded annual cost per staff member', 120000, 12000, 500000, 1000, 'USD/person/year', 'Staffing'),
  field('hiringUsd', 'Recruiting/equipment cost per new hire', 5000, 0, 100000, 500, 'USD/person', 'Staffing'),
  field('setupUsd', 'One-time external launch setup (excludes staff payroll)', 100000, 0, 10000000, 10000, 'USD', 'Staffing'),
  field('marketingStartUsd', 'Initial fixed marketing/community budget', 3000, 0, 1000000, 500, 'USD/month', 'Operating costs'),
  field('marketingTargetUsd', 'Stable fixed marketing/community budget', 15000, 0, 1000000, 500, 'USD/month', 'Operating costs'),
  field('acquisitionUsd', 'Incremental acquisition cost per new paid member', 15, 0, 1000, 1, 'USD/new member', 'Operating costs'),
  field('onboardingUsd', 'Funded onboarding/support per new paid member', 5, 0, 1000, 1, 'USD/new member', 'Operating costs'),
  field('supportUsd', 'Ongoing variable member support', 0.25, 0, 100, 0.05, 'USD/member/month', 'Operating costs'),
  field('travelStartUsd', 'Initial travel', 1000, 0, 1000000, 500, 'USD/month', 'Operating costs'),
  field('travelTargetUsd', 'Stable travel', 5000, 0, 1000000, 500, 'USD/month', 'Operating costs'),
  field('eventUsd', 'Event budget per event', 15000, 0, 1000000, 1000, 'USD/event', 'Operating costs'),
  field('eventEveryMonths', 'Event cadence', 3, 1, 12, 1, 'months', 'Operating costs'),
  field('technologyStartUsd', 'Initial technology and tooling', 2000, 0, 1000000, 500, 'USD/month', 'Operating costs'),
  field('technologyTargetUsd', 'Stable technology and tooling', 10000, 0, 1000000, 500, 'USD/month', 'Operating costs'),
  field('legalStartUsd', 'Initial legal/accounting/assurance', 2000, 0, 1000000, 500, 'USD/month', 'Operating costs'),
  field('legalTargetUsd', 'Stable legal/accounting/assurance', 6000, 0, 1000000, 500, 'USD/month', 'Operating costs'),
  field('adminStartUsd', 'Initial office/insurance/admin', 1000, 0, 1000000, 500, 'USD/month', 'Operating costs'),
  field('adminTargetUsd', 'Stable office/insurance/admin', 5000, 0, 1000000, 500, 'USD/month', 'Operating costs'),
  field('growthUncertainty', 'Member-scale uncertainty around the plan', 0.25, 0, 0.75, 0.05, 'fraction', 'Monte Carlo assumptions'),
  field('costUncertainty', 'Correlated cost uncertainty', 0.15, 0, 0.75, 0.05, 'fraction', 'Monte Carlo assumptions'),
  field('churnUncertainty', 'Churn-rate uncertainty', 0.3, 0, 0.9, 0.05, 'fraction', 'Monte Carlo assumptions'),
  field('delayUncertainty', 'Additional launch-delay stress', 6, 0, 24, 1, 'maximum months', 'Monte Carlo assumptions'),
].map(value => Object.freeze(value)));

export function createStartupConfig() {
  return { version: 1, seed: 'ccsl-startup-capital-v1', params: Object.fromEntries(STARTUP_FIELDS.map(item => [item.key, item.value])) };
}
export function validateStartupConfig(value) {
  if (!value || value.version !== 1 || typeof value.seed !== 'string' || !value.seed.trim() || value.seed.length > 80
      || Object.keys(value).sort().join(',') !== 'params,seed,version') throw new Error('Invalid startup-finance configuration.');
  if (!value.params || Object.keys(value.params).length !== STARTUP_FIELDS.length) throw new Error('Startup-finance parameters are incomplete or unknown.');
  for (const definition of STARTUP_FIELDS) {
    const number = value.params[definition.key];
    if (!Number.isFinite(number) || number < definition.min || number > definition.max || (definition.step >= 1 && !Number.isSafeInteger(number))) {
      throw new RangeError(`${definition.label}: enter ${definition.min}..${definition.max} ${definition.unit}.`);
    }
  }
  const p = value.params;
  if (p.startingMembers > p.targetMembers) throw new Error('The target member base cannot be below the starting base.');
  if (p.staffTarget < p.staffStart) throw new Error('Staff target cannot be below initial staffing in this growth plan.');
  if (p.breakEvenTarget + 5 > p.horizon) throw new Error('Include at least six months from the target break-even month to check durability.');
  return JSON.parse(JSON.stringify(value));
}
const cents = dollars => Math.round(dollars * 100);
const interpolate = (start, end, fraction) => start + (end - start) * fraction;
const sum = values => values.reduce((a, b) => a + b, 0);
function basisPoints(amount, rate, roundUp = false) {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Invalid basis-point allocation base.');
  const numerator = BigInt(amount) * BigInt(rate);
  const result = Number((numerator + (roundUp ? 9999n : 0n)) / 10000n);
  if (!Number.isSafeInteger(result)) throw new Error('Allocation exceeds exact monetary limits.');
  return result;
}
function triangle(uniform, width) {
  return uniform < 0.5 ? 1 - width + Math.sqrt(2 * uniform) * width : 1 + width - Math.sqrt(2 * (1 - uniform)) * width;
}
function firstDurable(rows, key) {
  for (let i = 0; i + 5 < rows.length; i++) {
    if (rows.slice(i, i + 6).every(row => row[key] >= 0)) return rows[i].month;
  }
  return null;
}
export function projectStartup(input, options = {}) {
  const config = validateStartupConfig(input), p = config.params;
  const replication = options.replication ?? 0;
  if (!Number.isSafeInteger(replication) || replication < 0) throw new Error('Invalid startup replication index.');
  const uncertain = options.uncertain === true;
  const draw = name => random(config.seed, `startup:${replication}:${name}`);
  const factors = {
    growth: uncertain ? triangle(draw('growth'), p.growthUncertainty) : 1,
    cost: uncertain ? triangle(draw('cost'), p.costUncertainty) : 1,
    churn: uncertain ? triangle(draw('churn'), p.churnUncertainty) : 1,
    delay: p.launchDelay + (uncertain ? Math.floor(draw('delay') * (p.delayUncertainty + 1)) : 0),
  };
  const capital = p.capitalEnabled ? cents(p.capitalUsd) : 0;
  const setup = cents(p.setupUsd * factors.cost);
  const rows = [], totals = {
    setup, payroll: 0, hiring: 0, fixedMarketing: 0, acquisition: 0, onboarding: 0,
    support: 0, travel: 0, events: 0, technology: 0, legal: 0, administration: 0, commons: 0,
  };
  let cumulative = -setup, minimumPreFunding = -setup, requiredWithReserve = setup;
  let priorMembers = 0, priorStaff = 0, firstShortfall = capital < setup ? 0 : null;
  let cumulativeFees = 0;
  for (let month = 1; month <= p.horizon; month++) {
    const progress = Math.min(1, Math.max(0, (month - factors.delay) / p.rampMonths));
    const desired = Math.round(interpolate(p.startingMembers, p.targetMembers * factors.growth, progress ** p.rampExponent));
    const price = desired ? Math.ceil(quote(desired, cents(p.providerSetupUsd), cents(p.providerVariableUsd), p.providerMarkupBps) / desired) + cents(p.feeUsd) : null;
    const saving = price === null ? null : cents(p.retailUsd) - price;
    const priceEligible = desired >= p.minimumLaunchMembers && saving >= cents(p.minimumSavingUsd);
    const members = priceEligible ? desired : 0;
    const lost = Math.min(priorMembers, Math.round(priorMembers * p.monthlyChurn * factors.churn));
    const retained = Math.max(0, priorMembers - lost);
    const acquired = Math.max(0, members - retained);
    const growthAcquisitions = Math.max(0, members - priorMembers);
    const replacementAcquisitions = acquired - growthAcquisitions;
    const staffingProgress = p.staffRampMonths === 1 ? 1 : Math.min(1, (month - 1) / (p.staffRampMonths - 1));
    const staff = p.staffStart + Math.floor((p.staffTarget - p.staffStart) * staffingProgress + 1e-9);
    const hires = Math.max(0, staff - priorStaff);
    const overheadProgress = staffingProgress;
    const fees = members * cents(p.feeUsd);
    const commons = basisPoints(fees, p.covenantBps);
    const payroll = cents(staff * p.annualStaffUsd / 12 * factors.cost);
    const hiring = cents(hires * p.hiringUsd * factors.cost);
    const fixedMarketing = cents(interpolate(p.marketingStartUsd, p.marketingTargetUsd, overheadProgress) * factors.cost);
    const acquisition = cents(acquired * p.acquisitionUsd * factors.cost);
    const onboarding = cents(acquired * p.onboardingUsd * factors.cost);
    const support = cents(members * p.supportUsd * factors.cost);
    const travel = cents(interpolate(p.travelStartUsd, p.travelTargetUsd, overheadProgress) * factors.cost);
    const events = month % p.eventEveryMonths === 0 ? cents(p.eventUsd * factors.cost) : 0;
    const technology = cents(interpolate(p.technologyStartUsd, p.technologyTargetUsd, overheadProgress) * factors.cost);
    const legal = cents(interpolate(p.legalStartUsd, p.legalTargetUsd, overheadProgress) * factors.cost);
    const administration = cents(interpolate(p.adminStartUsd, p.adminTargetUsd, overheadProgress) * factors.cost);
    const categories = { payroll, hiring, fixedMarketing, acquisition, onboarding, support, travel, events, technology, legal, administration, commons };
    for (const [key, amount] of Object.entries(categories)) totals[key] += amount;
    const operatingUses = sum(Object.entries(categories).filter(([key]) => key !== 'commons').map(([, amount]) => amount));
    const preRevenue = cumulative - operatingUses;
    minimumPreFunding = Math.min(minimumPreFunding, preRevenue);
    const averageEvents = cents(p.eventUsd / p.eventEveryMonths * factors.cost);
    const recurringUses = payroll + fixedMarketing + support + travel + technology + legal + administration + averageEvents
      + cents(replacementAcquisitions * (p.acquisitionUsd + p.onboardingUsd) * factors.cost);
    const reserve = Math.ceil(recurringUses * p.reserveMonths);
    requiredWithReserve = Math.max(requiredWithReserve, reserve - preRevenue);
    if (firstShortfall === null && capital + preRevenue < 0) firstShortfall = month;
    const cashProfit = fees - commons - operatingUses;
    const recurringProfit = fees - commons - recurringUses;
    cumulative += cashProfit;
    cumulativeFees += fees;
    rows.push({ month, members, desiredMembers: desired, priceEligible, staff, hires, acquired, growthAcquisitions, replacementAcquisitions,
      fees, commons, ...categories, operatingUses, cashProfit, recurringProfit, reserve,
      memberPrice: members ? price : null, memberSaving: members ? saving : null,
      capitalFreeCash: cumulative, preRevenueCash: capital + preRevenue, cash: capital + cumulative,
      financed: firstShortfall === null, cumulativeFees });
    priorMembers = members; priorStaff = staff;
  }
  const operatingBreakEvenMonth = firstDurable(rows, 'cashProfit');
  const runRateBreakEvenMonth = firstDurable(rows, 'recurringProfit');
  const needed = Math.max(0, requiredWithReserve);
  const contingency = basisPoints(needed, p.contingencyBps, true);
  const capitalRequired = needed + contingency;
  const last = rows.at(-1);
  const memberSavings = rows.filter(row => row.members).map(row => row.memberSaving);
  const matureCashHealthy = rows.slice(-6).every(row => row.cashProfit >= 0);
  const matureRetainedPerMember = cents(p.feeUsd) * (1 - p.covenantBps / 10000)
    - cents(p.supportUsd * factors.cost)
    - p.monthlyChurn * factors.churn * cents((p.acquisitionUsd + p.onboardingUsd) * factors.cost);
  const matureFixed = cents((p.staffTarget * p.annualStaffUsd / 12 + p.marketingTargetUsd + p.travelTargetUsd
    + p.eventUsd / p.eventEveryMonths + p.technologyTargetUsd + p.legalTargetUsd + p.adminTargetUsd) * factors.cost);
  const runRateMembersNeeded = matureRetainedPerMember > 0 ? Math.ceil(matureFixed / matureRetainedPerMember) : null;
  const cumulativeBreakEvenMonth = rows.find(row => row.capitalFreeCash >= 0)?.month ?? null;
  const potentialCapitalRepaymentMonth = p.capitalEnabled && firstShortfall === null
    ? rows.find(row => row.cash >= capital + row.reserve)?.month ?? null : null;
  const budgetThrough = month => {
    const selected = rows.filter(row => row.month <= month);
    const uses = Object.fromEntries(Object.keys(totals).map(key => [key, key === 'setup' ? setup : sum(selected.map(row => row[key]))]));
    const grossFees = sum(selected.map(row => row.fees));
    return { throughMonth: month, uses, grossFees, totalUses: sum(Object.values(uses)),
      netFundingConsumed: sum(Object.values(uses)) - grossFees,
      peakCashDeficit: Math.max(setup, ...selected.map(row => capital - row.preRevenueCash)),
      note: 'Uses include fee-financed commons transfers. Investor capital bridges the net cash gap; it is not the only source paying these costs.' };
  };
  const summary = {
    capital, capitalRequired, capitalForNoShortfall: Math.max(0, -minimumPreFunding),
    capitalWithReserve: needed, reserveAddon: needed - Math.max(0, -minimumPreFunding),
    contingency, firstShortfallMonth: firstShortfall, funded: firstShortfall === null,
    meetsReserveAndContingency: capital >= capitalRequired,
    operatingBreakEvenMonth, runRateBreakEvenMonth, cumulativeBreakEvenMonth, potentialCapitalRepaymentMonth,
    runRateMembersNeeded, lastMembers: last.members, lastStaff: last.staff, lastMonthlyProfit: last.cashProfit,
    endingCash: last.cash, minimumPlannedCash: capital + minimumPreFunding,
    minimumMemberSaving: memberSavings.length ? Math.min(...memberSavings) : null,
    matureCashHealthy,
    meetsBreakEvenTarget: operatingBreakEvenMonth !== null && operatingBreakEvenMonth <= p.breakEvenTarget && matureCashHealthy,
    memberPriceProtected: memberSavings.length > 0 && memberSavings.every(value => value >= cents(p.minimumSavingUsd)),
    totalFees: cumulativeFees, totalUses: sum(Object.values(totals)),
  };
  if (capital + cumulativeFees - sum(Object.values(totals)) !== last.cash) throw new Error('Startup cash-flow reconciliation failed.');
  for (const value of [summary.capitalRequired, summary.totalFees, summary.totalUses, summary.endingCash]) {
    if (!Number.isSafeInteger(value)) throw new Error('Startup finance exceeded exact monetary limits.');
  }
  return { format: 'ccsl-startup-projection', version: 1, methodVersion: STARTUP_VERSION, config, factors, summary, totals, rows,
    budgetToTarget: budgetThrough(p.breakEvenTarget),
    budgetToBreakEven: operatingBreakEvenMonth === null ? null : budgetThrough(operatingBreakEvenMonth),
    id: hash(stableStringify({ config, factors })),
    notice: 'Conditional cohort cash-flow projection, not an executed agent economy. Growth is a plan, not a prediction. Negative cash denotes an unfunded plan. Member price protection assumes equivalent provider service and no member-paid switching cost. Staff, acquisition and other costs are uncalibrated assumptions; debt service, taxes and investor return requirements are not modeled.' };
}

const quantile = (values, probability) => {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * probability;
  const index = Math.floor(position);
  return sorted[index] + (sorted[Math.ceil(position)] - sorted[index]) * (position - index);
};
export function summarizeStartupTrials(config, trials) {
  validateStartupConfig(config);
  if (!Array.isArray(trials) || trials.length < 2) throw new Error('At least two completed finance trials are required.');
  const capital = trials.map(trial => trial.summary.capitalRequired);
  const breakEven = trials.map(trial => trial.summary.operatingBreakEvenMonth).filter(month => month !== null);
  const successful = trials.filter(trial => trial.summary.funded && trial.summary.meetsReserveAndContingency
    && trial.summary.meetsBreakEvenTarget && trial.summary.memberPriceProtected).length;
  return {
    format: 'ccsl-startup-monte-carlo', version: 1, methodVersion: STARTUP_VERSION, config,
    trials: trials.length, successful, conditionalSuccessShare: successful / trials.length,
    funded: trials.filter(trial => trial.summary.funded).length,
    meetingTarget: trials.filter(trial => trial.summary.meetsBreakEvenTarget).length,
    neverCashBreakEven: trials.length - breakEven.length,
    requiredCapital: { p05: quantile(capital, 0.05), median: quantile(capital, 0.5), p90: quantile(capital, 0.9), p95: quantile(capital, 0.95), max: Math.max(...capital) },
    breakEvenMonths: breakEven.length ? { p05: quantile(breakEven, 0.05), median: quantile(breakEven, 0.5), p95: quantile(breakEven, 0.95), count: breakEven.length } : null,
    notice: 'Shares describe declared triangular input assumptions and uniform launch-delay stress, not empirical success probabilities. Capital on/off does not alter the member ramp or spending plan; unfunded projected activity is not executed activity.',
  };
}
