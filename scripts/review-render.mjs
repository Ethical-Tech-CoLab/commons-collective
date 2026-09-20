import { defaultReviewInputs, estimateReview, reviewHours, reviewRange } from '../site/review-time-model.mjs';

const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const number = value => value.toLocaleString('en-US');
const commitLink = commit => `<a href="https://github.com/Ethical-Tech-CoLab/commons-collective/commit/${escape(commit)}">${escape(commit.slice(0, 7))}</a>`;

export function renderAuthorReview(corpus, template) {
  const result = estimateReview(corpus, defaultReviewInputs(corpus));
  const summary = `<p>Frozen material: ${commitLink(corpus.materialCommit)}. Public Git history capture: ${escape(corpus.historyCapturedAt)}. The evidence table includes all optional documents; the estimate above uses only checked documents. Quoted historical section titles retain their original wording, including the former project name.</p>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Review corpus revision counts"><table><thead><tr>
    <th scope="col">Source document</th><th scope="col">Revisions</th><th scope="col">Current words</th><th scope="col">Prior-version words</th><th scope="col">Review exposures</th></tr></thead><tbody>
    ${corpus.documents.map(doc => `<tr><td><a href="${escape(doc.url)}">${escape(doc.title)}</a></td><td>${doc.versions.length}</td><td>${number(doc.words)}</td><td>${number(doc.priorVersionWords)}</td><td>${number(doc.reviewWordExposures)}</td></tr>`).join('')}
    </tbody></table></div>`;
  const evidence = corpus.documents.map(doc => `<details><summary>${escape(doc.title)}: ${doc.versions.length} committed revisions</summary>
    <ol class="review-revisions">${doc.versions.map(version => {
      const changes = doc.changes.filter(change => change.commit === version.commit && change.change !== 'added');
      return `<li>${commitLink(version.commit)} (${escape(version.at.slice(0, 10))}): ${number(version.words)} current words, ${version.addedSections} added sections, ${version.changedSections} changed/removed sections.
        ${changes.length ? `<ul>${changes.map(change => `<li><q data-review-historical-title>${escape(change.title)}</q> (${escape(change.change)}): ${number(change.priorWords)} prior words counted; ${number(change.nextWords)} next-version words.</li>`).join('')}</ul>` : 'No superseded section words added.'}</li>`;
    }).join('')}</ol></details>`).join('');
  const replacements = {
    REVIEW_DOCUMENTS: corpus.documents.map(doc => `<label><input type="checkbox" data-review-document="${escape(doc.id)}" value="${escape(doc.id)}"${corpus.defaultDocumentIds.includes(doc.id) ? ' checked' : ''}> ${escape(doc.title)}, ${number(doc.words)} current words; ${number(doc.reviewWordExposures)} version exposures <a href="${escape(doc.url)}">Inspect text</a></label>`).join(''),
    REVIEW_WORDS: number(result.words),
    REVIEW_PRIOR_WORDS: number(result.priorVersionWords),
    REVIEW_EXPOSURES: number(result.baselineExposureWords),
    REVIEW_FIRST_PASS: `${reviewHours(result.firstPassMinutes)} h`,
    REVIEW_BASELINE: `${reviewHours(result.baselineMinutes)} h`,
    REVIEW_RANGE: reviewRange(result.reviewMinMinutes, result.reviewMaxMinutes),
    REVIEW_NOTE: escape(result.note),
    REVIEW_SENSITIVITY: `At ${corpus.readingRate.highWordsPerMinute} to ${corpus.readingRate.lowWordsPerMinute} words/minute: ${reviewRange(result.fasterPaceMinutes, result.slowerPaceMinutes)}. Sensitivity to reading assumptions, not a confidence interval or bound on actual labor.`,
    REVIEW_EVIDENCE: summary + evidence,
  };
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => replacements[key] ?? match);
}
