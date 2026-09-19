import { createWorld, advanceWorld, summarize } from './engine.mjs';
import { createExperiment, analyzeExperiment } from './experiment.mjs';
import { exportRun, importArtifact } from './artifacts.mjs';

let world = null, identity = null, paused = true, timer = null, batch = null, replay = null, started = 0;
function clearJob() {
  clearTimeout(timer);
  timer = null; world = null; batch = null; replay = null; paused = true;
}
function send(type, data = {}) { postMessage({ ...identity, type, ...data }); }
function fail(error) {
  paused = true;
  clearTimeout(timer);
  send('error', { message: error instanceof Error ? error.message : String(error), completedTrials: batch?.outcomes.length ?? 0, plannedTrials: batch?.plan.total ?? 0 });
}
function snapshot() { send('snapshot', { summary: summarize(world) }); }
function finishTrajectory() {
  if (batch) {
    const job = batch.plan.jobs[batch.outcomes.length];
    batch.outcomes.push({ ...job, summary: summarize(world) });
    send('batch-progress', { done: batch.outcomes.length, total: batch.plan.total });
    if (batch.outcomes.length === batch.plan.total) {
      const result = analyzeExperiment(batch.plan, batch.outcomes);
      paused = true; batch = null; world = null;
      send('batch-complete', { result });
      return true;
    }
    world = createWorld(batch.plan.jobs[batch.outcomes.length].config);
    started = performance.now();
    return false;
  }
  const summary = summarize(world);
  if (replay && summary.checksum !== replay.expectedChecksum) throw new Error('Replay diverged from the recorded final state. Do not treat this result as verified.');
  paused = true;
  send('complete', { summary, artifact: exportRun(world), replayVerified: Boolean(replay) });
  return true;
}
function loop() {
  if (paused || !world) return;
  try {
    if (performance.now() - started > 120000) throw new Error('Run wall-time budget exhausted. This is an incomplete computation, not an institutional failure.');
    advanceWorld(world, 5);
    if (world.status === 'complete') {
      if (finishTrajectory()) return;
    } else if (!batch) snapshot();
    timer = setTimeout(loop, 0);
  } catch (error) { fail(error); }
}
onmessage = event => {
  const message = event.data;
  try {
    if (!message || !Number.isSafeInteger(message.generation) || typeof message.runId !== 'string') throw new Error('Invalid worker message identity.');
    if (['start', 'batch', 'replay'].includes(message.type) || (message.type === 'step' && !world)) {
      clearJob();
      identity = { generation: message.generation, runId: message.runId, modelId: message.config?.modelId ?? message.artifact?.config?.modelId ?? message.modelId };
      let config = message.config;
      if (message.type === 'replay') {
        const imported = importArtifact(message.artifact);
        if (imported.kind !== 'run') throw new Error('Replay needs a completed run artifact.');
        replay = imported.artifact;
        config = imported.config;
      }
      identity.modelId = config?.modelId;
      if (message.type === 'batch') {
        batch = { plan: createExperiment(config, message.replications, message.parameterKey ?? null, message.parameterValues ?? []), outcomes: [] };
        world = createWorld(batch.plan.jobs[0].config);
      } else world = createWorld(config);
      started = performance.now();
      if (message.type === 'step') { advanceWorld(world); snapshot(); return; }
      paused = false; loop(); return;
    }
    if (!identity || message.generation !== identity.generation || message.runId !== identity.runId) return;
    if (message.type === 'cancel') { clearJob(); return; }
    if (message.type === 'pause') { paused = true; clearTimeout(timer); if (world && !batch) snapshot(); return; }
    if (message.type === 'resume') { if (world && world.status !== 'complete') { paused = false; started = performance.now(); loop(); } return; }
    if (message.type === 'step') {
      paused = true; clearTimeout(timer);
      advanceWorld(world);
      if (world.status === 'complete') finishTrajectory();
      else if (!batch) snapshot();
      return;
    }
    throw new Error('Unknown worker command.');
  } catch (error) {
    if (!identity) identity = { generation: message?.generation, runId: message?.runId, modelId: message?.config?.modelId };
    fail(error);
  }
};
