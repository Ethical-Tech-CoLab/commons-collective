import { MODELS, ARRANGEMENTS, ENGINE_VERSION, BUILD_ID, validateConfig } from './config.mjs';
import { exportScenario, importArtifact } from './artifacts.mjs';
import {
  createSession, resetSession, editSession, beginSession, updateSession,
  acceptsMessage, acceptsImport, parseSweep,
} from './session.mjs';

const $ = id => document.getElementById(id);
const supported = typeof Worker !== 'undefined';
const svgNS = 'http://www.w3.org/2000/svg';
const coreKeys = {
  'ai-commons': new Set(['periods', 'consumers', 'contributors', 'providers', 'budget', 'retailPrice', 'quality', 'qualityEffect', 'covenant', 'grant']),
  'library-oer': new Set(['periods', 'buyers', 'patrons', 'maintainers', 'resources', 'budget', 'minimumQuality', 'repairSuccess', 'covenant', 'grant']),
};
const chartDefinitions = {
  operatorCashCents: { label: 'Unrestricted operator cash', unit: 'USD', scale: 0.01 },
  qualityRate: { label: 'Observed service quality', unit: '%', scale: 100 },
  participants: { label: 'Participants', unit: 'count', scale: 1 },
  commonsWork: { label: 'Commons work', unit: 'count', scale: 1 },
};
let state = createSession();
let worker = null;
let runSequence = 0;
let fileSequence = 0;

const number = (value, digits = 0) => Number.isFinite(value)
  ? value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—';
const money = value => Number.isFinite(value) ? `$${number(value / 100, 2)}` : '—';
const percent = value => Number.isFinite(value) ? `${number(value * 100, 1)}%` : '—';
const errorText = error => error instanceof Error ? error.message : String(error);
const model = () => MODELS.find(item => item.id === state.config.modelId);
const busy = () => ['running', 'paused'].includes(state.status);
const batchTask = () => ['batch', 'sweep'].includes(state.task);
const set = (id, text) => {
  const node = $(id);
  if (node.textContent !== String(text)) node.textContent = text;
};
const announce = text => set('announcement', text);

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function option(value, text) {
  const node = element('option', text);
  node.value = value;
  return node;
}

function row(values) {
  const tr = element('tr');
  for (const value of values) tr.append(element('td', String(value)));
  return tr;
}

function table(caption, headers, rows) {
  const wrap = element('div', undefined, 'sim-table-scroll');
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'region');
  wrap.setAttribute('aria-label', caption);
  const node = element('table');
  node.append(element('caption', caption));
  const head = element('thead');
  const headingRow = element('tr');
  for (const label of headers) {
    const th = element('th', label);
    th.scope = 'col';
    headingRow.append(th);
  }
  head.append(headingRow);
  const body = element('tbody');
  for (const cells of rows) body.append(row(cells));
  node.append(head, body);
  wrap.append(node);
  return wrap;
}

function configLabel(config) {
  const ordered = { ...config, params: Object.fromEntries(Object.entries(config.params).sort(([a], [b]) => a.localeCompare(b))) };
  const text = JSON.stringify(ordered);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function terminateWorker() {
  const previous = worker;
  worker = null;
  if (previous) {
    previous.onmessage = null;
    previous.onerror = null;
    previous.onmessageerror = null;
    previous.terminate();
  }
}

function reset(modelId = state.config.modelId, config = null, replayArtifact = null) {
  const next = resetSession(state, modelId, config);
  // Publish the identity barrier before terminating the old worker or touching controls.
  state = replayArtifact ? updateSession(next, { replay: { artifact: replayArtifact, verified: false } }) : next;
  terminateWorker();
  $('artifact-file').value = '';
  for (const details of document.querySelectorAll('.simulation main details')) details.open = false;
  renderControls();
  render();
  announce(`${model().title}: ${config ? 'saved configuration loaded' : 'all reference defaults restored'}. Ready, not running. Previous work and displayed results cleared.`);
}

function reportError(error, fatal = false) {
  state = updateSession(state, { error: errorText(error), ...(fatal ? { status: 'error' } : {}) });
  if (fatal) terminateWorker();
  renderStatus();
  renderArtifacts();
}

function unitFor(field) {
  return field.unit || (field.key === 'withdrawTick' ? 'tick (−1 = never)' : field.min === 0 && field.max === 1 ? 'fraction (0–1)' : 'count');
}

function renderControls() {
  $('model-select').value = state.config.modelId;
  set('model-description', model().description);
  set('mode-help', state.config.modelId === 'library-oer'
    ? 'P0 uses deterministic patron requests; P1 samples patron/resource requests. Procurement remains rule-based in both, and world hazards remain seeded. Live P2 is unavailable: no backend, API calls, or real charges.'
    : 'P0 uses deterministic offer acceptance; P1 samples eligible offer choices. Both retain seeded world randomness. Live P2 is unavailable: no backend, API calls, or real charges.');
  for (const key of ['arrangement', 'family', 'mode', 'seed']) $(key).value = state.config[key];
  $('core-fields').replaceChildren();
  $('advanced-fields').replaceChildren();
  $('sweep-parameter').replaceChildren(option('', 'Choose a parameter'));
  let advancedCount = 0;
  for (const field of model().fields) {
    const wrap = element('div', undefined, 'sim-field');
    const label = element('label', field.label);
    label.htmlFor = `param-${field.key}`;
    label.append(element('span', unitFor(field), 'sim-field-unit'));
    const input = element('input');
    input.id = `param-${field.key}`;
    input.name = field.key;
    input.type = field.kind === 'number' ? 'number' : 'text';
    input.min = field.min;
    input.max = field.max;
    input.step = field.step;
    input.value = state.config.params[field.key];
    input.required = true;
    input.dataset.parameter = field.key;
    input.setAttribute('aria-describedby', `range-${field.key}`);
    const range = element('span', `${number(field.min, field.step < 1 ? 3 : 0)}–${number(field.max, field.step < 1 ? 3 : 0)}`, 'sim-field-range');
    range.id = `range-${field.key}`;
    input.title = `${field.label}: ${field.min} to ${field.max} ${unitFor(field)}. Suggested increment ${field.step}.`;
    wrap.append(label, input, range);
    const core = coreKeys[state.config.modelId].has(field.key);
    $(core ? 'core-fields' : 'advanced-fields').append(wrap);
    if (!core) advancedCount++;
    $('sweep-parameter').append(option(field.key, `${field.label} · ${unitFor(field)}`));
  }
  set('advanced-count', `(${advancedCount})`);
  $('advanced-controls').open = state.ui.advanced;
  $('chart-metric').value = state.ui.chartMetric;
  $('replications').value = state.batch.replications;
  $('sweep-parameter').value = state.batch.parameterKey;
  $('sweep-values').value = state.batch.parameterValues;
}

function readDraft() {
  return {
    schemaVersion: 1,
    modelId: state.config.modelId,
    seed: $('seed').value,
    arrangement: $('arrangement').value,
    family: $('family').value,
    mode: $('mode').value,
    params: Object.fromEntries(model().fields.map(field => [field.key, $(`param-${field.key}`).value])),
  };
}

function editConfiguration() {
  const hadResults = state.summary || state.batch.result || busy();
  const draft = readDraft();
  try {
    const params = {};
    for (const field of model().fields) {
      const raw = draft.params[field.key];
      if (raw.trim() === '') throw new Error(`${field.label}: enter a value in ${field.min}..${field.max} ${unitFor(field)}.`);
      params[field.key] = Number(raw);
    }
    const config = validateConfig({ ...draft, params });
    state = editSession(state, config);
  } catch (error) {
    state = editSession(state, state.config, draft, errorText(error));
  }
  terminateWorker();
  $('artifact-file').value = '';
  render();
  if (hadResults) announce('Scenario changed. Active work stopped; previous results and replay cleared. Run again to evaluate the new inputs.');
}

function renderStatus() {
  const labels = {
    ready: 'Ready · not running', running: batchTask() ? 'Comparing' : state.task === 'replay' ? 'Replaying' : 'Running',
    paused: 'Paused', complete: 'Complete', cancelled: 'Cancelled · incomplete', invalid: 'Inputs need attention', error: 'Computation error',
  };
  const runnable = supported && state.status !== 'invalid';
  set('run-status', labels[state.status] ?? state.status);
  $('run-status').dataset.state = state.status;
  const config = state.config;
  set('active-model', `${model().title} / ${config.arrangement} · ${ARRANGEMENTS[config.arrangement]}`);
  const summary = state.summary;
  const horizon = summary?.horizon ?? config.params.periods * 30;
  set('tick', number(summary?.tick ?? 0));
  set('horizon', `/ ${number(horizon)}`);
  set('period', number(summary?.period ?? 0));
  $('run-progress').max = horizon || 1;
  $('run-progress').value = summary?.tick ?? 0;
  const identity = state.status === 'invalid' ? 'invalid draft · execution blocked' : `config ${configLabel(config)}`;
  set('run-identity', `${config.modelId} · ${identity} · ${config.arrangement}/${config.family}/${config.mode} · generation ${state.generation} · run ${state.runId ?? 'none'} · engine ${ENGINE_VERSION} · build ${BUILD_ID}`);
  $('model-select').disabled = false;
  $('reset').disabled = false;
  $('run').disabled = !runnable || busy();
  $('pause').disabled = !(state.status === 'running' && !batchTask());
  $('resume').disabled = !(state.status === 'paused' && !batchTask());
  $('step').disabled = !runnable || (busy() && (state.status !== 'paused' || batchTask()));
  $('cancel').disabled = !busy();
  $('run-batch').disabled = !runnable || busy();
  $('run-sweep').disabled = !runnable || busy() || !state.batch.parameterKey;
  for (const id of ['replications', 'sweep-parameter', 'sweep-values']) $(id).disabled = busy();
  $('sim-error').hidden = !state.error;
  set('sim-error', state.error);
  $('scenario-form').setAttribute('aria-invalid', String(state.status === 'invalid'));
}

function metric(label, value, note) {
  const node = element('div');
  node.append(element('dt', label), element('dd', value));
  if (note) node.append(element('span', note, 'sim-metric-note'));
  return node;
}

function renderSnapshot() {
  const summary = state.summary;
  $('snapshot-output').hidden = !summary;
  $('results-empty').hidden = Boolean(summary);
  if (!summary) {
    set('results-empty', batchTask() && busy()
      ? 'An arrangement comparison is running. Individual trajectories are not shown as a completed comparison.'
      : 'Your results begin here. Run or step the selected scenario; no outcomes are calculated in advance.');
    $('metrics').replaceChildren();
    $('timeline-table').replaceChildren();
    $('domain-table').replaceChildren();
    clearChart();
    return;
  }
  set('institution-status', summary.institutionFailed
    ? 'Institutional failure recorded in this synthetic trajectory. This is an outcome, not a browser error.'
    : 'No institutional failure recorded at this tick. This does not establish long-run viability.');
  $('institution-status').dataset.failed = String(Boolean(summary.institutionFailed));
  $('metrics').replaceChildren(
    metric('Purchasing cost difference vs direct', money(summary.memberNetBenefitCents), 'Modeled cost; includes buyer liabilities'),
    metric('Operator cash', money(summary.operatorCashCents), 'Unrestricted balance'),
    metric('Observed quality', percent(summary.qualityRate), `${number(summary.fulfilled)} fulfilled / ${number(summary.attempted)} attempted`),
    metric('Participants / eligible', `${number(summary.participantCount)} / ${number(summary.eligibleCount)}`, 'Roles can overlap'),
    metric('Denied / unmet', `${number(summary.denied)} / ${number(summary.unmet)}`, 'Read beside purchasing cost differences'),
    metric('Commons work', number(summary.commonsWork), 'Cumulative completed work'),
  );
  $('timeline-table').replaceChildren(...(summary.timeline ?? []).map(point => row([
    number(point.tick), number(point.operatorCashCents / 100, 2),
    Number.isFinite(point.qualityRate) ? number(point.qualityRate * 100, 1) : '— (no denominator)',
    number(point.participants), number(point.commonsWork),
  ])));
  const balances = [
    ['Operator unrestricted cash', summary.operatorCashCents],
    ['Restricted commons cash', summary.commonsCashCents],
    ['Contributor agency cash', summary.agencyCashCents],
    ['Outstanding liabilities', summary.liabilityCents],
    ['Contributor payments to date', summary.contributorPaidCents],
    ['Purchasing cost difference vs direct to date', summary.memberNetBenefitCents],
  ].map(([label, value]) => row([label, number(value / 100, 2), 'USD (illustrative)']));
  const domain = (summary.domainMetrics ?? []).map(item => row([item.label, Number.isFinite(item.value) ? number(item.value, Number.isInteger(item.value) ? 0 : 4) : item.value ?? '—', item.unit ?? '']));
  $('domain-table').replaceChildren(...balances, ...domain);
  renderChart();
}

function svgElement(tag, attributes = {}, text) {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

function clearChart() {
  $('trajectory-chart').replaceChildren(
    svgElement('title', { id: 'chart-title' }, 'Trajectory chart'),
    svgElement('desc', { id: 'chart-description' }, 'No recorded trajectory. Run or step a scenario.'),
  );
  set('chart-caption', 'Only recorded observations are plotted; gaps are not interpolated.');
}

function renderChart() {
  const points = state.summary?.timeline ?? [];
  const key = state.ui.chartMetric;
  const definition = chartDefinitions[key];
  const chart = $('trajectory-chart');
  chart.replaceChildren(
    svgElement('title', { id: 'chart-title' }, `${definition.label} over synthetic ticks`),
    svgElement('desc', { id: 'chart-description' }, `${points.length} recorded observations. Values are in ${definition.unit}. The equivalent data table immediately below contains all chart data.`),
  );
  const values = points.filter(point => Number.isFinite(point[key])).map(point => point[key] * definition.scale);
  if (!values.length) {
    chart.append(svgElement('text', { x: 320, y: 112, 'text-anchor': 'middle' }, 'No observations with a valid denominator yet.'));
    set('chart-caption', `${definition.label}: no finite values yet. Missing observations are not zero.`);
    return;
  }
  let low = Math.min(0, ...values);
  let high = key === 'qualityRate' ? 100 : Math.max(0, ...values);
  if (low === high) high = low + 1;
  const lastTick = Math.max(1, ...points.map(point => point.tick));
  const x = tick => 76 + tick / lastTick * 540;
  const y = value => 184 - (value - low) / (high - low) * 152;
  const compact = value => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  for (let i = 0; i < 4; i++) {
    const value = low + (high - low) * i / 3;
    chart.append(
      svgElement('line', { x1: 76, x2: 616, y1: y(value), y2: y(value), class: 'sim-chart-grid' }),
      svgElement('text', { x: 65, y: y(value) + 4, 'text-anchor': 'end' }, compact(value)),
    );
  }
  chart.append(
    svgElement('text', { x: 14, y: 18 }, definition.unit),
    svgElement('text', { x: 76, y: 207 }, '0'),
    svgElement('text', { x: 616, y: 207, 'text-anchor': 'end' }, number(lastTick)),
    svgElement('text', { x: 346, y: 221, 'text-anchor': 'middle' }, 'Synthetic tick'),
  );
  let path = '';
  let connected = false;
  for (const point of points) {
    if (!Number.isFinite(point[key])) { connected = false; continue; }
    path += `${connected ? 'L' : 'M'}${x(point.tick).toFixed(2)},${y(point[key] * definition.scale).toFixed(2)} `;
    connected = true;
  }
  chart.append(svgElement('path', { d: path, class: 'sim-chart-line' }));
  for (const point of points) {
    if (!Number.isFinite(point[key])) continue;
    chart.append(svgElement('circle', { cx: x(point.tick), cy: y(point[key] * definition.scale), r: 2.5, class: 'sim-chart-point' }));
  }
  set('chart-caption', `${definition.label} · ${definition.unit}. Dots are recorded observations; connecting lines are visual guides, not additional simulated ticks. Missing values create gaps.`);
}

function renderEvents() {
  const events = state.summary?.events ?? [];
  const types = [...new Set(events.map(event => event.type))].sort();
  const selected = state.ui.eventFilter;
  if (selected !== 'all' && !types.includes(selected)) types.push(selected);
  const wanted = ['all', ...types];
  const current = [...$('event-filter').options].map(item => item.value);
  if (JSON.stringify(wanted) !== JSON.stringify(current)) {
    $('event-filter').replaceChildren(option('all', 'All event types'), ...types.map(type => option(type, type)));
  }
  $('event-filter').value = selected;
  const shown = events.filter(event => selected === 'all' || event.type === selected);
  $('event-table').replaceChildren(...shown.map(event => row([number(event.tick), event.type, event.message])));
  if (!shown.length) {
    const empty = element('td', events.length ? 'No recent events match this filter.' : 'No committed events yet. Run or step a scenario.');
    empty.colSpan = 3;
    const tr = element('tr');
    tr.append(empty);
    $('event-table').append(tr);
  }
  set('event-count', `${shown.length} shown / ${events.length} recent events. The worker retains at most 40; this view is not a complete audit ledger.`);
}

function renderBatchPlan() {
  const n = state.batch.replications;
  const valid = Number.isSafeInteger(n) && n >= 2 && n <= 30;
  $('replications').setAttribute('aria-invalid', String(!valid));
  set('batch-plan', valid ? `${n} replications × 4 arrangements = ${n * 4} trajectories` : 'Enter an integer from 2 to 30 replications.');
  set('sweep-plan', valid ? `3 settings × ${n} replications × 4 arrangements = ${n * 12} trajectories` : 'A valid replication count is required.');
  const field = model().fields.find(item => item.key === state.batch.parameterKey);
  set('sweep-bounds', field
    ? `${field.min}–${field.max} ${unitFor(field)}; ${field.step >= 1 ? 'integer values' : 'finite decimal values'}. Every setting must satisfy the whole scenario.`
    : 'Choose a parameter to see its units and allowed range.');
}

function renderBatch() {
  const result = state.batch.result;
  const progress = state.batch.total > 0;
  $('batch-progress-panel').hidden = !progress;
  $('batch-progress').max = state.batch.total || 1;
  $('batch-progress').value = state.batch.done;
  if (progress) set('batch-progress-text', `${state.batch.done} / ${state.batch.total} trajectories completed${state.status === 'cancelled' ? ' · cancelled; no complete comparison' : state.status === 'error' ? ' · interrupted; no complete comparison' : ''}.`);
  $('batch-empty').hidden = Boolean(result) || (batchTask() && busy());
  $('batch-output').hidden = !result;
  $('batch-output').replaceChildren();
  if (!result) return;
  $('batch-output').append(
    element('p', `${result.replications} replications per arrangement; ${result.total} complete trajectories. Lower-sample Monte Carlo contrasts are exploratory, not empirical confidence intervals.`, 'sim-help'),
    element('p', 'Positive purchasing cost differences mean lower modeled cost, not greater welfare or equivalent service. Outstanding buyer liabilities count before payment; late invoices are not savings. Read unmet demand beside each cost comparison.', 'sim-help'),
  );
  if (result.note) $('batch-output').append(element('p', result.note, 'sim-help'));
  const parameterKey = result.parameterKey ?? state.batch.parameterKey;
  const field = model().fields.find(item => item.key === parameterKey);
  for (const setting of result.settings) {
    const section = element('section', undefined, 'sim-batch-setting');
    section.append(element('h3', setting.value === null ? 'Fixed configuration · all arrangements' : `${field?.label ?? parameterKey} = ${setting.value} ${field ? unitFor(field) : ''}`));
    section.append(table('Arrangement outcomes · monetary values in illustrative USD', [
      'Arrangement', 'Runs', 'Mean purchasing cost difference vs direct (USD)', 'Mean unmet', 'Mean quality', 'Mean operator cash (USD)', 'Failure rate',
    ], setting.arrangements.map(item => [
      `${item.arrangement} · ${ARRANGEMENTS[item.arrangement]}`, number(item.runs),
      number(item.meanBenefitCents / 100, 2), number(item.meanUnmet, 1), percent(item.meanQuality),
      number(item.meanOperatorCashCents / 100, 2), percent(item.failureRate),
    ])));
    section.append(table('Paired purchasing-cost contrasts against A0 · positive means lower modeled cost', [
      'Comparison', 'Pairs', 'Mean difference (USD)', 'Monte Carlo standard error (USD)',
    ], setting.comparisons.map(item => [
      `${item.arrangement} − ${item.baseline}`, number(item.pairs),
      number(item.meanDeltaCents / 100, 2),
      Number.isFinite(item.standardErrorCents) ? number(item.standardErrorCents / 100, 2) : 'Not estimable',
    ])));
    const extra = setting.arrangements.some(item => Number.isFinite(item.meanUnmet));
    if (extra) section.append(table('Companion outcomes · read alongside cash comparisons', [
      'Arrangement', 'Quality denominators / runs', 'Mean contributor paid (USD)', 'Mean commons work',
    ], setting.arrangements.map(item => [
      item.arrangement, `${number(item.qualityRuns)} / ${number(item.runs)}`,
      Number.isFinite(item.meanContributorPaidCents) ? number(item.meanContributorPaidCents / 100, 2) : '—',
      number(item.meanCommonsWork, 1),
    ])));
    $('batch-output').append(section);
  }
}

function renderArtifacts() {
  $('save-scenario').disabled = state.status === 'invalid';
  $('save-run').disabled = !state.artifact || state.status !== 'complete';
  $('import-file').disabled = !state.ui.fileName || state.ui.fileToken !== null;
  $('replay').disabled = !supported || !state.replay.artifact || busy() || state.status === 'invalid';
  set('file-status', state.ui.fileToken !== null ? `Reading ${state.ui.fileName}…` : state.ui.fileName ? `Selected: ${state.ui.fileName}. Press Load selected file to validate it.` : 'No file selected.');
  const text = state.replay.verified
    ? 'Replay verified: regenerated final digest matches the imported completed run.'
    : state.task === 'replay' && busy()
      ? `Replay ${state.status === 'paused' ? 'paused' : 'in progress'}: tick ${number(state.summary?.tick ?? 0)} / ${number(state.summary?.horizon ?? state.config.params.periods * 30)}. Final digest not yet verified.`
      : state.task === 'replay' && ['error', 'cancelled'].includes(state.status)
        ? 'Replay is incomplete or failed. No successful digest verification is claimed.'
        : state.replay.artifact
          ? 'Completed-run file loaded. Press Replay & verify to regenerate and check it, or Run scenario to rerun its inputs separately.'
          : 'Import validates file type, version, and identity before replacing the whole scenario. Nothing executes automatically.';
  set('replay-status', text);
}

function render() {
  renderStatus();
  renderSnapshot();
  renderEvents();
  renderBatchPlan();
  renderBatch();
  renderArtifacts();
}

function workerMessage(message) {
  if (!acceptsMessage(state, message)) return;
  if (message.type === 'error') {
    reportError(`${message.message || 'The worker could not complete this computation.'} This is not a completed result.`, true);
    renderBatch();
    announce('Computation stopped with an error. Partial observations, if any, are not a completed result.');
    return;
  }
  if (message.type === 'batch-progress') {
    if (!Number.isSafeInteger(message.done) || !Number.isSafeInteger(message.total) || message.done < state.batch.done || message.done > message.total || message.total !== state.batch.total) return;
    state = updateSession(state, { batch: { ...state.batch, done: message.done } });
    renderBatch();
    return;
  }
  if (message.type === 'batch-complete') {
    state = updateSession(state, {
      status: 'complete',
      batch: { ...state.batch, done: message.result.total, total: message.result.total, result: message.result },
    });
    terminateWorker();
    render();
    announce(`Comparison complete: ${message.result.total} trajectories. Review outcomes and paired Monte Carlo contrasts below.`);
    return;
  }
  if (message.type === 'complete' && state.task === 'replay' && message.replayVerified !== true) {
    reportError('The worker did not confirm the imported final digest. Replay is not verified.', true);
    return;
  }
  state = updateSession(state, {
    summary: message.summary,
    ...(message.type === 'complete' ? {
      status: 'complete', artifact: message.artifact ?? null,
      replay: { ...state.replay, verified: state.task === 'replay' && message.replayVerified === true },
    } : {}),
  });
  if (message.type === 'complete') terminateWorker();
  renderStatus();
  renderSnapshot();
  renderEvents();
  renderArtifacts();
  if (message.type === 'complete') announce(state.replay.verified
    ? 'Replay completed and final digest verified. Results and completed-run download are available.'
    : `Trajectory completed at tick ${message.summary.tick}. Inspect quality, unmet demand, cash, and the event trail.`);
}

function launch(task = 'run', singleStep = false) {
  try {
    if (!supported) throw new Error('This browser does not support module workers. Use a current browser to run the lab.');
    validateConfig(state.config);
    let values = [];
    if (task === 'batch' || task === 'sweep') {
      const n = state.batch.replications;
      if (!Number.isSafeInteger(n) || n < 2 || n > 30) throw new Error('Use 2–30 integer replications per arrangement.');
      if (task === 'sweep') values = parseSweep(state.config, state.batch.parameterKey, state.batch.parameterValues);
    }
    const next = beginSession(state, `local-${++runSequence}`, task);
    state = updateSession(next, {
      status: singleStep ? 'paused' : 'running',
      batch: { ...next.batch, total: task === 'batch' || task === 'sweep' ? next.batch.replications * 4 * (task === 'sweep' ? 3 : 1) : 0 },
    });
    terminateWorker();
    $('artifact-file').value = '';
    const instance = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });
    worker = instance;
    const identity = { generation: state.generation, runId: state.runId, modelId: state.config.modelId };
    instance.onmessage = event => {
      if (worker !== instance) return;
      try { workerMessage(event.data); } catch (error) { reportError(error, true); }
    };
    instance.onerror = event => {
      if (worker !== instance || !acceptsMessage(state, { ...identity, type: 'error' })) return;
      event.preventDefault();
      reportError(event.message || 'The module worker could not load. Reload this published page and try again.', true);
    };
    instance.onmessageerror = () => {
      if (worker === instance) reportError('The worker returned a message that could not be read.', true);
    };
    render();
    announce(task === 'replay' ? 'Replaying imported run locally. Its digest has not been verified yet.'
      : task === 'batch' || task === 'sweep' ? `Started ${state.batch.total} trajectories. Progress appears in the comparison panel.`
        : singleStep ? 'Advancing one tick; the trajectory will remain paused.' : 'Started a fresh seeded trajectory in a local worker.');
    instance.postMessage({
      type: task === 'run' ? singleStep ? 'step' : 'start' : task === 'sweep' ? 'batch' : task,
      ...identity,
      config: state.config,
      ...(task === 'replay' ? { artifact: state.replay.artifact } : {}),
      ...(task === 'batch' || task === 'sweep' ? {
        replications: state.batch.replications,
        parameterKey: task === 'sweep' ? state.batch.parameterKey : null,
        parameterValues: values,
      } : {}),
    });
  } catch (error) {
    reportError(error, busy());
  }
}

function command(type) {
  if (!worker || batchTask()) return;
  state = updateSession(state, { status: type === 'resume' ? 'running' : 'paused', error: '' });
  worker.postMessage({ type, generation: state.generation, runId: state.runId });
  renderStatus();
  renderArtifacts();
  announce(type === 'pause' ? 'Pause requested. The next committed snapshot is retained.'
    : type === 'step' ? 'Advancing one tick; the trajectory remains paused.' : 'Resumed the same seeded trajectory.');
}

function cancel() {
  if (!busy()) return;
  state = updateSession(state, { generation: state.generation + 1, runId: null, status: 'cancelled', artifact: null });
  terminateWorker();
  render();
  announce('Job cancelled. Any partial observations are incomplete; no completed-run artifact or full comparison is available.');
}

function batchInputs() {
  if (busy()) return;
  state = updateSession(state, {
    error: state.status === 'invalid' ? state.error : '',
    batch: {
      ...state.batch, replications: $('replications').value === '' ? null : Number($('replications').value),
      parameterKey: $('sweep-parameter').value, parameterValues: $('sweep-values').value,
      done: 0, total: 0, result: null, kind: null,
    },
  });
  renderStatus();
  renderBatchPlan();
  renderBatch();
}

function download(kind) {
  try {
    const artifact = kind === 'scenario' ? exportScenario(validateConfig(state.config)) : state.artifact;
    if (!artifact || (kind === 'run' && state.status !== 'complete')) throw new Error('There is no completed run to download.');
    const blob = new Blob([JSON.stringify(artifact, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = element('a');
    link.href = url;
    link.download = `commons-${state.config.modelId}-${kind}-${configLabel(state.config)}.json`;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce(`${kind === 'scenario' ? 'Scenario' : 'Completed run'} download requested. Keep the file separately; reset does not remove downloaded records.`);
  } catch (error) { reportError(error); }
}

async function loadFile() {
  const file = $('artifact-file').files?.[0];
  if (!file) return;
  const generation = state.generation;
  const token = `file-${++fileSequence}`;
  state = updateSession(state, { ui: { ...state.ui, fileToken: token }, error: state.status === 'invalid' ? state.error : '' });
  renderStatus();
  renderArtifacts();
  try {
    if (file.size > 5_000_000) throw new Error('This file exceeds the 5 MB local import limit.');
    if (!file.name.toLowerCase().endsWith('.json')) throw new Error('Choose a .json scenario or completed-run file.');
    const text = await file.text();
    if (!acceptsImport(state, generation, token)) return;
    const imported = importArtifact(JSON.parse(text));
    if (!acceptsImport(state, generation, token)) return;
    if (!['scenario', 'run'].includes(imported.kind)) throw new Error('Unsupported artifact kind.');
    reset(imported.config.modelId, imported.config, imported.kind === 'run' ? imported.artifact : null);
    announce(`${file.name}: ${imported.kind === 'run' ? 'completed-run inputs loaded; press Replay & verify to check the saved result' : 'scenario loaded'}. Ready, not running.`);
  } catch (error) {
    if (!acceptsImport(state, generation, token)) return;
    state = updateSession(state, { ui: { ...state.ui, fileToken: null } });
    reportError(`Import rejected: ${errorText(error)} The active configuration was not replaced.`);
  }
}

$('model-select').replaceChildren(...MODELS.map(item => option(item.id, item.title)));
$('arrangement').replaceChildren(...Object.entries(ARRANGEMENTS).map(([id, title]) => option(id, `${id} · ${title}`)));
$('model-select').addEventListener('change', () => {
  try { reset($('model-select').value); } catch (error) {
    $('model-select').value = state.config.modelId;
    reportError(error);
  }
});
$('reset').addEventListener('click', () => reset());
$('scenario-form').addEventListener('submit', event => event.preventDefault());
$('scenario-form').addEventListener('input', event => {
  if (event.target.matches('input, select')) editConfiguration();
});
$('advanced-controls').addEventListener('toggle', () => {
  state = updateSession(state, { ui: { ...state.ui, advanced: $('advanced-controls').open } });
});
$('run').addEventListener('click', () => launch());
$('pause').addEventListener('click', () => command('pause'));
$('resume').addEventListener('click', () => command('resume'));
$('step').addEventListener('click', () => {
  if (state.status === 'paused' && worker && !batchTask()) command('step');
  else launch('run', true);
});
$('cancel').addEventListener('click', cancel);
$('chart-metric').addEventListener('change', () => {
  state = updateSession(state, { ui: { ...state.ui, chartMetric: $('chart-metric').value } });
  renderChart();
});
$('event-filter').addEventListener('change', () => {
  state = updateSession(state, { ui: { ...state.ui, eventFilter: $('event-filter').value } });
  renderEvents();
});
for (const id of ['replications', 'sweep-parameter', 'sweep-values']) $(id).addEventListener('input', batchInputs);
$('run-batch').addEventListener('click', () => launch('batch'));
$('run-sweep').addEventListener('click', () => launch('sweep'));
$('save-scenario').addEventListener('click', () => download('scenario'));
$('save-run').addEventListener('click', () => download('run'));
$('artifact-file').addEventListener('change', () => {
  state = updateSession(state, { ui: { ...state.ui, fileName: $('artifact-file').files?.[0]?.name ?? '', fileToken: null } });
  renderArtifacts();
});
$('import-file').addEventListener('click', loadFile);
$('replay').addEventListener('click', () => launch('replay'));
window.addEventListener('pagehide', () => {
  if (busy()) {
    state = updateSession(state, { generation: state.generation + 1, runId: null, status: 'cancelled', artifact: null });
    terminateWorker();
  }
});
window.addEventListener('pageshow', event => {
  if (event.persisted) {
    render();
    if (state.status === 'cancelled') announce('The page was restored. Background computation was cancelled when you left; run again to start a fresh trajectory.');
  }
});

renderControls();
render();
if (!supported) reportError('This browser cannot run module workers. No simulation has started. Use a current browser; scenario downloads remain available.');
announce(`${model().title} reference defaults loaded. Ready, not running. Start a trajectory or inspect the assumptions.`);

const header = document.querySelector('.site-header');
if (header && typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => document.documentElement.style.setProperty('--header-height', `${header.getBoundingClientRect().height}px`)).observe(header);
}
