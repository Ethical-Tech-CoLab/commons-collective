import { moneyRequestFromFile, validateMoneyRequest, takeMoneyRequest, sendMoneyRequest } from './money-request.mjs';
import { renderMoneyHTML } from './money-render.mjs';

export function initMoneyView(root) {
  if (!root) throw new Error('Money-view mount is missing.');
  const $ = id => root.querySelector(`#money-${id}`);
  let generation = 0, worker = null, request = null;
  function invalidate() {
    generation++;
    worker?.terminate();
    worker = null;
    request = null;
    $('output').replaceChildren();
    $('status').textContent = 'Loading a source; no verified financial figures are displayed yet.';
    $('error').hidden = true;
    $('edit').disabled = true;
    $('download').disabled = true;
  }
  function fail(error) {
    worker?.terminate(); worker = null;
    request = null;
    $('edit').disabled = true;
    $('download').disabled = true;
    $('output').replaceChildren();
    $('error').textContent = error instanceof Error ? error.message : String(error);
    $('error').hidden = false;
    $('status').textContent = 'No verified financial rollup is displayed for this request.';
  }
  function load(input, shared = false) {
    invalidate();
    try {
      request = validateMoneyRequest(input);
      const token = generation;
      $('preset').value = shared ? 'shared' : $('preset').value;
      $('through').max = request.kind === 'startup' ? request.config.params.horizon : request.artifact.config.params.periods;
      $('through').value = request.through;
      $('status').textContent = request.kind === 'startup' ? 'Recalculating the selected Lab projection.' : 'Replaying and checking the source run before inspecting its ledger.';
      const current = new Worker(new URL('./money-worker.mjs', import.meta.url), { type: 'module' });
      worker = current;
      current.onmessage = event => {
        if (worker !== current || generation !== token || event.data?.generation !== token) return;
        const message = event.data;
        if (message.type === 'progress') $('status').textContent = `${message.stage}: tick ${message.tick} / ${message.horizon}.`;
        else if (message.type === 'error') fail(new Error(message.message));
        else if (message.type === 'complete') {
          try {
            $('output').innerHTML = renderMoneyHTML(message.rollup);
            $('status').textContent = 'Rollup reconciled exactly to the selected Lab source. Every account difference is $0.00.';
            $('edit').disabled = false;
            $('download').disabled = false;
            current.terminate(); worker = null;
          } catch (error) { fail(error); }
        } else fail(new Error('Unexpected financial-view worker response.'));
      };
      current.onerror = event => { if (worker === current) fail(new Error(event.message || 'Could not load the financial-view worker.')); };
      current.postMessage({ generation: token, request });
    } catch (error) { fail(error); }
  }
  async function preset() {
    invalidate();
    const token = generation;
    const urls = {
      default: root.dataset.reference,
      'member-value-first': './study-data/member-value-first-plan.json',
      'no-capital': './study-data/no-capital-startup-plan.json',
    };
    try {
      const url = urls[$('preset').value];
      if (!url) throw new Error('Choose a published source or import a Lab artifact.');
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Source download failed: HTTP ${response.status}.`);
      const value = await response.json();
      if (token !== generation) return;
      load(moneyRequestFromFile(value));
    } catch (error) { if (token === generation) fail(error); }
  }
  $('preset').addEventListener('change', preset);
  $('apply').addEventListener('click', () => {
    if (!request) { fail(new Error('Load a financial source first.')); return; }
    if (!$('through').value.trim()) { fail(new Error('Select a cumulative window first.')); return; }
    load({ ...request, through: Number($('through').value) }, $('preset').value === 'shared');
  });
  $('reset').addEventListener('click', () => { $('preset').value = 'default'; preset(); });
  $('edit').addEventListener('click', () => {
    try { sendMoneyRequest(request, './simulation/' + (request.kind === 'startup' ? '#startup-finance' : '#scenario-heading')); }
    catch (error) { fail(new Error(`Local sharing failed: ${error.message} Download the request and import its source instead.`)); }
  });
  $('download').addEventListener('click', () => {
    try {
      const blob = new Blob([JSON.stringify(validateMoneyRequest(request), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `commons-money-${request.kind}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { fail(error); }
  });
  $('file').addEventListener('change', async () => {
    const file = $('file').files?.[0]; $('file').value = '';
    if (!file) return;
    invalidate(); const token = generation;
    try {
      if (file.size > 5_000_000) throw new Error('The financial source exceeds 5 MB.');
      const value = JSON.parse(await file.text());
      if (token !== generation) return;
      load(moneyRequestFromFile(value), true);
    } catch (error) { if (token === generation) fail(error); }
  });
  window.addEventListener('pagehide', () => {
    if (worker) {
      generation++; worker.terminate(); worker = null;
      $('status').textContent = 'Verification was canceled when leaving the page. Update the window or reload a source to verify it again.';
    }
  });
  try {
    const shared = takeMoneyRequest();
    if (shared) load(shared, true);
    else preset();
  } catch (error) { invalidate(); fail(error); }
}
