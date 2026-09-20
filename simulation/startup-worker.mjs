import { validateStartupConfig, projectStartup, summarizeStartupTrials } from './startup.mjs';

let generation = null, timer = null;
onmessage = event => {
  const message = event.data;
  clearTimeout(timer);
  generation = message?.generation;
  try {
    if (message?.type !== 'run' || !Number.isSafeInteger(generation)) throw new Error('Invalid finance worker request.');
    const config = validateStartupConfig(message.config);
    const count = message.trials;
    if (!Number.isSafeInteger(count) || count < 20 || count > 1000) throw new Error('Use 20-1000 finance trials.');
    const token = generation, trials = [];
    function batch() {
      if (generation !== token) return;
      try {
        for (let i = 0; i < 20 && trials.length < count; i++) {
          const result = projectStartup(config, { uncertain: true, replication: trials.length });
          trials.push({ summary: result.summary });
        }
        postMessage({ type: 'progress', generation: token, done: trials.length, total: count });
        if (trials.length === count) postMessage({ type: 'complete', generation: token, result: summarizeStartupTrials(config, trials) });
        else timer = setTimeout(batch, 0);
      } catch (error) { postMessage({ type: 'error', generation: token, message: error.message }); }
    }
    batch();
  } catch (error) { postMessage({ type: 'error', generation, message: error.message }); }
};
