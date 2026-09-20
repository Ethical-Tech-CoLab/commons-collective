import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { projectStartup, summarizeStartupTrials, STARTUP_VERSION } from '../simulation/startup.mjs';
import { random, hash, stableStringify } from '../simulation/math.mjs';
import {
  STUDY_DIRECTORY, STUDY_PHASES, METHOD_FILES, trialInputs, trialRecord,
  goalsMet, monteCarloInterval, sha256, normalizedSourceHash,
} from './analyze-startup.mjs';

export const PUBLIC_STUDY_FILES = Object.freeze([
  'startup-design-results.json', 'startup-holdout-results.json', 'startup-trial-inputs.json',
  'startup-trial-manifest.json', 'startup-trials.jsonl.gz',
  'funded-startup-plan.json', 'no-capital-startup-plan.json', 'member-value-first-plan.json',
]);
const repository = 'https://github.com/Ethical-Tech-CoLab/commons-collective/blob/main/';
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const number = value => value.toLocaleString('en-US');
const dollars = cents => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const exactDollars = cents => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });
function requireEvidence(condition, message) {
  if (!condition) throw new Error(`Trial evidence: ${message}`);
}
function equal(actual, expected, message) {
  requireEvidence(isDeepStrictEqual(actual, expected), message);
}
function verifiedBytes(bytes, descriptor, name) {
  requireEvidence(descriptor?.file === name && Buffer.isBuffer(bytes), `missing artifact ${name}`);
  requireEvidence(bytes.length === descriptor.bytes && sha256(bytes) === descriptor.sha256, `hash/size mismatch for ${name}`);
}
function expectedFactors(configuration, replication) {
  const p = configuration.params;
  const triangle = (value, width) => value < 0.5
    ? 1 - width + Math.sqrt(2 * value) * width : 1 + width - Math.sqrt(2 * (1 - value)) * width;
  const draw = name => random(configuration.seed, `startup:${replication}:${name}`);
  return {
    growth: triangle(draw('growth'), p.growthUncertainty),
    cost: triangle(draw('cost'), p.costUncertainty),
    churn: triangle(draw('churn'), p.churnUncertainty),
    delay: p.launchDelay + Math.floor(draw('delay') * (p.delayUncertainty + 1)),
  };
}

export function capitalHistogram(records, widthCents = 100000000) {
  requireEvidence(records.length > 0 && Number.isSafeInteger(widthCents) && widthCents > 0, 'invalid histogram inputs');
  const values = records.map(record => record.summary.capitalRequired);
  requireEvidence(values.every(value => Number.isSafeInteger(value) && value >= 0), 'invalid histogram capital');
  const start = Math.floor(Math.min(...values) / widthCents) * widthCents;
  const count = Math.floor((Math.max(...values) - start) / widthCents) + 1;
  const bins = Array.from({ length: count }, (_, index) => ({
    lowerCents: start + index * widthCents, upperExclusiveCents: start + (index + 1) * widthCents, count: 0,
  }));
  for (const value of values) bins[Math.floor((value - start) / widthCents)].count++;
  return { widthCents, count: records.length, bins };
}

export async function readTrialArtifacts(root) {
  const files = Object.fromEntries(await Promise.all(PUBLIC_STUDY_FILES.map(async name =>
    [name, await readFile(new URL(STUDY_DIRECTORY + name, root))])));
  const sourceHashes = Object.fromEntries(await Promise.all(METHOD_FILES.map(async file =>
    [file, normalizedSourceHash(await readFile(new URL(file, root), 'utf8'))])));
  return { files, sourceHashes };
}

export function validateTrialEvidence({ files, sourceHashes }) {
  equal(Object.keys(files).sort(), [...PUBLIC_STUDY_FILES].sort(), 'unexpected or missing public artifact');
  const parse = file => JSON.parse(files[file].toString('utf8'));
  const manifest = parse('startup-trial-manifest.json');
  requireEvidence(manifest.format === 'commons-startup-trial-manifest' && manifest.version === 1
    && manifest.studyId === 'viability-2026-09-20' && manifest.methodVersion === STARTUP_VERSION, 'unsupported manifest/method');
  equal(manifest.generation?.sources?.map(source => source.file), METHOD_FILES, 'source-method file list mismatch');
  for (const source of manifest.generation.sources) {
    requireEvidence(source.sha256 === sourceHashes[source.file], `stale source method: ${source.file}; regenerate the study`);
  }
  const artifactNames = [
    'startup-design-results.json', 'startup-holdout-results.json', 'startup-trial-inputs.json',
    'funded-startup-plan.json', 'no-capital-startup-plan.json', 'member-value-first-plan.json',
  ];
  equal(manifest.artifacts?.map(artifact => artifact.file), artifactNames, 'aggregate/input allowlist mismatch');
  for (const artifact of manifest.artifacts) verifiedBytes(files[artifact.file], artifact, artifact.file);
  verifiedBytes(files['startup-trials.jsonl.gz'], manifest.raw, 'startup-trials.jsonl.gz');
  const raw = gunzipSync(files['startup-trials.jsonl.gz'], { maxOutputLength: 64 * 1024 * 1024 });
  verifiedBytes(raw, manifest.raw.decompressed, 'startup-trials.jsonl');
  const text = raw.toString('utf8');
  requireEvidence(text.endsWith('\n') && !text.includes('\r') && Buffer.from(text).equals(raw), 'raw data must be UTF-8 JSONL with LF and a final newline');
  const rows = text.slice(0, -1).split('\n').map(line => JSON.parse(line));
  const inputs = parse('startup-trial-inputs.json'), expectedInputs = trialInputs();
  equal(inputs, expectedInputs, 'recorded study inputs differ from the frozen profiles, seeds or current method');
  const baselineConfig = inputs.baselineConfiguration;
  const valueFirstPatch = inputs.profiles.find(profile => profile.id === 'member-value-first').patch;
  for (const [file, patch] of [
    ['funded-startup-plan.json', {}], ['no-capital-startup-plan.json', { capitalEnabled: 0 }],
    ['member-value-first-plan.json', valueFirstPatch],
  ]) {
    equal(parse(file), projectStartup({ ...baselineConfig, params: { ...baselineConfig.params, ...patch } }),
      `${file} nominal plan differs from recorded inputs or the source method`);
  }
  equal(manifest.seedScheme?.factors, ['growth', 'cost', 'churn', 'delay'], 'seed factor list mismatch');
  requireEvidence(manifest.seedScheme.designSeed === STUDY_PHASES[0].seed
    && manifest.seedScheme.holdoutSeed === STUDY_PHASES[1].seed, 'phase seeds mismatch');
  const expectedPhases = inputs.phases.map(phase => ({
    id: phase.id, seed: phase.seed, profileCount: phase.profiles.length, replicationsPerProfile: phase.replications,
    planned: phase.profiles.length * phase.replications, completed: phase.profiles.length * phase.replications,
    missing: 0, failed: 0, excluded: 0,
    profiles: phase.profiles.map(profile => ({ id: profile.id, records: phase.replications })),
  }));
  equal(manifest.phases, expectedPhases, 'phase/profile counts or exclusions mismatch');
  const total = expectedPhases.reduce((sum, phase) => sum + phase.completed, 0);
  for (const key of ['planned', 'completed']) requireEvidence(manifest.records[key] === total, `invalid ${key} total`);
  for (const key of ['missing', 'failed', 'excluded']) requireEvidence(manifest.records[key] === 0, `unexpected ${key} records`);
  requireEvidence(rows.length === total && manifest.raw.records === total, 'raw record count mismatch');
  const phases = [], metadata = new Map(inputs.profiles.map(profile => [profile.id, profile]));
  let cursor = 0;
  for (const phase of inputs.phases) {
    const aggregate = parse(`startup-${phase.id}-results.json`);
    equal(aggregate.results?.map(result => result.id), phase.profiles.map(profile => profile.id), `${phase.id} aggregate profile list mismatch`);
    const profiles = [];
    for (const [index, profile] of phase.profiles.entries()) {
      const result = aggregate.results[index], configuration = profile.configuration, p = configuration.params;
      equal(result.configuration, configuration, `${phase.id}/${profile.id} configuration mismatch`);
      const baseline = projectStartup(configuration);
      equal(result.baselineSummary, baseline.summary, `${phase.id}/${profile.id} baseline summary mismatch`);
      equal(result.baselineBudgetToBreakEven, baseline.budgetToBreakEven, `${phase.id}/${profile.id} baseline budget mismatch`);
      const selected = rows.slice(cursor, cursor + phase.replications);
      cursor += phase.replications;
      const shape = trialRecord(phase.id, profile.id, 0, baseline);
      for (const [replication, row] of selected.entries()) {
        const label = `${phase.id}/${profile.id}/${replication}`;
        equal(Object.keys(row).sort(), Object.keys(shape).sort(), `${label} record schema mismatch`);
        requireEvidence(row.phase === phase.id && row.profile === profile.id && row.replication === replication
          && row.status === 'completed', `${label} missing, duplicated, failed or out-of-order record`);
        equal(row.seedReference, { seed: phase.seed, keyPrefix: `startup:${replication}:` }, `${label} seed reference mismatch`);
        equal(row.factors, expectedFactors(configuration, replication), `${label} sampled factors mismatch`);
        requireEvidence(row.projectionId === hash(stableStringify({ config: configuration, factors: row.factors })), `${label} projection identity mismatch`);
        equal(Object.keys(row.summary).sort(), Object.keys(baseline.summary).sort(), `${label} financial summary schema mismatch`);
        const s = row.summary;
        for (const [key, value] of Object.entries(s)) {
          if (typeof baseline.summary[key] === 'boolean') {
            requireEvidence(typeof value === 'boolean', `${label} invalid Boolean ${key}`);
          } else if (/Month$/.test(key) || ['minimumMemberSaving', 'runRateMembersNeeded'].includes(key)) {
            requireEvidence(value === null || Number.isSafeInteger(value), `${label} invalid nullable ${key}`);
            if (key.endsWith('Month') && value !== null) requireEvidence(value >= 0 && value <= p.horizon, `${label} month outside horizon`);
          } else requireEvidence(Number.isSafeInteger(value), `${label} invalid financial value ${key}`);
        }
        requireEvidence(s.capital === (p.capitalEnabled ? Math.round(p.capitalUsd * 100) : 0)
          && s.capital + s.totalFees - s.totalUses === s.endingCash, `${label} cash reconciliation mismatch`);
        requireEvidence(s.capitalRequired === s.capitalWithReserve + s.contingency
          && s.reserveAddon === s.capitalWithReserve - s.capitalForNoShortfall, `${label} capital reconciliation mismatch`);
        requireEvidence(s.funded === (s.firstShortfallMonth === null)
          && s.meetsReserveAndContingency === (s.capital >= s.capitalRequired)
          && s.meetsBreakEvenTarget === (s.operatingBreakEvenMonth !== null && s.operatingBreakEvenMonth <= p.breakEvenTarget && s.matureCashHealthy)
          && s.memberPriceProtected === (s.minimumMemberSaving !== null && s.minimumMemberSaving >= Math.round(p.minimumSavingUsd * 100)),
        `${label} outcome flags mismatch`);
        equal(row.flags, { goalsMet: goalsMet(s) }, `${label} goal flag mismatch`);
      }
      const experiment = summarizeStartupTrials(configuration, selected);
      equal(result.experiment, experiment, `${phase.id}/${profile.id} raw counts or quantiles differ from aggregate`);
      equal(result.monteCarloInterval, monteCarloInterval(experiment.successful, phase.replications), `${phase.id}/${profile.id} interval mismatch`);
      profiles.push({
        ...metadata.get(profile.id), configuration, ...experiment,
        goalsNotMet: experiment.trials - experiment.successful,
        reserveAndContingency: selected.filter(row => row.summary.meetsReserveAndContingency).length,
        memberPriceProtected: selected.filter(row => row.summary.memberPriceProtected).length,
        capitalHistogram: capitalHistogram(selected),
      });
    }
    phases.push({ ...expectedPhases.find(item => item.id === phase.id), profiles });
  }
  return {
    format: 'commons-trial-evidence', version: 1, studyId: manifest.studyId, methodVersion: manifest.methodVersion,
    manifestSha256: sha256(files['startup-trial-manifest.json']), records: manifest.records,
    phases, assumptions: manifest.assumptions,
    sourceHashes: manifest.generation.sources, raw: manifest.raw,
    downloads: PUBLIC_STUDY_FILES.map(file => ({ file, href: `./study-data/${file}`, bytes: files[file].length, sha256: sha256(files[file]) })),
  };
}

function profileMeaning(profile) {
  const p = profile.configuration.params;
  const descriptions = {
    feeUsd: () => `${exactDollars(p.feeUsd * 100)}/member/month fee`,
    capitalUsd: () => `${dollars(p.capitalUsd * 100)} committed capital`,
    rampMonths: () => `${p.rampMonths}-month member ramp`,
    breakEvenTarget: () => `cash break-even target month ${p.breakEvenTarget}`,
    targetMembers: () => `${number(p.targetMembers)} planned mature members`,
    acquisitionUsd: () => `${exactDollars(p.acquisitionUsd * 100)} acquisition cost/new member`,
    annualStaffUsd: () => `${dollars(p.annualStaffUsd * 100)} loaded staff cost/person/year`,
  };
  return Object.keys(profile.patch).length
    ? Object.keys(profile.patch).map(key => descriptions[key]()).join('; ')
    : 'Unmodified reference inputs below.';
}
function profileTable(phase) {
  return `<div class="table-scroll" role="region" aria-label="${escape(phase.id)} profile results" tabindex="0">
  <table><caption>${phase.id === 'design' ? 'Design exploration' : 'Separate-seed holdout'}: ${number(phase.completed)} completed projections. Capital requirements include reserve and contingency; displayed dollars are rounded.</caption>
  <thead><tr><th scope="col">Profile and changed assumptions</th><th scope="col">Trials</th><th scope="col">Capital median</th><th scope="col">Capital P95</th><th scope="col">All goals met</th><th scope="col">No cash break-even</th></tr></thead>
  <tbody>${phase.profiles.map(profile => `<tr data-profile="${escape(profile.id)}">
    <th scope="row">${escape(profile.name)}<span class="profile-meaning">${escape(profileMeaning(profile))}</span></th>
    <td>${number(profile.trials)}</td>
    <td title="${exactDollars(profile.requiredCapital.median)}">${dollars(profile.requiredCapital.median)}</td>
    <td title="${exactDollars(profile.requiredCapital.p95)}">${dollars(profile.requiredCapital.p95)}</td>
    <td><strong>${number(profile.successful)} / ${number(profile.trials)}</strong><span class="profile-meaning">${(profile.conditionalSuccessShare * 100).toFixed(2)}% conditional trial share</span></td>
    <td>${number(profile.neverCashBreakEven)}</td></tr>`).join('\n')}</tbody></table></div>
    <details><summary>Individual goal counts and unsuccessful outcomes</summary>
    <p>Goal categories overlap. Trials not meeting all goals are retained, not treated as execution errors. A null break-even month remains in every capital and all-goals denominator.</p>
    <div class="table-scroll" role="region" aria-label="${escape(phase.id)} goal counts" tabindex="0"><table>
    <caption>Counts out of each profile's full trial sample</caption>
    <thead><tr><th scope="col">Profile</th><th scope="col">No cash shortfall</th><th scope="col">Reserve + contingency</th><th scope="col">Cash break-even target</th><th scope="col">Member price protected</th><th scope="col">Not all goals</th></tr></thead>
    <tbody>${phase.profiles.map(profile => `<tr><th scope="row">${escape(profile.name)}</th><td>${number(profile.funded)}</td><td>${number(profile.reserveAndContingency)}</td><td>${number(profile.meetingTarget)}</td><td>${number(profile.memberPriceProtected)}</td><td>${number(profile.goalsNotMet)}</td></tr>`).join('\n')}</tbody>
    </table></div></details>`;
}
function histograms(phase) {
  return `<div class="histogram-grid">${phase.profiles.map(profile => {
    const max = Math.max(...profile.capitalHistogram.bins.map(bin => bin.count));
    return `<figure><figcaption><strong>${escape(profile.name)}</strong><br>${number(profile.trials)} holdout projections</figcaption>
      <ol class="histogram">${profile.capitalHistogram.bins.map(bin => `<li>
        <span class="bin-label">${dollars(bin.lowerCents)} to &lt; ${dollars(bin.upperExclusiveCents)}</span>
        <span class="bin-track" aria-hidden="true"><span style="width:${(100 * bin.count / max).toFixed(3)}%"></span></span>
        <span class="bin-count">${number(bin.count)} trials</span></li>`).join('\n')}</ol></figure>`;
  }).join('\n')}</div>`;
}
export function renderTrialEvidence(evidence, template, headerHtml) {
  const design = evidence.phases.find(phase => phase.id === 'design');
  const holdout = evidence.phases.find(phase => phase.id === 'holdout');
  const balanced = design.profiles.find(profile => profile.id === 'balanced').configuration.params;
  const substitutions = {
    HEADER: headerHtml,
    TOTAL: number(evidence.records.completed),
    DESIGN_COUNT: number(design.completed),
    HOLDOUT_COUNT: number(holdout.completed),
    DESIGN_TABLE: profileTable(design),
    HOLDOUT_TABLE: profileTable(holdout),
    HISTOGRAMS: histograms(holdout),
    REFERENCE_INPUTS: `The balanced reference plans ${number(balanced.targetMembers)} mature members over ${balanced.rampMonths} months, starting with ${number(balanced.startingMembers)} members. It charges ${exactDollars(balanced.feeUsd * 100)}/member/month, commits ${dollars(balanced.capitalUsd * 100)} of capital, and hires from ${balanced.staffStart} to ${balanced.staffTarget} staff at ${dollars(balanced.annualStaffUsd * 100)}/person/year. Incremental acquisition costs ${exactDollars(balanced.acquisitionUsd * 100)} per new member. The horizon is ${balanced.horizon} months, with a month-${balanced.breakEvenTarget} cash break-even target, ${balanced.reserveMonths} reserve months and ${balanced.contingencyBps / 100}% contingency. Other inputs stay fixed across profiles unless listed in the table.`,
    DISTRIBUTIONS: `Growth, correlated costs and churn use symmetric triangular multipliers centered on 1, with widths ${balanced.growthUncertainty}, ${balanced.costUncertainty} and ${balanced.churnUncertainty}. Additional launch delay is discrete uniform from 0 to ${balanced.delayUncertainty} months inclusive. These are declared stress assumptions, not fitted distributions.`,
    SEEDS: `Design uses <code>${escape(design.seed)}</code>; holdout uses <code>${escape(holdout.seed)}</code>. Replication indices run from 0 to ${design.replicationsPerProfile - 1} for each design profile and 0 to ${holdout.replicationsPerProfile - 1} for each holdout profile.`,
    COMPLETENESS: `${number(evidence.records.planned)} planned; ${number(evidence.records.completed)} completed; ${number(evidence.records.missing)} missing; ${number(evidence.records.failed)} execution failures; ${number(evidence.records.excluded)} excluded.`,
    PRICE_GOAL: `at least ${exactDollars(balanced.minimumSavingUsd * 100)} monthly saving after fees for each charged cohort, assuming equivalent service and no member-paid switching cost`,
    DOWNLOADS: evidence.downloads.map(item => `<li><a href="${item.href}" download>${escape(item.file)}</a> <span>(${number(item.bytes)} bytes)</span></li>`).join('\n'),
    SOURCE_LINKS: [...METHOD_FILES, STUDY_DIRECTORY + 'startup-trial-inputs.json', STUDY_DIRECTORY + 'startup-trial-manifest.json'].map(file =>
      `<li><a href="${repository}${file}">${escape(file)}</a></li>`).join('\n'),
    SOURCE_HASHES: evidence.sourceHashes.map(source => `<tr><th scope="row">${escape(source.file)}</th><td><code>${source.sha256}</code></td></tr>`).join('\n'),
    RAW_HASHES: `<p>Compressed SHA-256: <code>${evidence.raw.sha256}</code></p><p>Decompressed SHA-256: <code>${evidence.raw.decompressed.sha256}</code></p><p>${number(evidence.raw.bytes)} compressed bytes; ${number(evidence.raw.decompressed.bytes)} decompressed bytes.</p>`,
    MANIFEST_HASH: evidence.manifestSha256,
  };
  for (const [key, value] of Object.entries(substitutions)) {
    requireEvidence(template.includes(`{{${key}}}`), `page template missing ${key}`);
    template = template.replaceAll(`{{${key}}}`, value);
  }
  requireEvidence(!/\{\{[A-Z_]+\}\}/.test(template), 'unresolved page template marker');
  return template;
}

export async function buildTrialEvidence(root, headerHtml, { outputRoot = new URL('dist/', root) } = {}) {
  const artifacts = await readTrialArtifacts(root);
  const evidence = validateTrialEvidence(artifacts);
  const [template, css, headerCss] = await Promise.all([
    readFile(new URL('site/trials.html', root), 'utf8'),
    readFile(new URL('site/trials.css', root), 'utf8'),
    readFile(new URL('site/header.css', root), 'utf8'),
  ]);
  const revision = sha256(css).slice(0, 12);
  const html = renderTrialEvidence(evidence, template, headerHtml)
    .replace('./trials.css', `./trials.css?v=${revision}`)
    .replace('./header.css', `./header.css?v=${sha256(headerCss).slice(0, 12)}`);
  await mkdir(new URL('study-data/', outputRoot), { recursive: true });
  await Promise.all(PUBLIC_STUDY_FILES.map(file =>
    writeFile(new URL(`study-data/${file}`, outputRoot), artifacts.files[file])));
  await Promise.all([
    writeFile(new URL('trials.html', outputRoot), html),
    writeFile(new URL('trials.css', outputRoot), css),
    writeFile(new URL('study-data/trial-evidence.json', outputRoot), JSON.stringify(evidence, null, 2) + '\n'),
  ]);
  return { evidence, revision };
}
