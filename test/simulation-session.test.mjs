import test from 'node:test';
import assert from 'node:assert/strict';
import { MODELS, createConfig } from '../simulation/config.mjs';
import {
  createSession, resetSession, updateSession, editSession, beginSession,
  acceptsMessage, acceptsImport, parseSweep,
} from '../simulation/session.mjs';

function dirtySession(modelId, status = 'running') {
  const session = createSession(modelId);
  const config = createConfig(modelId);
  // Derive this inventory from the registry so newly registered fields are covered.
  for (const field of MODELS.find(model => model.id === modelId).fields) {
    config.params[field.key] = field.value === field.min ? field.max : field.min;
  }
  if (modelId === 'ai-commons') config.params.consumers = Math.max(config.params.consumers, config.params.contributors);
  if (modelId === 'library-oer') config.params.variableCost = Math.max(config.params.variableCost, config.params.wage);
  Object.assign(config, { seed: 'edited-seed', arrangement: 'A0', family: 'F1', mode: 'P0' });
  const edited = editSession(session, config);
  return updateSession(edited, {
    status, runId: 'old-run', task: 'sweep', summary: { tick: 89 }, artifact: { old: true }, error: 'old error',
    batch: { replications: 12, parameterKey: 'budget', parameterValues: '0,100,200', done: 3, total: 144, result: { old: true }, kind: 'sweep' },
    replay: { artifact: { old: true }, verified: true },
    ui: { advanced: true, eventFilter: 'payment', chartMetric: 'commonsWork', fileName: 'old.json', fileToken: 'old-file', draft: { seed: 'pending' } },
  });
}

test('every model switch reconstructs the full immutable registry defaults', () => {
  for (const from of MODELS) {
    for (const to of MODELS) {
      const dirty = dirtySession(from.id);
      const reset = resetSession(dirty, to.id);
      assert.deepEqual(reset, createSession(to.id, dirty.generation + 1));
      assert.deepEqual(reset.config, createConfig(to.id));
      assert.notEqual(reset.config, dirty.config);
      assert.notEqual(reset.config.params, dirty.config.params);
      assert.ok(Object.isFrozen(reset));
      assert.ok(Object.isFrozen(reset.config.params));
      assert.ok(Object.isFrozen(reset.batch));
      assert.ok(Object.isFrozen(reset.ui));
      for (const field of to.fields) assert.equal(reset.config.params[field.key], field.value);
      assert.deepEqual(Object.keys(reset.config.params).sort(), to.fields.map(field => field.key).sort());
    }
  }
});

test('same-model resets clear running, paused, replaying, failed and completed states', () => {
  for (const status of ['running', 'paused', 'invalid', 'error', 'complete', 'cancelled']) {
    const previous = dirtySession('ai-commons', status);
    const reset = resetSession(previous);
    assert.deepEqual(reset, createSession('ai-commons', previous.generation + 1));
  }
});

test('rapid AI/library/AI switches do not restore old edits or accept stale work', () => {
  const active = beginSession(dirtySession('ai-commons'), 'run-ai');
  const library = beginSession(resetSession(active, 'library-oer'), 'run-library');
  const returned = beginSession(resetSession(library, 'ai-commons'), 'run-ai-new');
  for (const old of [active, library]) {
    for (const type of ['snapshot', 'complete', 'error', 'batch-progress', 'batch-complete']) {
      assert.equal(acceptsMessage(returned, { type, generation: old.generation, runId: old.runId, modelId: old.config.modelId, summary: { modelId: old.config.modelId } }), false);
    }
  }
  assert.deepEqual(returned.config, createConfig('ai-commons'));
});

test('worker responses require generation, run, outer and nested model identity and job type', () => {
  const state = beginSession(createSession(), 'current');
  const message = { type: 'snapshot', generation: state.generation, runId: state.runId, modelId: 'ai-commons', summary: { modelId: 'ai-commons' } };
  assert.equal(acceptsMessage(state, message), true);
  assert.equal(acceptsMessage(updateSession(state, { status: 'paused' }), message), true);
  for (const patch of [
    { generation: 0 }, { runId: 'old' }, { modelId: 'library-oer' },
    { summary: { modelId: 'library-oer' } }, { type: 'batch-progress' }, { type: 'unknown' },
  ]) assert.equal(acceptsMessage(state, { ...message, ...patch }), false);
  for (const status of ['ready', 'complete', 'error', 'invalid', 'cancelled']) {
    assert.equal(acceptsMessage(updateSession(state, { status }), message), false);
  }
  assert.equal(acceptsMessage(state, null), false);
  const batch = beginSession(createSession(), 'batch', 'batch');
  const result = { type: 'batch-complete', generation: batch.generation, runId: batch.runId, modelId: 'ai-commons', result: { modelId: 'ai-commons' } };
  assert.equal(acceptsMessage(batch, result), true);
  assert.equal(acceptsMessage(batch, { ...result, result: { modelId: 'library-oer' } }), false);
  assert.equal(acceptsMessage(batch, { ...result, type: 'snapshot', summary: { modelId: 'ai-commons' } }), false);
});

test('sessions and explicit imports cannot mutate defaults or share nested state', () => {
  const first = createSession();
  const second = createSession();
  assert.notEqual(first.config.params, second.config.params);
  assert.throws(() => { first.config.params.periods = 1; }, TypeError);
  const saved = createConfig('library-oer');
  saved.seed = 'explicit-import';
  saved.params.periods = 3;
  const loaded = resetSession(first, 'library-oer', saved);
  saved.params.periods = 4;
  assert.equal(loaded.config.params.periods, 3);
  assert.equal(loaded.config.seed, 'explicit-import');
  assert.equal(resetSession(loaded).config.params.periods, 36);
  assert.throws(() => resetSession(loaded, 'unregistered'));
  assert.throws(() => resetSession(loaded, 'ai-commons', saved), /does not match/);
});

test('pending file reads are invalidated by reset, edits, new runs and newer file selection', () => {
  const state = updateSession(createSession(), { ui: { ...createSession().ui, fileToken: 'file-1' } });
  assert.equal(acceptsImport(state, state.generation, 'file-1'), true);
  for (const next of [
    resetSession(state), editSession(state, state.config), beginSession(state, 'new'),
    updateSession(state, { ui: { ...state.ui, fileToken: 'file-2' } }),
  ]) assert.equal(acceptsImport(next, state.generation, 'file-1'), false);
  assert.equal(acceptsImport(createSession(), 0, null), false);
});

test('configuration editing clears old results, artifacts and replay without reviving a world', () => {
  const old = dirtySession('library-oer');
  const edited = editSession(old, createConfig('library-oer'));
  assert.equal(edited.runId, null);
  assert.equal(edited.summary, null);
  assert.equal(edited.artifact, null);
  assert.equal(edited.batch.result, null);
  assert.equal(edited.replay.artifact, null);
  assert.equal(edited.status, 'ready');
  const invalid = editSession(edited, edited.config, { budget: '' }, 'Budget is required.');
  assert.equal(invalid.status, 'invalid');
  assert.throws(() => beginSession(invalid, 'invalid'), /Fix/);
});

test('three-value sweeps validate numeric syntax, bounds and cross-parameter relationships', () => {
  const config = createConfig();
  assert.deepEqual(parseSweep(config, 'quality', '0, .5, 1'), [0, 0.5, 1]);
  assert.deepEqual(parseSweep(config, 'budget', '0, 1e2, 200'), [0, 100, 200]);
  for (const value of ['', '0,1', '0,1,2,3', '0,0,1', '0,,1', '0,NaN,1', '0,Infinity,1', '0,0x10,1', '-1,0,1', '0,1,2']) {
    assert.throws(() => parseSweep(config, 'quality', value));
  }
  assert.throws(() => parseSweep(config, 'unknown', '0,1,2'));
  assert.throws(() => parseSweep(config, 'consumers', '10,20,30'), /Contributor/);
  assert.throws(() => parseSweep(config, 'periods', '1,1.5,2'));
});
