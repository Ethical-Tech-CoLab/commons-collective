import { createWorld, advanceWorld, summarize } from './engine.mjs';
import { projectStartup } from './startup.mjs';
import { validateMoneyRequest } from './money-request.mjs';
import { startupMoney, operatingMoney } from './money.mjs';

let generation = 0, timer = null;
onmessage = event => {
  clearTimeout(timer);
  const token = event.data?.generation;
  generation = token;
  try {
    if (!Number.isSafeInteger(token)) throw new Error('Invalid financial-view request identity.');
    const request = validateMoneyRequest(event.data.request);
    if (request.kind === 'startup') {
      postMessage({ type: 'complete', generation: token, request, rollup: startupMoney(projectStartup(request.config), request.through) });
      return;
    }
    let world = createWorld(request.artifact.config), verified = false;
    const throughTicks = request.through * 30, started = performance.now();
    const finish = () => postMessage({ type: 'complete', generation: token, request,
      rollup: operatingMoney(world, request.artifact.expectedChecksum) });
    function step() {
      if (generation !== token) return;
      try {
        if (performance.now() - started > 120000) throw new Error('Financial replay exceeded its budget. No verified rollup is available.');
        const end = verified ? throughTicks : world.horizon;
        if (world.tick < end) advanceWorld(world, Math.min(10, end - world.tick));
        postMessage({ type: 'progress', generation: token, tick: world.tick, horizon: end, stage: verified ? 'Selected ledger window' : 'Verifying the completed source run' });
        if (world.tick === end) {
          if (!verified) {
            if (summarize(world).checksum !== request.artifact.expectedChecksum) throw new Error('Source replay checksum mismatch; financial figures were not accepted.');
            verified = true;
            if (throughTicks === world.horizon) { finish(); return; }
            world = createWorld(request.artifact.config);
          } else { finish(); return; }
        }
        timer = setTimeout(step, 0);
      } catch (error) { postMessage({ type: 'error', generation: token, message: error.message }); }
    }
    step();
  } catch (error) { postMessage({ type: 'error', generation: token, message: error.message }); }
};
