import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { marked } from 'marked';
import { reviewText } from './review-corpus.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const normalized = text => text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
const digest = text => createHash('sha256').update(normalized(text)).digest('hex');
const words = text => text.split(/\s+/).filter(token => /[\p{L}\p{N}]/u.test(token)).length;

export function reviewSections(markdown) {
  const result = new Map();
  let current = { key: 'preamble', title: 'Title and preamble', source: '' };
  const finish = () => {
    const text = reviewText(marked.parse(current.source));
    if (text) {
      if (result.has(current.key)) throw new Error(`Ambiguous review section: ${current.title}`);
      result.set(current.key, { key: current.key, title: current.title, words: words(text), textSha256: digest(text) });
    }
  };
  for (const token of marked.lexer(markdown)) {
    if (token.type === 'heading' && token.depth === 2) {
      finish();
      const title = reviewText(marked.parseInline(token.text)).replace(/^\d+[.:)]\s*/, '');
      if (/^(References|Bibliography|Source register)$/i.test(title)) return result;
      if (!title) throw new Error('Review history contains an empty section heading.');
      current = { key: title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-'), title, source: `## ${title}\n\n` };
    } else current.source += token.raw;
  }
  finish();
  return result;
}

export function compareReviewSections(previous, next) {
  const events = [];
  for (const [key, before] of previous) {
    const after = next.get(key);
    if (!after || after.textSha256 !== before.textSha256) {
      events.push({ section: key, title: after?.title ?? before.title, change: after ? 'changed' : 'removed',
        priorWords: before.words, nextWords: after?.words ?? 0,
        priorTextSha256: before.textSha256, nextTextSha256: after?.textSha256 ?? null });
    }
  }
  for (const [key, after] of next) if (!previous.has(key)) events.push({
    section: key, title: after.title, change: 'added', priorWords: 0, nextWords: after.words,
    priorTextSha256: null, nextTextSha256: after.textSha256,
  });
  return events;
}

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trimEnd();
}
function snapshot(commit, source) {
  const result = spawnSync('git', ['show', `${commit}:${source}`], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Cannot read review source ${source} at ${commit}: ${result.stderr}`);
  return normalized(result.stdout);
}

export async function captureReviewHistory() {
  const config = JSON.parse(await readFile(new URL('../usage/audit-config.json', import.meta.url), 'utf8'));
  const commit = config.materialCommit;
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Review history needs a recorded material commit.');
  const manifest = JSON.parse(snapshot(commit, 'research/publications.json'));
  const definitions = [
    { id: 'main-report', title: 'Main research report', source: 'research/report.md', group: 'Public research' },
    ...manifest.public.map(item => ({ id: item.id, title: item.title, source: item.source, group: 'Public research' })),
    { id: 'study-concept', title: 'Simulation concept', source: 'agentic-model/CONCEPT-IDEA.md', group: 'Repository study documents' },
    { id: 'study-specification', title: 'Simulation specification', source: 'agentic-model/SPECIFICATION.md', group: 'Repository study documents' },
    { id: 'study-plan', title: 'Implementation plan', source: 'agentic-model/PLAN.md', group: 'Repository study documents' },
    { id: 'study-backlog', title: 'Implementation backlog', source: 'agentic-model/BACKLOG.md', group: 'Repository study documents' },
    { id: 'study-startup-funding', title: 'Startup funding analysis', source: 'agentic-model/STARTUP-FUNDING.md', group: 'Repository study documents' },
  ];
  const documents = [];
  for (const definition of definitions) {
    const lines = git(['log', '--reverse', '--format=%H%x09%cI', commit, '--', definition.source]).split('\n').filter(Boolean);
    if (!lines.length) throw new Error(`No recorded revisions for ${definition.source}`);
    let previous = new Map(), priorVersionWords = 0;
    const versions = [], changes = [];
    for (const line of lines) {
      const [revision, date] = line.split('\t');
      const source = snapshot(revision, definition.source), sections = reviewSections(source);
      const events = compareReviewSections(previous, sections);
      for (const event of events) {
        priorVersionWords += event.priorWords;
        changes.push({ commit: revision, at: new Date(date).toISOString(), ...event });
      }
      versions.push({ commit: revision, at: new Date(date).toISOString(), sourceSha256: digest(source),
        words: [...sections.values()].reduce((sum, section) => sum + section.words, 0),
        changedSections: events.filter(event => event.change !== 'added').length, addedSections: events.filter(event => event.change === 'added').length });
      previous = sections;
    }
    const latestSource = snapshot(commit, definition.source);
    const latest = reviewSections(latestSource);
    const currentWords = [...latest.values()].reduce((sum, section) => sum + section.words, 0);
    const expectedLast = versions.at(-1);
    if (expectedLast.sourceSha256 !== digest(latestSource)) throw new Error('Review history did not reach the material snapshot.');
    documents.push({
      ...definition,
      url: `https://github.com/Ethical-Tech-CoLab/commons-collective/blob/${commit}/${definition.source}`,
      words: currentWords, priorVersionWords, reviewWordExposures: currentWords + priorVersionWords,
      sourceSha256: digest(latestSource), versions, changes,
    });
  }
  const result = {
    format: 'ccsl-review-history', version: 1, materialCommit: commit, usageCutoffExclusive: config.cutoffExclusive,
    capturedAt: new Date().toISOString(),
    method: 'One contextual reading pass per version of each source section. Latest source-section words are counted once; each superseded or removed section contributes its prior-version words. Added sections are not counted twice. Unchanged sections, whitespace-only changes and heading renumbering do not create extra passes.',
    identityRule: 'Level-two headings, with leading section numbers removed, identify sections; a title change is recorded as removal/addition. Preamble is its own section.',
    interpretation: 'Required-review workload estimate, not observed reading, a timesheet, or proof that every change was reviewed. Mechanical wording edits are included when visible source text changes.',
    limitations: [
      'Only committed versions of the selected Markdown sources through the recorded material commit are counted.',
      'Bibliographies headed References, Bibliography or Source register, citation markers, code blocks and image pixels are excluded.',
      'Generated financial tables, external source changes, charts, layout, code review, uncommitted drafts and extra checking may require additional review not captured in source-section words.',
      'Reading speed is an assumption. Actual editorial effort and author responsibility cannot be measured from word counts or API gaps.',
      'Reported rereads may already correspond to these revision passes. Add extra passes only when they are not represented by the version history.',
    ],
    documents,
    totals: {
      documents: documents.length,
      currentWords: documents.reduce((sum, doc) => sum + doc.words, 0),
      priorVersionWords: documents.reduce((sum, doc) => sum + doc.priorVersionWords, 0),
      reviewWordExposures: documents.reduce((sum, doc) => sum + doc.reviewWordExposures, 0),
      changedSectionEvents: documents.reduce((sum, doc) => sum + doc.changes.filter(change => change.change !== 'added').length, 0),
    },
    sourceMethod: { script: 'scripts/capture-review-history.mjs', sha256: digest(await readFile(new URL(import.meta.url), 'utf8')),
      textMethod: 'scripts/review-corpus.mjs', textMethodSha256: digest(await readFile(new URL('./review-corpus.mjs', import.meta.url), 'utf8')) },
  };
  await writeFile(new URL('../usage/review-history.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  for (const document of documents) console.log(JSON.stringify({
    document: document.id, versions: document.versions.length, currentWords: document.words,
    priorVersionWords: document.priorVersionWords, reviewWordExposures: document.reviewWordExposures,
    baselineHoursAt238: document.reviewWordExposures / 238 / 60,
  }));
  return result;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await captureReviewHistory();
