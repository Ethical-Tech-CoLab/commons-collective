import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { projectStartup } from '../simulation/startup.mjs';
import { startupMoney } from '../simulation/money.mjs';
import { renderMoneyHTML } from '../simulation/money-render.mjs';

const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

test('published Follow the Money is exactly the Lab reference rollup, not a separate allocation calculator', async () => {
  const reference = JSON.parse(await read('dist/money-reference.json'));
  const regenerated = projectStartup(reference.config);
  const rollup = startupMoney(regenerated);
  const html = await read('dist/index.html');
  assert.equal(reference.id, regenerated.id);
  assert.ok(html.includes(renderMoneyHTML(rollup)));
  assert.doesNotMatch(html, /id="calculator"|name="revenue"|data-result="perMember"/);
  assert.match(html, /id="money-view"/);
  assert.match(html, /Trial results and data/);
  assert.match(html, /one-time storage/);
  for (const file of ['dist/report.md', 'dist/index.html']) {
    const text = await read(file);
    assert.ok(text.includes(rollup.source.identity));
    assert.ok(text.includes('$5,004,795.25'));
    assert.doesNotMatch(text, /<!-- money:startup -->|\{\{MONEY/);
  }
});

test('the public knowledge object follows the implemented contributor contract without inventing permission', async () => {
  const example = JSON.parse(await read('examples/knowledge-object.json'));
  const observation = JSON.parse(await read('examples/reputation-observation.json'));
  assert.equal(example.benefits.memberPoolBps, 10000);
  assert.equal(example.benefits.commonsBps + example.benefits.operationsBps + example.benefits.reserveBps, 0);
  assert.equal(observation.subjectId, example.id);
  assert.equal(example.syntheticExample, true);
  assert.equal(example.provenance.verificationStatus, 'unverified-demonstration');
  assert.equal(observation.admissibility.eligibleForRanking, false);
});
