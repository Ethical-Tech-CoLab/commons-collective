export function reviewText(html) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: ' ' };
  return html
    .split(/<h2\b[^>]*>\s*(?:References|Bibliography|Source register)\s*<\/h2>/i)[0]
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|pre)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, '')
    .replace(/<br\s*\/?>|<\/(?:p|div|li|h[1-6]|blockquote|td|th|tr|summary|figcaption|details|ul|ol)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => String.fromCodePoint(code[0].toLowerCase() === 'x' ? Number.parseInt(code.slice(1), 16) : Number(code)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp|middot);/g, (_, name) => entities[name])
    .replace(/\[S\d{2}\]/g, '')
    .replace(/\s+/g, ' ').trim();
}

export function validateReviewHistory(history, materialCommit, methodHashes) {
  if (history?.format !== 'ccsl-review-history' || history.version !== 1 || history.materialCommit !== materialCommit
      || !/^[a-f0-9]{40}$/.test(materialCommit) || !Number.isFinite(Date.parse(history.usageCutoffExclusive))
      || !Array.isArray(history.documents) || !history.documents.length) throw new Error('Review history does not match the audited material snapshot.');
  if (methodHashes && (history.sourceMethod.sha256 !== methodHashes.script
      || history.sourceMethod.textMethodSha256 !== methodHashes.text)) throw new Error('Review-counting method changed; recapture the source history.');
  const ids = new Set();
  for (const doc of history.documents) {
    if (!doc.id || ids.has(doc.id) || !Array.isArray(doc.versions) || !doc.versions.length || !Array.isArray(doc.changes)
        || !/^(research|papers|agentic-model)\/[A-Za-z0-9-]+\.md$/.test(doc.source)
        || doc.url !== `https://github.com/Ethical-Tech-CoLab/commons-collective/blob/${materialCommit}/${doc.source}`) throw new Error('Invalid review document identity.');
    ids.add(doc.id);
    const state = new Map();
    const commits = new Set();
    let priorWords = 0, seenEvents = 0;
    for (const version of doc.versions) {
      if (!/^[a-f0-9]{40}$/.test(version.commit) || !/^[a-f0-9]{64}$/.test(version.sourceSha256)) throw new Error('Invalid review revision provenance.');
      if (commits.has(version.commit)) throw new Error('Duplicate review revision.');
      commits.add(version.commit);
      if (!Number.isFinite(Date.parse(version.at)) || Date.parse(version.at) >= Date.parse(history.usageCutoffExclusive)) throw new Error('Review revision is outside the material boundary.');
      const changes = doc.changes.filter(change => change.commit === version.commit);
      const unique = new Set();
      for (const change of changes) {
        if (!change.section || unique.has(change.section) || change.at !== version.at
            || !Number.isSafeInteger(change.priorWords) || !Number.isSafeInteger(change.nextWords)
            || change.priorWords < 0 || change.nextWords < 0) throw new Error('Duplicate or invalid section review event.');
        unique.add(change.section); seenEvents++;
        const before = state.get(change.section);
        if (change.change === 'added') {
          if (before || change.priorWords !== 0 || change.priorTextSha256 !== null) throw new Error('Added section was counted as a prior version.');
        } else if (!before || before.words !== change.priorWords || before.hash !== change.priorTextSha256) {
          throw new Error('Review event does not match its prior section.');
        }
        priorWords += change.priorWords;
        if (change.change === 'removed') {
          if (change.nextWords !== 0 || change.nextTextSha256 !== null) throw new Error('Removed section has current words.');
          state.delete(change.section);
        } else {
          if (!['added', 'changed'].includes(change.change) || !/^[a-f0-9]{64}$/.test(change.nextTextSha256)) throw new Error('Invalid changed-section record.');
          if (change.change === 'changed' && change.nextTextSha256 === change.priorTextSha256) throw new Error('Unchanged section counted twice.');
          state.set(change.section, { words: change.nextWords, hash: change.nextTextSha256 });
        }
      }
      if (version.words !== [...state.values()].reduce((sum, section) => sum + section.words, 0)
          || version.changedSections !== changes.filter(change => change.change !== 'added').length
          || version.addedSections !== changes.filter(change => change.change === 'added').length) throw new Error('Revision word totals do not reconcile.');
    }
    if (seenEvents !== doc.changes.length || doc.words !== doc.versions.at(-1).words || priorWords !== doc.priorVersionWords
        || doc.reviewWordExposures !== doc.words + priorWords || doc.sourceSha256 !== doc.versions.at(-1).sourceSha256) throw new Error('Document review workload does not reconcile.');
  }
  if (!ids.has('main-report')) throw new Error('The main report is required in the review scope.');
  const expected = {
    documents: history.documents.length,
    currentWords: history.documents.reduce((sum, doc) => sum + doc.words, 0),
    priorVersionWords: history.documents.reduce((sum, doc) => sum + doc.priorVersionWords, 0),
    reviewWordExposures: history.documents.reduce((sum, doc) => sum + doc.reviewWordExposures, 0),
    changedSectionEvents: history.documents.reduce((sum, doc) => sum + doc.changes.filter(change => change.change !== 'added').length, 0),
  };
  for (const key of Object.keys(expected)) if (history.totals[key] !== expected[key]) throw new Error(`Review total differs: ${key}`);
  return history;
}

export function createReviewCorpus(history) {
  validateReviewHistory(history, history.materialCommit);
  return {
    format: 'ccsl-review-corpus', version: 1,
    materialCommit: history.materialCommit,
    historyCapturedAt: history.capturedAt,
    method: history.method,
    limitations: history.limitations,
    documents: history.documents,
    defaultDocumentIds: ['main-report'],
    readingRate: {
      referenceWordsPerMinute: 238, lowWordsPerMinute: 175, highWordsPerMinute: 300,
      source: 'Brysbaert (2019), How many words do we read per minute? A review and meta-analysis of reading rate.',
      url: 'https://doi.org/10.1016/j.jml.2019.104047',
      limitation: 'Adult English silent nonfiction reading reference, not a measured pace for technical, editorial or fact-checking review.',
    },
    reviewAssumptions: {
      basis: 'revision',
      additionalRereadsMin: 0, additionalRereadsMax: 0,
      rereadFraction: 0, additionalReviewMinutes: null,
      explanation: 'The author reports rereading some sections 2-3 times. Committed section revisions already represent required contextual re-review; extra passes default to zero to avoid counting the same reread twice. Actual completion and additional checking/editing time are not measured.',
      actualHumanReviewMeasured: false,
    },
  };
}
