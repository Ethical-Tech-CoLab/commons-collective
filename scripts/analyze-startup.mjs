import { mkdir, writeFile } from 'node:fs/promises';
import { createStartupConfig, projectStartup, summarizeStartupTrials } from '../simulation/startup.mjs';

const output = new URL('../agentic-model/experiments/viability-2026-09-20/', import.meta.url);
await mkdir(output, { recursive: true });
const candidates = [
  ['member-value-first', { feeUsd: 2.5, capitalUsd: 6500000 }],
  ['balanced', {}],
  ['higher-fee', { feeUsd: 3.25 }],
  ['slower-ramp', { rampMonths: 36, breakEvenTarget: 42 }],
  ['lower-scale', { targetMembers: 100000 }],
  ['higher-acquisition-cost', { acquisitionUsd: 30 }],
  ['lower-acquisition-cost', { acquisitionUsd: 8 }],
  ['higher-staff-cost', { annualStaffUsd: 150000 }],
  ['lower-staff-cost', { annualStaffUsd: 100000 }],
  ['faster-ramp', { rampMonths: 18, breakEvenTarget: 30 }],
];
function wilson(successes, count) {
  const z = 1.959963984540054, p = successes / count, denominator = 1 + z * z / count;
  const center = (p + z * z / (2 * count)) / denominator;
  const half = z * Math.sqrt(p * (1 - p) / count + z * z / (4 * count * count)) / denominator;
  return { lower: center - half, upper: center + half, meaning: '95% Monte Carlo sampling interval conditional on declared input distributions; not a real-world investment confidence interval.' };
}
function study(seed, count, selected) {
  return selected.map(([id, patch]) => {
    const config = createStartupConfig();
    config.seed = seed;
    Object.assign(config.params, patch);
    const baseline = projectStartup(config);
    const trials = Array.from({ length: count }, (_, replication) => ({ summary: projectStartup(config, { uncertain: true, replication }).summary }));
    const experiment = summarizeStartupTrials(config, trials);
    console.log(JSON.stringify({ stage: seed, id, trials: count, successes: experiment.successful,
      capitalP95Usd: experiment.requiredCapital.p95 / 100, cashBreakEven: baseline.summary.operatingBreakEvenMonth }));
    return { id, configuration: config, baselineSummary: baseline.summary, baselineBudgetToBreakEven: baseline.budgetToBreakEven,
      experiment, monteCarloInterval: wilson(experiment.successful, count) };
  });
}
const design = study('startup-design-v1', 1000, candidates);
const validation = study('startup-holdout-v1', 2000, candidates.filter(([id]) => ['balanced', 'member-value-first'].includes(id)));
const config = createStartupConfig();
const funded = projectStartup(config);
const noCapital = projectStartup({ ...config, params: { ...config.params, capitalEnabled: 0 } });
const valueFirst = projectStartup({ ...config, params: { ...config.params, feeUsd: 2.5, capitalUsd: 6500000 } });
const smallBase = projectStartup({ ...config, params: { ...config.params, targetMembers: 1000 } });
const uncompetitiveProvider = projectStartup({ ...config, params: { ...config.params, providerVariableUsd: 15.5 } });
const notes = {
  scope: 'Staffed investor-funded startup finance for AI Commons; distinct from the existing individual-agent operating model.',
  units: 'Projection and result cash fields are integer USD cents; config monetary inputs are USD.',
  method: '10,000 design trials across ten profiles; 4,000 independent-seed holdout trials across two selected profiles. Triangular member-scale, correlated cost and churn-rate assumptions, plus uniform additional launch delay.',
  memberProtection: 'Charge fees only when the minimum launch cohort and a minimum $0.50 monthly saving after fees are satisfied. Price comparison assumes equivalent AI service and an existing-provider procurement case; it is not proof of nonmonetary welfare or general migration safety.',
  investorBoundary: 'Capital funds losses and reserves, not revenue or guaranteed growth. No debt service, taxes, investor required return or legally approved repayment is modeled.',
  baselineDiagnosis: {
    originalSavedRunChecksum: '4248275e8c798890', exactlyReplayed: true,
    initialPayingMembers: 229, feeUsd: 4, covenantFraction: 0.2, retainedFeesPerPeriodUsd: 732.8,
    operatingCostPerPeriodUsd: 3500, fundingStopTick: 90, endingOperatorArrearsUsd: 3500,
    minimumPayingMembersForOriginalCost: 1094, eligibleConsumers: 1000,
    aggregatePurchasingCostDisadvantageUsd: 2116.8,
  },
};
for (const [name, data] of [
  ['startup-design-results.json', { notes, results: design }],
  ['startup-holdout-results.json', { notes, results: validation }],
  ['funded-startup-plan.json', funded],
  ['no-capital-startup-plan.json', noCapital],
  ['member-value-first-plan.json', valueFirst],
  ['structural-stresses.json', { notes, cases: [
    { id: 'only-1000-paying-members', summary: smallBase.summary },
    { id: 'provider-cost-15.50', summary: uncompetitiveProvider.summary },
  ] }],
]) {
  await writeFile(new URL(name, output), JSON.stringify(data, null, 2) + '\n');
}
console.log(JSON.stringify({ deterministic: funded.summary, usesToBreakEven: funded.budgetToBreakEven, usesToTarget: funded.budgetToTarget }, null, 2));
