import { createConfig, validateConfig, MODELS } from './config.mjs';

export function immutable(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

export function updateSession(session, patch) {
  return immutable({ ...session, ...patch });
}

export function createSession(modelId = 'ai-commons', generation = 0, importedConfig = null) {
  const defaults = createConfig(modelId);
  const config = validateConfig(importedConfig ?? defaults);
  if (config.modelId !== modelId) throw new Error('Imported configuration does not match the selected model.');
  if (!Number.isSafeInteger(generation) || generation < 0) throw new RangeError('Invalid session generation.');
  return immutable({
    generation,
    config,
    runId: null,
    task: null,
    status: 'ready',
    summary: null,
    artifact: null,
    error: '',
    batch: { replications: 5, parameterKey: '', parameterValues: '', done: 0, total: 0, result: null, kind: null },
    replay: { artifact: null, verified: false },
    ui: { advanced: false, eventFilter: 'all', chartMetric: 'operatorCashCents', fileName: '', fileToken: null, draft: null },
  });
}

export function resetSession(session, modelId = session.config.modelId, importedConfig = null) {
  // Rebuild the entire tree, never merge model defaults with the previous scenario.
  return createSession(modelId, session.generation + 1, importedConfig);
}

export function editSession(session, config, draft = null, error = '') {
  const fresh = createSession(session.config.modelId, session.generation + 1, config);
  return updateSession(fresh, {
    status: error ? 'invalid' : 'ready',
    error,
    batch: { ...fresh.batch, replications: session.batch.replications, parameterKey: session.batch.parameterKey, parameterValues: session.batch.parameterValues },
    ui: { ...session.ui, fileName: '', fileToken: null, draft },
  });
}

export function beginSession(session, runId, task = 'run') {
  if (!['run', 'batch', 'sweep', 'replay'].includes(task)) throw new Error('Unknown execution task.');
  if (session.status === 'invalid') throw new Error('Fix the scenario before running.');
  if (typeof runId !== 'string' || !runId.trim()) throw new Error('A run identity is required.');
  if (task === 'replay' && !session.replay.artifact) throw new Error('Import a completed run before replaying.');
  return updateSession(session, {
    generation: session.generation + 1,
    runId,
    task,
    status: 'running',
    summary: null,
    artifact: null,
    error: '',
    batch: { ...session.batch, done: 0, total: 0, result: null, kind: task === 'batch' || task === 'sweep' ? task : null },
    replay: { ...session.replay, verified: false },
    ui: { ...session.ui, fileName: '', fileToken: null },
  });
}

export function acceptsMessage(session, message) {
  if (!message || !session.runId || !['running', 'paused'].includes(session.status)) return false;
  if (message.generation !== session.generation || message.runId !== session.runId || message.modelId !== session.config.modelId) return false;
  if (message.type === 'error') return true;
  if (session.task === 'batch' || session.task === 'sweep') {
    if (message.type === 'batch-progress') return true;
    return message.type === 'batch-complete' && message.result?.modelId === session.config.modelId;
  }
  return ['snapshot', 'complete'].includes(message.type) && message.summary?.modelId === session.config.modelId;
}

export function acceptsImport(session, generation, token) {
  return session.generation === generation && session.ui.fileToken === token && token !== null;
}

export function parseSweep(config, key, text) {
  const field = MODELS.find(model => model.id === config.modelId)?.fields.find(item => item.key === key);
  if (!field) throw new Error('Choose a parameter for the sweep.');
  const pieces = String(text).split(',').map(value => value.trim());
  if (pieces.length !== 3 || pieces.some(value => !value)) throw new Error('Enter exactly three distinct values, separated by commas.');
  const values = pieces.map(value => {
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) throw new Error('Sweep values must be finite decimal numbers.');
    return Number(value);
  });
  if (new Set(values).size !== 3) throw new Error('The three sweep values must be distinct.');
  for (const value of values) {
    // Full validation also checks relationships such as contributors <= consumers.
    validateConfig({ ...config, params: { ...config.params, [key]: value } });
  }
  return values;
}
