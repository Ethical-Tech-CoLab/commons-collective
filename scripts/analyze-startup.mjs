import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { createStartupConfig, projectStartup, summarizeStartupTrials, STARTUP_VERSION } from '../simulation/startup.mjs';

export const STUDY_DIRECTORY = 'agentic-model/experiments/viability-2026-09-20/';
export const STUDY_PROFILES = [
  { id: 'member-value-first', name: 'Member value first', patch: { feeUsd: 2.5, capitalUsd: 6500000 } },
  { id: 'balanced', name: 'Balanced reference', patch: {} },
  { id: 'higher-fee', name: 'Higher fee', patch: { feeUsd: 3.25 } },
  { id: 'slower-ramp', name: 'Slower member ramp', patch: { rampMonths: 36, breakEvenTarget: 42 } },
  { id: 'lower-scale', name: 'Lower member scale', patch: { targetMembers: 100000 } },
  { id: 'higher-acquisition-cost', name: 'Higher acquisition cost', patch: { acquisitionUsd: 30 } },
  { id: 'lower-acquisition-cost', name: 'Lower acquisition cost', patch: { acquisitionUsd: 8 } },
  { id: 'higher-staff-cost', name: 'Higher staffing cost', patch: { annualStaffUsd: 150000 } },
  { id: 'lower-staff-cost', name: 'Lower staffing cost', patch: { annualStaffUsd: 100000 } },
  { id: 'faster-ramp', name: 'Faster member ramp', patch: { rampMonths: 18, breakEvenTarget: 30 } },
];
export const STUDY_PHASES = [
  { id: 'design', seed: 'startup-design-v1', replications: 1000, profiles: STUDY_PROFILES.map(profile => profile.id) },
  { id: 'holdout', seed: 'startup-holdout-v1', replications: 2000, profiles: ['member-value-first', 'balanced'] },
];
export const METHOD_FILES = ['simulation/startup.mjs', 'simulation/math.mjs', 'scripts/analyze-startup.mjs'];
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const normalizedSourceHash = value => sha256(value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'));
const json = value => JSON.stringify(value, null, 2) + '\n';

export function trialInputs() {
  return {
    format: 'commons-startup-trial-inputs', version: 1, studyId: 'viability-2026-09-20',
    baselineConfiguration: createStartupConfig(), profiles: STUDY_PROFILES,
    phases: STUDY_PHASES.map(phase => ({ ...phase, profiles: phase.profiles.map(id => {
      const profile = STUDY_PROFILES.find(item => item.id === id);
      const configuration = createStartupConfig();
      configuration.seed = phase.seed;
      Object.assign(configuration.params, profile.patch);
      return { id, configuration };
    }) })),
  };
}
export function monteCarloInterval(successes, count) {
  const z = 1.959963984540054, p = successes / count, denominator = 1 + z * z / count;
  const center = (p + z * z / (2 * count)) / denominator;
  const half = z * Math.sqrt(p * (1 - p) / count + z * z / (4 * count * count)) / denominator;
  return { lower: center - half, upper: center + half, meaning: '95% Monte Carlo sampling interval conditional on declared input distributions; not a real-world investment confidence interval.' };
}
export function goalsMet(summary) {
  return summary.funded && summary.meetsReserveAndContingency && summary.meetsBreakEvenTarget && summary.memberPriceProtected;
}
export function trialRecord(phase, profile, replication, projection) {
  return {
    phase, profile, replication, status: 'completed',
    seedReference: { seed: projection.config.seed, keyPrefix: `startup:${replication}:` },
    projectionId: projection.id, factors: projection.factors,
    summary: projection.summary, flags: { goalsMet: goalsMet(projection.summary) },
  };
}

export async function generateStartupStudy(root = new URL('../', import.meta.url)) {
  const output = new URL(STUDY_DIRECTORY, root);
  await mkdir(output, { recursive: true });
  const inputs = trialInputs(), records = [], results = {};
  for (const phase of inputs.phases) {
    results[phase.id] = phase.profiles.map(({ id, configuration }) => {
      const baseline = projectStartup(configuration), trials = [];
      for (let replication = 0; replication < phase.replications; replication++) {
        const projection = projectStartup(configuration, { uncertain: true, replication });
        const record = trialRecord(phase.id, id, replication, projection);
        trials.push(record);
        records.push(record);
      }
      const experiment = summarizeStartupTrials(configuration, trials);
      console.log(JSON.stringify({ stage: phase.seed, id, trials: phase.replications, successes: experiment.successful,
        capitalP95Usd: experiment.requiredCapital.p95 / 100, cashBreakEven: baseline.summary.operatingBreakEvenMonth }));
      return { id, configuration, baselineSummary: baseline.summary, baselineBudgetToBreakEven: baseline.budgetToBreakEven,
        experiment, monteCarloInterval: monteCarloInterval(experiment.successful, phase.replications) };
    });
  }
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
  const artifacts = [
    ['startup-design-results.json', { notes, results: results.design }],
    ['startup-holdout-results.json', { notes, results: results.holdout }],
    ['startup-trial-inputs.json', inputs],
    ['funded-startup-plan.json', funded],
    ['no-capital-startup-plan.json', noCapital],
    ['member-value-first-plan.json', valueFirst],
  ].map(([name, data]) => [name, Buffer.from(json(data))]);
  const raw = Buffer.from(records.map(record => JSON.stringify(record)).join('\n') + '\n');
  const compressed = gzipSync(raw, { level: 9 });
  const decoded = gunzipSync(compressed);
  if (!decoded.equals(raw)) throw new Error('Trial JSONL gzip verification failed.');
  const roundTrip = decoded.toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line));
  for (const phase of inputs.phases) {
    for (const profile of phase.profiles) {
      const rows = roundTrip.filter(row => row.phase === phase.id && row.profile === profile.id);
      if (rows.length !== phase.replications || !isDeepStrictEqual(summarizeStartupTrials(profile.configuration, rows),
        results[phase.id].find(result => result.id === profile.id).experiment)) {
        throw new Error(`Persisted trial aggregation mismatch: ${phase.id}/${profile.id}`);
      }
    }
  }
  const descriptor = (name, bytes) => ({ file: name, bytes: bytes.length, sha256: sha256(bytes) });
  const manifest = {
    format: 'commons-startup-trial-manifest', version: 1, studyId: inputs.studyId, methodVersion: STARTUP_VERSION,
    generation: {
      command: 'node scripts/analyze-startup.mjs',
      method: 'projectStartup(configuration, { uncertain: true, replication }) once for every declared phase, profile and replication; summarizeStartupTrials recomputed from persisted JSONL before publishing.',
      runtime: { node: process.version, zlib: process.versions.zlib },
      compression: 'node:zlib gzipSync, level 9, zero timestamp; UTF-8 JSON Lines with LF and a final newline.',
      recordKind: 'Per-trial startup-cohort financial summaries, not full transaction/event traces or operating-agent runs. The raw trial archive excludes monthly trajectories. Three nominal plans include monthly rows as separate artifacts, not additional sampled trials.',
      sourceNormalization: 'Remove optional UTF-8 BOM; normalize CRLF and CR to LF before SHA-256.',
      sources: await Promise.all(METHOD_FILES.map(async file => ({ file, sha256: normalizedSourceHash(await readFile(new URL(file, root), 'utf8')) }))),
    },
    seedScheme: {
      generator: 'Counter-keyed xoshiro128** in simulation/math.mjs; deterministic pseudorandom draws, not a security generator.',
      draw: 'random(configuration.seed, `startup:${replication}:${factor}`)',
      factors: ['growth', 'cost', 'churn', 'delay'], replicationIndex: 'Zero-based within each phase/profile.',
      designSeed: STUDY_PHASES[0].seed, holdoutSeed: STUDY_PHASES[1].seed,
      comparison: 'Profiles within a phase reuse the same replication keys and seed (common random numbers). Profiles are paired assumptions, not independent observations. Holdout uses a separate seed, not new human or market observations.',
    },
    assumptions: {
      growth: 'Symmetric triangular multiplier centered on 1 with width growthUncertainty.',
      cost: 'Symmetric triangular multiplier centered on 1 with width costUncertainty, shared across modeled operating costs.',
      churn: 'Symmetric triangular multiplier centered on 1 with width churnUncertainty.',
      delay: 'launchDelay plus a discrete uniform integer from 0 through delayUncertainty, inclusive.',
      goal: 'funded && meetsReserveAndContingency && meetsBreakEvenTarget && memberPriceProtected',
      capitalQuantiles: 'Linear interpolation of sorted integer USD cents at index (n - 1) * p; quantiles may be fractional cents.',
      breakEven: 'First start of six consecutive months with nonnegative operating cash profit; target also requires nonnegative cash profit in the final six months.',
      selection: 'Only member-value-first and balanced were carried from design into holdout. This is not validation of all ten profiles or an independently preregistered selection.',
      limits: 'Synthetic, uncalibrated assumptions; not empirical success probabilities, independent human observations, a causal capital effect, or investment forecasts. Capital does not change the planned member ramp or spending. Equivalent service and no member-paid switching costs are assumed. Taxes, debt service and investor return requirements are excluded.',
    },
    phases: inputs.phases.map(phase => ({
      id: phase.id, seed: phase.seed, profileCount: phase.profiles.length, replicationsPerProfile: phase.replications,
      planned: phase.profiles.length * phase.replications, completed: phase.profiles.length * phase.replications,
      missing: 0, failed: 0, excluded: 0,
      profiles: phase.profiles.map(profile => ({ id: profile.id, records: phase.replications })),
    })),
    records: { planned: records.length, completed: records.length, missing: 0, failed: 0, excluded: 0,
      failurePolicy: 'Abort generation on any projection or serialization error; retain unfavorable outcomes and null break-even results. No imputation or silent exclusions.' },
    recordSchema: {
      phase: 'design or holdout', profile: 'Profile ID in startup-trial-inputs.json', replication: 'Zero-based replication index',
      status: 'completed', seedReference: 'Base seed and counter key prefix; append growth, cost, churn or delay.',
      projectionId: 'Model identifier from config and factors, not a cryptographic provenance hash.',
      factors: 'Realized growth, cost and churn multipliers plus total delay in months.',
      summary: 'All projection summary financial outputs and Boolean outcome flags. Money is integer USD cents; months and member/staff counts are unscaled. Null month means not reached in the configured horizon.',
      flags: 'goalsMet is the conjunction defined in assumptions.goal.',
    },
    artifacts: artifacts.map(([name, bytes]) => descriptor(name, bytes)),
    raw: {
      ...descriptor('startup-trials.jsonl.gz', compressed),
      decompressed: descriptor('startup-trials.jsonl', raw),
      records: records.length,
    },
  };
  for (const [name, bytes] of [...artifacts, ['startup-trials.jsonl.gz', compressed], ['startup-trial-manifest.json', Buffer.from(json(manifest))]]) {
    await writeFile(new URL(name, output), bytes);
  }
  for (const [name, data] of [
    ['structural-stresses.json', { notes, cases: [
      { id: 'only-1000-paying-members', summary: smallBase.summary },
      { id: 'provider-cost-15.50', summary: uncompetitiveProvider.summary },
    ] }],
  ]) await writeFile(new URL(name, output), json(data));
  console.log(JSON.stringify({ verifiedRecords: roundTrip.length, rawBytes: raw.length, gzipBytes: compressed.length }));
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await generateStartupStudy();
