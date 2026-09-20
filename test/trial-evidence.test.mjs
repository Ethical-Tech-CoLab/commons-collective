import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, rm, access } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { projectStartup } from '../simulation/startup.mjs';
import {
  METHOD_FILES, sha256, normalizedSourceHash, trialRecord,
} from '../scripts/analyze-startup.mjs';
import {
  PUBLIC_STUDY_FILES, readTrialArtifacts, validateTrialEvidence, buildTrialEvidence, capitalHistogram,
} from '../scripts/build-trials.mjs';

const root = new URL('../', import.meta.url);
const artifacts = await readTrialArtifacts(root);
const evidence = validateTrialEvidence(artifacts);
const rawBytes = gunzipSync(artifacts.files['startup-trials.jsonl.gz']);
const rows = rawBytes.toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line));
const manifest = JSON.parse(artifacts.files['startup-trial-manifest.json']);
const clone = value => structuredClone(value);
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
function mutateManifest(change) {
  const bundle = { files: { ...artifacts.files }, sourceHashes: { ...artifacts.sourceHashes } };
  const changed = clone(manifest);
  change(changed, bundle);
  bundle.files['startup-trial-manifest.json'] = jsonBytes(changed);
  return bundle;
}
function mutateArtifact(file, change) {
  return mutateManifest((changed, bundle) => {
    const value = JSON.parse(bundle.files[file]);
    change(value);
    bundle.files[file] = jsonBytes(value);
    Object.assign(changed.artifacts.find(item => item.file === file), {
      bytes: bundle.files[file].length, sha256: sha256(bundle.files[file]),
    });
  });
}
function mutateRows(change) {
  return mutateManifest((changed, bundle) => {
    const values = clone(rows);
    change(values);
    const raw = Buffer.from(values.map(value => JSON.stringify(value)).join('\n') + '\n');
    const compressed = gzipSync(raw, { level: 9 });
    bundle.files['startup-trials.jsonl.gz'] = compressed;
    Object.assign(changed.raw, { bytes: compressed.length, sha256: sha256(compressed) });
    Object.assign(changed.raw.decompressed, { bytes: raw.length, sha256: sha256(raw) });
  });
}
const quantile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b), rank = (sorted.length - 1) * p;
  return sorted[Math.floor(rank)] + (sorted[Math.ceil(rank)] - sorted[Math.floor(rank)]) * (rank - Math.floor(rank));
};

test('frozen financial trial provenance and planned phase/profile counts are complete', () => {
  assert.equal(evidence.records.planned, 14000);
  assert.equal(evidence.records.completed, 14000);
  assert.deepEqual([evidence.records.missing, evidence.records.failed, evidence.records.excluded], [0, 0, 0]);
  assert.deepEqual(evidence.phases.map(phase => [phase.id, phase.profileCount, phase.replicationsPerProfile, phase.completed]),
    [['design', 10, 1000, 10000], ['holdout', 2, 2000, 4000]]);
  assert.deepEqual(manifest.generation.sources.map(source => source.file), METHOD_FILES);
  assert.equal(manifest.raw.records, rows.length);
  assert.equal(manifest.raw.decompressed.bytes, rawBytes.length);
  assert.equal(manifest.raw.decompressed.sha256, sha256(rawBytes));
  assert.match(manifest.generation.recordKind, /not full transaction\/event traces or operating-agent runs/);
  assert.match(manifest.seedScheme.comparison, /common random numbers/);
  assert.match(manifest.assumptions.selection, /not validation of all ten/);
  for (const phase of evidence.phases) assert.equal(new Set(phase.profiles.map(profile => profile.id)).size, phase.profileCount);
  const holdout = evidence.phases.find(phase => phase.id === 'holdout');
  assert.equal(holdout.profiles.find(profile => profile.id === 'balanced').successful, 1963);
  assert.equal(holdout.profiles.find(profile => profile.id === 'member-value-first').successful, 1924);
});

test('every profile count, quantile and histogram is independently recomputed from raw records', () => {
  for (const phase of evidence.phases) {
    for (const profile of phase.profiles) {
      const sample = rows.filter(row => row.phase === phase.id && row.profile === profile.id);
      assert.equal(sample.length, profile.trials);
      assert.equal(sample.filter(row => row.summary.funded && row.summary.meetsReserveAndContingency
        && row.summary.meetsBreakEvenTarget && row.summary.memberPriceProtected).length, profile.successful);
      assert.equal(profile.conditionalSuccessShare, profile.successful / sample.length);
      assert.equal(sample.filter(row => row.summary.operatingBreakEvenMonth === null).length, profile.neverCashBreakEven);
      const capital = sample.map(row => row.summary.capitalRequired);
      for (const [key, p] of [['p05', .05], ['median', .5], ['p90', .9], ['p95', .95]]) {
        assert.equal(profile.requiredCapital[key], quantile(capital, p), `${phase.id}/${profile.id}/${key}`);
      }
      assert.equal(profile.requiredCapital.max, Math.max(...capital));
      const breakEven = sample.map(row => row.summary.operatingBreakEvenMonth).filter(value => value !== null);
      assert.equal(profile.breakEvenMonths?.count ?? 0, breakEven.length);
      if (breakEven.length) for (const [key, p] of [['p05', .05], ['median', .5], ['p95', .95]]) {
        assert.equal(profile.breakEvenMonths[key], quantile(breakEven, p));
      }
      assert.equal(profile.capitalHistogram.bins.reduce((sum, bin) => sum + bin.count, 0), sample.length);
      for (const bin of profile.capitalHistogram.bins) {
        assert.equal(bin.count, capital.filter(value => value >= bin.lowerCents && value < bin.upperExclusiveCents).length);
      }
    }
  }
  assert.deepEqual(capitalHistogram([0, 99, 100, 199, 200].map(capitalRequired => ({ summary: { capitalRequired } })), 100).bins.map(bin => bin.count), [2, 2, 1]);
});

test('records replay against the unchanged engine and are summaries rather than trajectories', () => {
  for (const phase of evidence.phases) {
    for (const profile of phase.profiles) {
      const sample = rows.filter(row => row.phase === phase.id && row.profile === profile.id);
      for (const replication of [0, 97, sample.length - 1]) {
        const projection = projectStartup(profile.configuration, { uncertain: true, replication });
        assert.deepEqual(sample[replication], trialRecord(phase.id, profile.id, replication, projection));
      }
      for (const row of sample) {
        assert.equal(row.status, 'completed');
        assert.equal(Object.hasOwn(row, 'rows'), false);
        assert.equal(Object.hasOwn(row, 'events'), false);
        assert.equal(Object.hasOwn(row, 'transactions'), false);
      }
    }
  }
});

test('source normalization and zero-timestamp gzip are reproducible without external tools', () => {
  assert.equal(normalizedSourceHash('\uFEFFa\r\nb\rc\n'), normalizedSourceHash('a\nb\nc\n'));
  assert.notEqual(normalizedSourceHash('a\nb\nc\n'), normalizedSourceHash('a\nB\nc\n'));
  assert.equal(artifacts.files['startup-trials.jsonl.gz'].readUInt32LE(4), 0);
  const first = gzipSync(rawBytes, { level: 9 }), second = gzipSync(rawBytes, { level: 9 });
  assert.deepEqual(first, second);
  if (manifest.generation.runtime.zlib === process.versions.zlib) {
    assert.deepEqual(first, artifacts.files['startup-trials.jsonl.gz']);
  }
  assert.equal(rawBytes.includes(13), false);
});

test('three nominal financial plans are hash-verified downloads, not additional sampled trials', () => {
  for (const file of ['funded-startup-plan.json', 'no-capital-startup-plan.json', 'member-value-first-plan.json']) {
    assert.ok(PUBLIC_STUDY_FILES.includes(file));
    const descriptor = manifest.artifacts.find(item => item.file === file);
    assert.equal(descriptor.sha256, sha256(artifacts.files[file]));
    assert.equal(descriptor.bytes, artifacts.files[file].length);
    const plan = JSON.parse(artifacts.files[file]);
    assert.deepEqual(plan, projectStartup(plan.config));
    assert.equal(plan.rows.length, plan.config.params.horizon);
    assert.equal(Object.hasOwn(plan, 'transactions'), false);
    assert.equal(Object.hasOwn(plan, 'events'), false);
  }
  const funded = JSON.parse(artifacts.files['funded-startup-plan.json']);
  const noCapital = JSON.parse(artifacts.files['no-capital-startup-plan.json']);
  assert.equal(noCapital.config.params.capitalEnabled, 0);
  assert.deepEqual(noCapital.rows.map(row => row.members), funded.rows.map(row => row.members));
  assert.equal(evidence.records.completed, 14000);
  assert.throws(() => validateTrialEvidence(mutateArtifact('member-value-first-plan.json', value => {
    value.rows[0].cash++;
  })), /nominal plan differs/);
});

test('publication refuses missing files, stale methods, corrupt bytes and false counts', () => {
  const missing = { files: { ...artifacts.files }, sourceHashes: artifacts.sourceHashes };
  delete missing.files['startup-trials.jsonl.gz'];
  assert.throws(() => validateTrialEvidence(missing), /missing public artifact/);
  const stale = { files: artifacts.files, sourceHashes: { ...artifacts.sourceHashes, 'simulation/startup.mjs': '0'.repeat(64) } };
  assert.throws(() => validateTrialEvidence(stale), /stale source method/);
  const corrupt = { files: { ...artifacts.files, 'startup-trials.jsonl.gz': Buffer.from('broken') }, sourceHashes: artifacts.sourceHashes };
  assert.throws(() => validateTrialEvidence(corrupt), /hash\/size mismatch/);
  assert.throws(() => validateTrialEvidence(mutateManifest(value => { value.phases[0].completed--; })), /counts or exclusions mismatch/);
  assert.throws(() => validateTrialEvidence(mutateManifest(value => { value.records.excluded = 1; })), /unexpected excluded/);
  assert.throws(() => validateTrialEvidence(mutateManifest(value => { value.raw.decompressed.sha256 = '0'.repeat(64); })), /hash\/size mismatch/);
  assert.throws(() => validateTrialEvidence(mutateArtifact('startup-trial-inputs.json', value => {
    value.phases[0].profiles[0].configuration.params.feeUsd = 4;
  })), /recorded study inputs differ/);
  assert.throws(() => validateTrialEvidence(mutateArtifact('startup-design-results.json', value => {
    value.results[0].experiment.requiredCapital.median++;
  })), /raw counts or quantiles differ/);
});

test('even rehashed raw files cannot conceal omissions, duplicates or altered seed/outcome records', () => {
  assert.throws(() => validateTrialEvidence(mutateRows(values => { values.pop(); })), /raw record count mismatch/);
  assert.throws(() => validateTrialEvidence(mutateRows(values => { values[1] = values[0]; })), /missing, duplicated, failed or out-of-order/);
  assert.throws(() => validateTrialEvidence(mutateRows(values => { values[0].seedReference.seed = 'different-seed'; })), /seed reference mismatch/);
  assert.throws(() => validateTrialEvidence(mutateRows(values => { values[0].factors.cost = 1; })), /sampled factors mismatch/);
  assert.throws(() => validateTrialEvidence(mutateRows(values => { values[0].summary.endingCash++; })), /cash reconciliation mismatch/);
  assert.throws(() => validateTrialEvidence(mutateRows(values => { values[0].flags.goalsMet = !values[0].flags.goalsMet; })), /goal flag mismatch/);
});

test('isolated static build publishes only allowlisted evidence, truthful counts and accessible visualizations', async () => {
  const outputRoot = new URL(`.trial-evidence-validation-${process.pid}/`, root);
  await mkdir(outputRoot);
  try {
    const { revision } = await buildTrialEvidence(root, '<header class="site-header">Shared project header</header>', { outputRoot });
    const html = await readFile(new URL('trials.html', outputRoot), 'utf8');
    assert.match(html, /Shared project header/);
    assert.match(html, /trials\.css\?v=[a-f0-9]{12}/);
    assert.match(html, /header\.css\?v=[a-f0-9]{12}/);
    assert.match(revision, /^[a-f0-9]{12}$/);
    assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}|<script\b/);
    assert.match(html, /14,000 synthetic startup-cohort financial projections/);
    assert.match(html, /1,963 \/ 2,000/);
    assert.match(html, /1,924 \/ 2,000/);
    assert.match(html, /not an empirical success probability/);
    assert.match(html, /not operating-agent runs/);
    assert.match(html, /common|paired/);
    assert.match(html, /Per-trial|per-trial summaries/);
    assert.match(html, /0 missing; 0 execution failures; 0 excluded/);
    assert.match(html, /<caption>/);
    assert.match(html, /<th scope="col">Capital P95/);
    assert.match(html, /<th scope="row">/);
    assert.match(html, /class="bin-count">\d[\d,]* trials/);
    assert.match(html, /role="region"[^>]+tabindex="0"/);
    assert.doesNotMatch(html, /(?:<h[1-6][^>]*>|<th[^>]*>|aria-label=")\s*(?:Success probability|Chance of success|Observed success rate|Investment confidence)/i);
    assert.doesNotMatch(html, /funding-proposal|structural-stresses\.json/);
    assert.match(html, /separate nominal projections with full monthly financial rows, not extra sampled trials/);
    assert.ok(html.includes('https://github.com/Ethical-Tech-CoLab/commons-collective/blob/main/scripts/analyze-startup.mjs'));
    for (const file of PUBLIC_STUDY_FILES) {
      assert.ok(html.includes(`./study-data/${file}`));
      assert.deepEqual(await readFile(new URL(`study-data/${file}`, outputRoot)), artifacts.files[file]);
    }
    assert.deepEqual((await readdir(new URL('study-data/', outputRoot))).sort(), [...PUBLIC_STUDY_FILES, 'trial-evidence.json'].sort());
    assert.deepEqual(JSON.parse(await readFile(new URL('study-data/trial-evidence.json', outputRoot), 'utf8')), evidence);
    for (const file of ['scripts/analyze-startup.mjs', 'scripts/build-trials.mjs', 'site/trials.html', 'site/trials.css', 'test/trial-evidence.test.mjs']) {
      const text = await readFile(new URL(file, root), 'utf8');
      assert.ok(!text.includes(String.fromCodePoint(0x2014)), `${file} must not contain an em dash`);
    }
  } finally {
    await rm(outputRoot, { recursive: true });
  }
});

test('an invalid build fails before publishing a new output directory', async () => {
  const outputRoot = new URL(`.trial-evidence-invalid-${process.pid}/`, root);
  await assert.rejects(buildTrialEvidence(root, '{{UNRESOLVED_HEADER}}', { outputRoot }), /unresolved page template marker/);
  await assert.rejects(access(outputRoot), { code: 'ENOENT' });
});
