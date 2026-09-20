export function defaultReviewInputs(corpus) {
  return {
    documentIds: [...corpus.defaultDocumentIds],
    basis: corpus.reviewAssumptions.basis,
    wordsPerMinute: corpus.readingRate.referenceWordsPerMinute,
    rereadFraction: corpus.reviewAssumptions.rereadFraction,
    additionalRereadsMin: corpus.reviewAssumptions.additionalRereadsMin,
    additionalRereadsMax: corpus.reviewAssumptions.additionalRereadsMax,
    additionalReviewMinutes: null,
  };
}

export function estimateReview(corpus, input) {
  if (corpus?.format !== 'ccsl-review-corpus' || corpus.version !== 1 || !Array.isArray(corpus.documents)) throw new Error('Unsupported public review corpus.');
  const keys = ['documentIds', 'basis', 'wordsPerMinute', 'rereadFraction', 'additionalRereadsMin', 'additionalRereadsMax', 'additionalReviewMinutes'];
  if (!input || Object.keys(input).sort().join() !== keys.sort().join()) throw new Error('Review assumptions are incomplete or unknown.');
  if (!['revision', 'current'].includes(input.basis)) throw new Error('Choose revision-aware or current-text review.');
  if (!Array.isArray(input.documentIds) || !input.documentIds.length || new Set(input.documentIds).size !== input.documentIds.length) throw new Error('Select at least one review document without duplicates.');
  if (!Number.isFinite(input.wordsPerMinute) || input.wordsPerMinute < 30 || input.wordsPerMinute > 600) throw new Error('Use a declared reading pace between 30 and 600 words per minute.');
  for (const key of ['additionalRereadsMin', 'additionalRereadsMax']) {
    if (!Number.isSafeInteger(input[key]) || input[key] < 0 || input[key] > 20) throw new Error('Additional rereads must be whole numbers from 0 to 20.');
  }
  if (input.additionalRereadsMax < input.additionalRereadsMin) throw new Error('Maximum rereads cannot be below minimum rereads.');
  if (!Number.isFinite(input.rereadFraction) || input.rereadFraction < 0 || input.rereadFraction > 1) throw new Error('Extra reread coverage must be between 0% and 100%.');
  if (input.additionalRereadsMax > 0 && input.rereadFraction === 0) throw new Error('Declare the text coverage for extra rereads.');
  if (input.additionalReviewMinutes !== null && (!Number.isFinite(input.additionalReviewMinutes) || input.additionalReviewMinutes < 0 || input.additionalReviewMinutes > 100000)) throw new Error('Enter nonnegative additional review minutes, or leave them unknown.');
  const selected = input.documentIds.map(id => {
    const document = corpus.documents.find(item => item.id === id);
    if (!document || !Number.isSafeInteger(document.words) || document.words < 1
        || !Number.isSafeInteger(document.priorVersionWords) || document.priorVersionWords < 0
        || document.reviewWordExposures !== document.words + document.priorVersionWords) throw new Error('Unknown or invalid review document.');
    return document;
  });
  const words = selected.reduce((sum, item) => sum + item.words, 0);
  const priorVersionWords = selected.reduce((sum, item) => sum + item.priorVersionWords, 0);
  const baselineExposureWords = words + (input.basis === 'revision' ? priorVersionWords : 0);
  const lowExposureWords = baselineExposureWords + words * input.rereadFraction * input.additionalRereadsMin;
  const highExposureWords = baselineExposureWords + words * input.rereadFraction * input.additionalRereadsMax;
  const added = input.additionalReviewMinutes ?? 0;
  return {
    words, selected, basis: input.basis, priorVersionWords, baselineExposureWords,
    firstPassMinutes: words / input.wordsPerMinute,
    baselineMinutes: baselineExposureWords / input.wordsPerMinute,
    readingMinMinutes: lowExposureWords / input.wordsPerMinute,
    readingMaxMinutes: highExposureWords / input.wordsPerMinute,
    reviewMinMinutes: lowExposureWords / input.wordsPerMinute + added,
    reviewMaxMinutes: highExposureWords / input.wordsPerMinute + added,
    additionalReviewMinutes: input.additionalReviewMinutes,
    slowerPaceMinutes: highExposureWords / corpus.readingRate.lowWordsPerMinute + added,
    fasterPaceMinutes: lowExposureWords / corpus.readingRate.highWordsPerMinute + added,
    actualTimeMeasured: false,
    note: input.basis === 'revision'
      ? 'Required-review workload assuming one contextual pass per committed section version. Extra passes apply only to current text and must exclude rereads already represented by revisions. This is not observed labor or proof that review occurred.'
      : 'Comparison only: one pass through current text, excluding superseded sections. This omits the recorded revision workload and is not observed labor.',
  };
}

export const reviewHours = minutes => (minutes / 60).toFixed(2);
export const reviewRange = (low, high) => low === high ? `${reviewHours(low)} h` : `${reviewHours(low)} to ${reviewHours(high)} h`;
export function reviewCardNote(result) {
  return `${result.baselineExposureWords.toLocaleString('en-US')} baseline word exposures; ${result.basis === 'revision' ? 'section-version' : 'current-text'} reading estimate, not logged labor. ${result.additionalReviewMinutes === null ? 'Checking/editing unquantified.' : 'Includes entered extra minutes.'}`;
}
