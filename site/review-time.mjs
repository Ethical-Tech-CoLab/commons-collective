import { defaultReviewInputs, estimateReview, reviewHours as hours, reviewRange as range, reviewCardNote } from './review-time-model.mjs';

const number = value => value.toLocaleString('en-US');

export async function initReviewTime(root) {
  if (!root) throw new Error('Author-review panel is missing.');
  const $ = id => root.querySelector(`#review-${id}`);
  const card = document.querySelector('[data-audit-metric="author-review"] dd');
  const cardNote = document.querySelector('[data-audit-metric="author-review"] p');
  let corpus;
  function fail(error) {
    $('error').hidden = false;
    $('error').textContent = error.message;
    $('results').hidden = true;
    card.textContent = 'Assumptions incomplete';
    cardNote.textContent = 'Correct the review inputs below. No actual review time was measured.';
  }
  function optionalNumber(node, scale = 1) {
    return node.value.trim() === '' ? null : Number(node.value) / scale;
  }
  function render() {
    try {
      const input = {
        documentIds: [...root.querySelectorAll('[data-review-document]:checked')].map(node => node.value),
        basis: $('basis').value,
        wordsPerMinute: Number($('pace').value),
        rereadFraction: optionalNumber($('coverage'), 100),
        additionalRereadsMin: Number($('rereads-min').value),
        additionalRereadsMax: Number($('rereads-max').value),
        additionalReviewMinutes: optionalNumber($('additional')),
      };
      for (const key of ['pace', 'coverage', 'rereads-min', 'rereads-max']) if (!$(`${key}`).value.trim()) throw new Error('Reading pace, coverage and reread counts are required.');
      const result = estimateReview(corpus, input);
      $('error').hidden = true;
      $('results').hidden = false;
      $('words').textContent = number(result.words);
      $('first-pass').textContent = `${hours(result.firstPassMinutes)} h`;
      $('prior-words').textContent = number(result.priorVersionWords);
      $('exposures').textContent = number(result.baselineExposureWords);
      $('baseline').textContent = `${hours(result.baselineMinutes)} h`;
      $('reading').textContent = range(result.readingMinMinutes, result.readingMaxMinutes);
      $('estimate').textContent = range(result.reviewMinMinutes, result.reviewMaxMinutes);
      $('extra').textContent = result.additionalReviewMinutes === null ? 'Not quantified; not included in the reading estimate' : `${number(result.additionalReviewMinutes)} author-entered additional minutes`;
      $('scope-note').textContent = result.note;
      $('speed-sensitivity').textContent = `With the same exposure assumptions, the ${corpus.readingRate.highWordsPerMinute} to ${corpus.readingRate.lowWordsPerMinute} words/minute reference range gives ${range(result.fasterPaceMinutes, result.slowerPaceMinutes)}. This is sensitivity to assumptions, not a confidence interval or a bound on actual review time.`;
      card.textContent = range(result.reviewMinMinutes, result.reviewMaxMinutes);
      cardNote.textContent = reviewCardNote(result);
    } catch (error) { fail(error); }
  }
  function reset() {
    const defaults = defaultReviewInputs(corpus);
    for (const input of root.querySelectorAll('[data-review-document]')) input.checked = defaults.documentIds.includes(input.value);
    $('pace').value = defaults.wordsPerMinute;
    $('basis').value = defaults.basis;
    $('coverage').value = defaults.rereadFraction * 100;
    $('rereads-min').value = defaults.additionalRereadsMin;
    $('rereads-max').value = defaults.additionalRereadsMax;
    $('additional').value = '';
    render();
  }
  try {
    const response = await fetch(root.dataset.corpus, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Review corpus unavailable: HTTP ${response.status}.`);
    corpus = await response.json();
    estimateReview(corpus, defaultReviewInputs(corpus));
    const list = $('documents');
    list.replaceChildren();
    for (const item of corpus.documents) {
      const label = document.createElement('label'), input = document.createElement('input'), link = document.createElement('a');
      input.type = 'checkbox'; input.value = item.id; input.dataset.reviewDocument = item.id;
      label.append(input, document.createTextNode(` ${item.title}, ${number(item.words)} current words; ${number(item.reviewWordExposures)} version exposures `));
      link.href = item.url; link.textContent = 'Inspect text'; label.append(link); list.append(label);
    }
    $('form').addEventListener('input', render);
    $('form').addEventListener('submit', event => event.preventDefault());
    $('reset').addEventListener('click', reset);
    reset();
  } catch (error) { fail(error); }
}

initReviewTime(document.querySelector('#author-review'));
