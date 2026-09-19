import { ARRANGEMENTS, validateConfig, getModel } from './config.mjs';
import { run, summarize } from './engine.mjs';

export function createExperiment(input, replications = 5, parameterKey = null, parameterValues = []) {
  const config = validateConfig(input);
  if (!Number.isSafeInteger(replications) || replications < 2 || replications > 30) throw new RangeError('Use 2-30 independent replications per arrangement.');
  let values = [null];
  if (parameterKey !== null) {
    if (!getModel(config.modelId).fields.some(field => field.key === parameterKey)) throw new RangeError('Unknown sweep parameter.');
    if (!Array.isArray(parameterValues) || parameterValues.length < 2 || parameterValues.length > 5 || new Set(parameterValues).size !== parameterValues.length) throw new RangeError('Choose 2-5 distinct numeric sweep values.');
    values = parameterValues;
  } else if (parameterValues.length) throw new RangeError('Sweep values need a selected parameter.');
  const jobs = [];
  for (const [setting, value] of values.entries()) {
    for (let replication = 0; replication < replications; replication++) {
      for (const arrangement of Object.keys(ARRANGEMENTS)) {
        const candidate = JSON.parse(JSON.stringify(config));
        candidate.arrangement = arrangement;
        candidate.seed = `${config.seed.slice(0, 58)}|r${replication}`;
        if (parameterKey !== null) candidate.params[parameterKey] = value;
        validateConfig(candidate);
        jobs.push({ setting, replication, arrangement, config: candidate });
      }
    }
  }
  return { modelId: config.modelId, replications, parameterKey, values, jobs, total: jobs.length };
}
function mean(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; }
function stderr(values) {
  if (values.length < 2) return null;
  const center = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - center) ** 2, 0) / (values.length - 1) / values.length);
}
export function analyzeExperiment(plan, outcomes) {
  if (outcomes.length !== plan.total) throw new Error('Experiment is incomplete; do not label partial runs a complete comparison.');
  const seen = new Set();
  for (const outcome of outcomes) {
    const key = `${outcome.setting}:${outcome.replication}:${outcome.arrangement}`;
    if (seen.has(key) || !plan.jobs.some(job => `${job.setting}:${job.replication}:${job.arrangement}` === key)) throw new Error('Duplicate or unplanned trial.');
    seen.add(key);
    if (outcome.summary.status !== 'complete' || outcome.summary.modelId !== plan.modelId) throw new Error('Invalid or mismatched trial.');
  }
  return {
    modelId: plan.modelId, replications: plan.replications, total: plan.total, parameterKey: plan.parameterKey,
    note: 'Conditional simulation results under illustrative assumptions. Monte Carlo standard error is not empirical uncertainty. Refusal and unmet demand must be considered alongside cash savings.',
    settings: plan.values.map((value, setting) => {
      const rows = outcomes.filter(row => row.setting === setting);
      return {
        value,
        arrangements: Object.keys(ARRANGEMENTS).map(arrangement => {
          const group = rows.filter(row => row.arrangement === arrangement).map(row => row.summary);
          const quality = group.map(row => row.qualityRate).filter(value => value !== null);
          return {
            arrangement, runs: group.length, meanBenefitCents: mean(group.map(row => row.memberNetBenefitCents)),
            meanQuality: mean(quality), qualityRuns: quality.length,
            meanOperatorCashCents: mean(group.map(row => row.operatorCashCents)),
            meanUnmet: mean(group.map(row => row.unmet)),
            meanContributorPaidCents: mean(group.map(row => row.contributorPaidCents)),
            meanCommonsWork: mean(group.map(row => row.commonsWork)),
            failureRate: mean(group.map(row => Number(row.institutionFailed))),
          };
        }),
        comparisons: ['A1', 'A2', 'A3'].map(arrangement => {
          const deltas = [];
          for (let replication = 0; replication < plan.replications; replication++) {
            const baseline = rows.find(row => row.arrangement === 'A0' && row.replication === replication);
            const treatment = rows.find(row => row.arrangement === arrangement && row.replication === replication);
            deltas.push(treatment.summary.memberNetBenefitCents - baseline.summary.memberNetBenefitCents);
          }
          return { arrangement, baseline: 'A0', pairs: deltas.length, meanDeltaCents: mean(deltas), standardErrorCents: stderr(deltas) };
        }),
      };
    }),
  };
}
export function runExperiment(config, replications = 5, parameterKey = null, parameterValues = []) {
  const plan = createExperiment(config, replications, parameterKey, parameterValues);
  const outcomes = plan.jobs.map(job => ({ ...job, summary: summarize(run(job.config)) }));
  return analyzeExperiment(plan, outcomes);
}
