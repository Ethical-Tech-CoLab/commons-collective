import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { reviewSections, compareReviewSections } from '../scripts/capture-review-history.mjs';
import { validateReviewHistory, createReviewCorpus } from '../scripts/review-corpus.mjs';
import { renderAuthorReview } from '../scripts/review-render.mjs';
import { defaultReviewInputs, estimateReview, reviewRange } from '../site/review-time-model.mjs';
import { renderUsageAudit, usageAuditSection } from '../scripts/usage-audit.mjs';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const history = JSON.parse(await read('../usage/review-history.json'));
const config = JSON.parse(await read('../usage/audit-config.json'));
const usage = JSON.parse(await read('../usage/ai-usage.json'));
const hash = text => createHash('sha256').update(text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')).digest('hex');
const corpus = createReviewCorpus(history);

test('review sections count each version once, not entire documents per edit', () => {
  const version = count => reviewSections(`## Topic\n\n${'word '.repeat(count - 1)}`);
  const versions = [100, 200, 300].map(version);
  let priorWords = 0, previous = new Map();
  for (const next of versions) {
    const changes = compareReviewSections(previous, next);
    priorWords += changes.reduce((sum, change) => sum + change.priorWords, 0);
    previous = next;
  }
  assert.equal(priorWords, 300);
  assert.equal(priorWords + versions.at(-1).get('topic').words, 600);
  assert.equal(compareReviewSections(versions[2], versions[2]).length, 0);
  const removed = compareReviewSections(versions[2], new Map());
  assert.equal(removed[0].change, 'removed');
  assert.equal(removed[0].priorWords, 300);
  assert.equal(removed[0].nextWords, 0);
  const added = compareReviewSections(new Map(), versions[0]);
  assert.equal(added[0].priorWords, 0);
});

test('bibliography, code and image pixels are excluded; renumbering and whitespace add no pass', () => {
  const before = reviewSections('# Document\n\n## 1. Topic\n\nHello   reader [S01].\n\n## References\n\nDo not count this.');
  const after = reviewSections('# Document\n\n## 9. Topic\n\nHello reader [S01].\n\n## 10. Bibliography\n\nDo not count this either.');
  assert.deepEqual([...before.keys()], ['preamble', 'topic']);
  assert.equal(compareReviewSections(before, after).length, 0);
  const code = reviewSections('## Topic\n\nHello reader.\n\n```js\nconst hidden = true;\n```\n\n![image words](image.png)\n\n<!-- hidden words -->');
  assert.equal(code.get('topic').words, 3);
  assert.deepEqual([...reviewSections('## Topic\n\nText.\n\n## Source register\n\nHidden.').keys()], ['topic']);
  const rename = compareReviewSections(reviewSections('## Topic\n\nText.'), reviewSections('## Renamed\n\nText.'));
  assert.deepEqual(rename.map(change => change.change), ['removed', 'added']);
  assert.throws(() => reviewSections('## 1. Topic\n\nA.\n\n## 2. Topic\n\nB.'), /Ambiguous/);
});

test('frozen source history reconciles with the material boundary and method hashes', async () => {
  const hashes = { script: hash(await read('../scripts/capture-review-history.mjs')), text: hash(await read('../scripts/review-corpus.mjs')) };
  assert.equal(validateReviewHistory(history, config.materialCommit, hashes), history);
  assert.equal(history.usageCutoffExclusive, config.cutoffExclusive);
  assert.equal(history.documents[0].versions.length, 20);
  assert.equal(history.documents[0].words, 22130);
  assert.equal(history.documents[0].priorVersionWords, 27314);
  assert.equal(history.documents[0].reviewWordExposures, 49444);
  assert.equal(history.totals.documents, 9);
  assert.equal(history.totals.currentWords, 57713);
  assert.equal(history.totals.priorVersionWords, 35146);
  assert.equal(history.totals.reviewWordExposures, 92859);
  assert.throws(() => validateReviewHistory(history, config.materialCommit, { ...hashes, text: '0'.repeat(64) }), /recapture/);
  assert.throws(() => validateReviewHistory(history, '0'.repeat(40)), /material/);
  const publicText = JSON.stringify(history);
  assert.doesNotMatch(publicText, /funding-proposal|session-store|[A-Z]:\\|api[_-]?key|prompt_text|agent_id/i);
});

test('corrupted revision counts, provenance and transition chains fail closed', () => {
  const corruptions = [
    copy => { copy.totals.reviewWordExposures++; },
    copy => { copy.documents[0].words++; },
    copy => { copy.documents[0].sourceSha256 = '0'.repeat(64); },
    copy => { copy.documents[0].versions[0].words++; },
    copy => { copy.documents[0].versions[0].at = '2030-01-01T00:00:00Z'; },
    copy => { copy.documents[0].versions[1].commit = copy.documents[0].versions[0].commit; },
    copy => { copy.documents[0].changes[0].priorWords = 10; },
    copy => { copy.documents[0].changes[0].nextTextSha256 = 'invalid'; },
    copy => { copy.documents[0].changes.push(copy.documents[0].changes[0]); },
    copy => { copy.documents[0].changes.find(event => event.change === 'changed').priorWords++; },
    copy => { copy.documents[0].url = 'https://example.com'; },
  ];
  for (const mutate of corruptions) {
    const copy = structuredClone(history); mutate(copy);
    assert.throws(() => validateReviewHistory(copy, config.materialCommit));
  }
});

test('revision-aware estimate includes prior section text without automatic extra rereads', () => {
  const defaults = defaultReviewInputs(corpus);
  assert.equal(defaults.basis, 'revision');
  assert.equal(defaults.additionalRereadsMin, 0);
  assert.equal(defaults.additionalRereadsMax, 0);
  assert.equal(defaults.rereadFraction, 0);
  const result = estimateReview(corpus, defaults);
  assert.equal(result.baselineExposureWords, 49444);
  assert.equal(result.readingMinMinutes, 49444 / 238);
  assert.equal(result.readingMaxMinutes, result.readingMinMinutes);
  assert.equal(reviewRange(result.reviewMinMinutes, result.reviewMaxMinutes), '3.46 h');
  assert.equal(result.additionalReviewMinutes, null);
  assert.equal(result.actualTimeMeasured, false);
  assert.equal(reviewRange(result.fasterPaceMinutes, result.slowerPaceMinutes), '2.75 to 4.71 h');
  const current = estimateReview(corpus, { ...defaults, basis: 'current' });
  assert.equal(current.baselineExposureWords, 22130);
  const all = estimateReview(corpus, { ...defaults, documentIds: corpus.documents.map(doc => doc.id) });
  assert.equal(all.baselineExposureWords, 92859);
  assert.equal(reviewRange(all.reviewMinMinutes, all.reviewMaxMinutes), '6.50 h');
});

test('extra rereads apply only to current text and entered editing minutes remain separate', () => {
  const input = { ...defaultReviewInputs(corpus), rereadFraction: 0.5, additionalRereadsMin: 2, additionalRereadsMax: 3, additionalReviewMinutes: 45 };
  const result = estimateReview(corpus, input);
  assert.equal(result.readingMinMinutes, (49444 + 22130) / 238);
  assert.equal(result.readingMaxMinutes, (49444 + 22130 * 1.5) / 238);
  assert.equal(result.reviewMinMinutes, result.readingMinMinutes + 45);
  assert.equal(result.reviewMaxMinutes, result.readingMaxMinutes + 45);
  assert.equal(result.additionalReviewMinutes, 45);
  assert.equal(result.actualTimeMeasured, false);
});

test('invalid, empty or unrecognized review assumptions are surfaced', () => {
  for (const invalid of [
    { documentIds: [] }, { documentIds: ['unknown'] }, { documentIds: ['main-report', 'main-report'] },
    { basis: 'invented' }, { wordsPerMinute: 0 }, { wordsPerMinute: NaN }, { wordsPerMinute: 601 },
    { rereadFraction: null }, { rereadFraction: -0.1 }, { rereadFraction: 1.1 },
    { additionalRereadsMin: 1.5 }, { additionalRereadsMin: 2, additionalRereadsMax: 1 },
    { additionalRereadsMax: 3 }, { additionalReviewMinutes: -1 }, { humanTimeMs: 100 },
  ]) assert.throws(() => estimateReview(corpus, { ...defaultReviewInputs(corpus), ...invalid }));
});

test('static panel, overview and headline use the same estimator with explicit non-additivity', async () => {
  const panel = renderAuthorReview(corpus, await read('../site/author-review.html'));
  assert.doesNotMatch(panel, /\{\{[A-Z_]+\}\}/);
  assert.match(panel, /49,444/);
  assert.match(panel, /27,314/);
  assert.match(panel, /3\.46 h/);
  assert.match(panel, /Do not add this estimate/);
  assert.match(panel, /not actual tracked labor|no actual human time/i);
  assert.ok(panel.includes(`/commit/${history.documents[0].versions[0].commit}`));
  assert.match(panel, /<q data-review-historical-title>Follow-on research: a Commons Bargaining Framework Agreement<\/q>/);
  assert.match(panel, /Quoted historical section titles retain their original wording/);
  const audit = renderUsageAudit(usage, corpus);
  assert.match(audit, /Author review \(workload estimate\)/);
  assert.match(audit, /3\.46 h/);
  assert.match(usageAuditSection(usage, corpus).paragraphs.join(' '), /49,444.*3\.46 h/);
});
