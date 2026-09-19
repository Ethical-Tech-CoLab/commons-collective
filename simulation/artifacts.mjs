import { ENGINE_VERSION, BUILD_ID, validateConfig } from './config.mjs';
import { summarize } from './engine.mjs';
import { hash, stableStringify } from './math.mjs';

export const ARTIFACT_LIMIT = 5_000_000;
export function exportScenario(config) {
  return { format: 'ccsl-scenario', version: 1, engineVersion: ENGINE_VERSION, config: validateConfig(config),
    notice: 'Synthetic assumptions, not an empirical dataset or a validated institution.' };
}
export function exportRun(world) {
  if (world.status !== 'complete') throw new Error('Only a completed horizon can be exported as a complete run.');
  const summary = summarize(world);
  return {
    format: 'ccsl-run', version: 1, engineVersion: ENGINE_VERSION, buildId: BUILD_ID,
    config: validateConfig(world.config), expectedChecksum: summary.checksum, summary,
    record: { plannedTicks: world.horizon, completedTicks: world.tick, eventCount: world.events.length,
      receipts: world.ledger.totals, restrictedCashCents: world.ledger.accounts.commons,
      agencyCashCents: world.ledger.accounts.agency, externalInflowsCents: world.ledger.inflows, externalOutflowsCents: world.ledger.outflows },
    replayMethod: 'Seeded kernel re-execution with final-state verification; no live LLM calls or claimed P2 recording.',
    notice: 'All populations, prices and behavioral responses are illustrative. Checksums detect accidental mismatches, not authenticity.',
  };
}
export function importArtifact(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Choose a CCSL JSON scenario or run.');
  if (JSON.stringify(value).length > ARTIFACT_LIMIT) throw new RangeError('Artifact exceeds the 5 MB import limit.');
  if (value.version !== 1 || value.engineVersion !== ENGINE_VERSION) throw new Error('Unsupported artifact/engine version; no automatic migration is available.');
  const config = validateConfig(value.config);
  if (value.format === 'ccsl-scenario') {
    if (Object.keys(value).some(key => !['format', 'version', 'engineVersion', 'config', 'notice'].includes(key))) throw new Error('Unexpected scenario artifact fields.');
    return { kind: 'scenario', config };
  }
  if (value.format !== 'ccsl-run') throw new Error('Unrecognized artifact format.');
  if (Object.keys(value).some(key => !['format', 'version', 'engineVersion', 'buildId', 'config', 'expectedChecksum', 'summary', 'record', 'replayMethod', 'notice'].includes(key))) throw new Error('Unexpected run artifact fields.');
  if (value.buildId !== BUILD_ID) throw new Error('This run uses a different engine build. Its scenario can be recreated manually, but verified replay requires the original build.');
  if (!/^[a-f0-9]{16}$/.test(value.expectedChecksum) || value.summary?.checksum !== value.expectedChecksum) throw new Error('Run checksum metadata is missing or inconsistent.');
  const summary = value.summary;
  if (summary.modelId !== config.modelId || summary.configKey !== hash(stableStringify(config))
      || summary.status !== 'complete' || summary.tick !== config.params.periods * 30 || summary.horizon !== summary.tick
      || value.record?.completedTicks !== summary.tick || value.record?.plannedTicks !== summary.tick) throw new Error('Run identity or completion metadata is inconsistent.');
  return { kind: 'run', config, artifact: JSON.parse(JSON.stringify(value)) };
}
