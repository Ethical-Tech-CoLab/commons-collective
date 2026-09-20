import { STARTUP_VERSION, validateStartupConfig, projectStartup } from './startup.mjs';
import { stableStringify } from './math.mjs';
import { importArtifact, ARTIFACT_LIMIT } from './artifacts.mjs';

const prefix = 'ccsl-money-transfer:';
export function startupMoneyRequest(config, through = config.params.breakEvenTarget) {
  return validateMoneyRequest({ format: 'ccsl-money-request', version: 1, kind: 'startup', methodVersion: STARTUP_VERSION, config, through });
}
export function operatingMoneyRequest(artifact, through = artifact.config.params.periods) {
  return validateMoneyRequest({ format: 'ccsl-money-request', version: 1, kind: 'operating', artifact, through });
}
export function validateMoneyRequest(value) {
  if (!value || value.format !== 'ccsl-money-request' || value.version !== 1) throw new Error('Unsupported money-view request.');
  if (JSON.stringify(value).length > ARTIFACT_LIMIT) throw new Error('Money-view request exceeds 5 MB.');
  if (value.kind === 'startup') {
    if (Object.keys(value).some(key => !['format', 'version', 'kind', 'methodVersion', 'config', 'through'].includes(key))) throw new Error('Unknown financial-view fields.');
    if (value.methodVersion !== STARTUP_VERSION) throw new Error('Use the matching finance method version.');
    const config = validateStartupConfig(value.config);
    if (!Number.isSafeInteger(value.through) || value.through < 0 || value.through > config.params.horizon) throw new Error('Invalid cumulative projection month.');
    return { format: value.format, version: 1, kind: value.kind, methodVersion: STARTUP_VERSION, config, through: value.through };
  }
  if (value.kind === 'operating') {
    if (Object.keys(value).some(key => !['format', 'version', 'kind', 'artifact', 'through'].includes(key))) throw new Error('Unknown operating money-view fields.');
    const imported = importArtifact(value.artifact);
    if (imported.kind !== 'run') throw new Error('Choose a completed operating run, not an unexecuted scenario.');
    if (!Number.isSafeInteger(value.through) || value.through < 0 || value.through > imported.config.params.periods) throw new Error('Invalid cumulative operating period.');
    return { format: value.format, version: 1, kind: value.kind, artifact: imported.artifact, through: value.through };
  }
  throw new Error('Unknown financial source type.');
}
export function moneyRequestFromFile(value) {
  if (value?.format === 'ccsl-money-request') return validateMoneyRequest(value);
  if (value?.format === 'ccsl-startup-projection') {
    if (value.version !== 1 || value.methodVersion !== STARTUP_VERSION) throw new Error('Unsupported finance projection version.');
    const computed = projectStartup(value.config);
    if (value.factors && stableStringify(value.factors) !== stableStringify(computed.factors)) {
      throw new Error('This is a sampled projection, not the deterministic Lab plan. Use the trial-evidence page for sampled outcomes; they cannot be silently substituted with baseline inputs.');
    }
    if (value.id && value.id !== computed.id) throw new Error('Projection identity does not match its inputs.');
    return startupMoneyRequest(value.config);
  }
  if (value?.format === 'ccsl-run') return operatingMoneyRequest(value);
  throw new Error('Choose a Lab finance-plan JSON, completed operating-run JSON, or money-view request.');
}
export function sendMoneyRequest(request, destination) {
  const validated = validateMoneyRequest(request);
  const target = new URL(destination, location.href);
  if (target.origin !== location.origin) throw new Error('Money views can be shared only within this site.');
  const token = crypto.randomUUID();
  sessionStorage.setItem(prefix + token, JSON.stringify(validated));
  target.searchParams.set('money', token);
  try { location.assign(target.href); }
  catch (error) { sessionStorage.removeItem(prefix + token); throw error; }
}
export function takeMoneyRequest() {
  const url = new URL(location.href), token = url.searchParams.get('money');
  if (!token) return null;
  url.searchParams.delete('money');
  history.replaceState(null, '', url.href);
  if (!/^[a-f0-9-]{36}$/.test(token)) throw new Error('Invalid local money-view token.');
  const raw = sessionStorage.getItem(prefix + token);
  sessionStorage.removeItem(prefix + token);
  if (!raw) throw new Error('The one-time shared scenario is unavailable in this tab. Import its downloaded Lab JSON instead.');
  return validateMoneyRequest(JSON.parse(raw));
}
