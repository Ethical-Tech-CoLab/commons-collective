export const ENGINE_VERSION = '0.1.0';
export const BUILD_ID = 'development';

const number = (key, label, value, min, max, step = 1, unit = '') =>
  ({ key, label, value, min, max, step, unit, kind: 'number' });

const common = [
  number('periods', 'Horizon', 36, 1, 120, 1, '30-day periods'),
  number('covenant', 'Commons covenant on administration fees', 2000, 0, 10000, 100, 'basis points'),
  number('grant', 'Restricted commons grant per period', 0, 0, 10000000, 100, 'cents'),
  number('grantPeriods', 'Grant duration', 12, 0, 120, 1, 'periods'),
  number('paymentDelay', 'Invoice payment delay', 0, 0, 180, 1, 'ticks'),
  number('mandateTicks', 'Mandate duration', 180, 1, 3600, 1, 'ticks'),
  number('withdrawTick', 'Withdraw contribution/repair authority at tick (-1 = never)', -1, -1, 3599),
  number('permissionRate', 'Share with synthetic fixture authority', 1, 0, 1, 0.05, 'fraction'),
  number('participationRate', 'Chamber participation probability', 0.7, 0, 1, 0.05),
  number('approvalRate', 'Unconflicted ballot approval probability', 0.7, 0, 1, 0.05),
  number('complaints', 'New synthetic complaints per period', 0, 0, 1000),
  number('reviewCapacity', 'Independent review capacity per period', 5, 0, 1000),
];

const ai = [
  number('consumers', 'Eligible AI consumers', 1000, 10, 10000),
  number('contributors', 'Contributor roles (overlapping consumers)', 100, 0, 10000),
  number('providers', 'AI providers', 3, 1, 20),
  number('objects', 'Knowledge-service objects', 200, 4, 10000),
  number('interest', 'Initial procurement interest', 0.6, 0, 1, 0.05),
  number('comprehension', 'Mandate comprehension probability', 0.8, 0, 1, 0.05),
  number('budget', 'Consumer budget per period', 3000, 0, 1000000, 100, 'cents'),
  number('retailPrice', 'Retail service price per consumer/period', 2000, 0, 1000000, 100, 'cents'),
  number('variableCost', 'Provider cost per consumer/period', 1400, 0, 1000000, 100, 'cents'),
  number('setupCost', 'Pooled contract setup cost', 20000, 0, 10000000, 100, 'cents'),
  number('markup', 'Provider markup', 1500, 0, 10000, 100, 'basis points'),
  number('minimumCommitment', 'Minimum pooled commitments', 50, 1, 10000),
  number('providerCapacity', 'Capacity per AI provider', 2000, 0, 20000),
  number('tasks', 'Tasks per consumer/period', 20, 0, 1000),
  number('quality', 'Baseline task success probability', 0.8, 0, 1, 0.01),
  number('minimumQuality', 'Minimum acceptable observed quality', 0.75, 0, 1, 0.01),
  number('qualityEffect', 'Maintained-data effect (log odds)', 0, -3, 3, 0.1),
  number('objectPrice', 'Contributor reservation per object/period', 1000, 0, 1000000, 100, 'cents'),
  number('effortCost', 'Contributor effort per serviced object/period', 600, 0, 1000000, 100, 'cents-equivalent'),
  number('verificationCost', 'Verification per candidate object', 200, 0, 100000, 100, 'cents'),
  number('contributionBudget', 'Provider contribution budget per period', 100000, 0, 10000000, 100, 'cents'),
  number('successValue', 'Provider value per additional successful task', 20, 0, 100000, 1, 'cents'),
  number('decay', 'Daily knowledge freshness decay', 0.005, 0, 1, 0.001),
  number('maintenanceCost', 'Commons maintenance job cost', 500, 1, 1000000, 100, 'cents'),
  number('maintenanceSuccess', 'Maintenance success probability', 0.9, 0, 1, 0.05),
  number('feeHost', 'Existing-host fee per subscribed buyer', 50, 0, 1000000, 50, 'cents'),
  number('feeA2', 'Procurement collective fee per buyer', 300, 0, 1000000, 50, 'cents'),
  number('feeA3', 'Two-sided collective fee per buyer', 400, 0, 1000000, 50, 'cents'),
  number('costHost', 'Existing-host cost per period', 40000, 0, 100000000, 1000, 'cents'),
  number('costA2', 'Procurement operator cost per period', 250000, 0, 100000000, 1000, 'cents'),
  number('costA3', 'Two-sided operator cost per period', 350000, 0, 100000000, 1000, 'cents'),
  number('openingCash', 'Opening unrestricted operator capital', 1000000, 0, 100000000, 1000, 'cents'),
  number('providerCash', 'Opening capital per provider', 5000000, 0, 100000000, 1000, 'cents'),
  number('switchingCost', 'Completed provider switch cost', 500, 0, 1000000, 100, 'cents'),
  number('switchSuccess', 'Provider activation success', 0.95, 0, 1, 0.01),
  number('switchDelay', 'Provider switch delay', 2, 0, 180, 1, 'ticks'),
  number('renewalPeriods', 'Procurement renewal interval', 3, 1, 36, 1, 'periods'),
];

const library = [
  number('buyers', 'Library buyers', 6, 1, 100),
  number('patrons', 'Synthetic adult patrons', 200, 0, 10000),
  number('maintainers', 'Maintainer roles', 20, 0, 1000),
  number('vendors', 'Service vendors', 3, 1, 20),
  number('resources', 'OER resource versions', 60, 1, 10000),
  number('tasks', 'Retrieval tasks per buyer/period', 100, 0, 10000),
  number('units', 'Maximum work units per buyer/period', 5, 0, 1000),
  number('decay', 'Daily resource defect hazard', 0.002, 0, 1, 0.001),
  number('repairSuccess', 'Repair success probability', 0.9, 0, 1, 0.05),
  number('repairDelay', 'Repair lead time', 2, 1, 360),
  number('workCapacity', 'Work capacity per maintainer/period', 3, 0, 100),
  number('accessibleShare', 'Patrons requiring accessible resources', 0.2, 0, 1, 0.05),
  number('minimumQuality', 'Minimum observed service acceptance', 0.8, 0, 1, 0.01),
  number('renewalPeriods', 'Contract renewal interval', 6, 1, 36),
  number('setupCost', 'Vendor setup cost per order', 20000, 0, 10000000, 100, 'cents'),
  number('variableCost', 'Full vendor cost per work unit', 8000, 0, 1000000, 100, 'cents'),
  number('wage', 'Contributor entitlement per completed unit', 5000, 0, 1000000, 100, 'cents'),
  number('effortCost', 'Contributor effort per work unit', 3000, 0, 1000000, 100, 'cents-equivalent'),
  number('markup', 'Vendor markup', 2000, 0, 10000, 100, 'basis points'),
  number('vendorCapacity', 'Capacity per vendor/period', 60, 0, 100000),
  number('budget', 'Buyer budget per period', 150000, 0, 10000000, 1000, 'cents'),
  number('feeHost', 'Existing-host fee per subscribed buyer', 10000, 0, 1000000, 100, 'cents'),
  number('feeA2', 'Procurement collective fee per buyer', 25000, 0, 1000000, 100, 'cents'),
  number('feeA3', 'Two-sided collective fee per buyer', 25000, 0, 1000000, 100, 'cents'),
  number('costHost', 'Existing-host cost per period', 60000, 0, 100000000, 1000, 'cents'),
  number('costA2', 'Procurement operator cost per period', 150000, 0, 100000000, 1000, 'cents'),
  number('costA3', 'Two-sided operator cost per period', 150000, 0, 100000000, 1000, 'cents'),
  number('openingCash', 'Opening unrestricted operator capital', 300000, 0, 100000000, 1000, 'cents'),
  number('providerCash', 'Opening vendor capital', 200000, 0, 100000000, 1000, 'cents'),
];

const definitions = [
  { id: 'ai-commons', title: 'AI Commons Collective', description: 'AI purchasing, scoped contributions, provider choices, and independent commons support.', fields: [...common, ...ai] },
  { id: 'library-oer', title: 'Library-led open education', description: 'A second institutional world: resource defects, accessibility, maintenance capacity, and library renewal.', fields: [...common, ...library] },
];

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export const MODELS = freeze(definitions);
export const ARRANGEMENTS = freeze({ A0: 'Independent / direct', A1: 'Existing host', A2: 'Procurement collective', A3: 'Two-sided commons collective' });
export function getModel(id) {
  const model = MODELS.find(item => item.id === id);
  if (!model) throw new RangeError(`Unknown simulation model: ${id}`);
  return model;
}
export function createConfig(modelId = 'ai-commons') {
  const model = getModel(modelId);
  return {
    schemaVersion: 1, modelId, seed: `ccsl-${modelId}-v1`,
    arrangement: 'A3', family: 'F0', mode: 'P1',
    params: Object.fromEntries(model.fields.map(field => [field.key, field.value])),
  };
}
export function validateConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new TypeError('A scenario object is required.');
  const keys = ['schemaVersion', 'modelId', 'seed', 'arrangement', 'family', 'mode', 'params'];
  if (Object.keys(config).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(config, key))) throw new TypeError('Scenario fields do not match schema version 1.');
  if (config.schemaVersion !== 1) throw new RangeError('Unsupported scenario schema version.');
  const model = getModel(config.modelId);
  if (typeof config.seed !== 'string' || !config.seed.trim() || config.seed.length > 80) throw new RangeError('Seed must be 1-80 characters.');
  if (!Object.hasOwn(ARRANGEMENTS, config.arrangement)) throw new RangeError('Unknown institutional arrangement.');
  if (!['F0', 'F1'].includes(config.family) || !['P0', 'P1'].includes(config.mode)) throw new RangeError('Only F0/F1 and P0/P1 are runnable on Pages. Replay restores an exported run; live P2 is unavailable.');
  if (!config.params || typeof config.params !== 'object' || Array.isArray(config.params)) throw new TypeError('Scenario parameters are required.');
  if (Object.keys(config.params).length !== model.fields.length) throw new RangeError('Parameters must belong exclusively to the selected model.');
  for (const field of model.fields) {
    const value = config.params[field.key];
    if (!Number.isFinite(value) || value < field.min || value > field.max || (field.step >= 1 && !Number.isSafeInteger(value))) {
      throw new RangeError(`${field.label}: expected ${field.step >= 1 ? 'an integer' : 'a finite number'} in ${field.min}..${field.max} ${field.unit}.`);
    }
  }
  if (config.modelId === 'ai-commons' && config.params.contributors > config.params.consumers) throw new RangeError('Contributor roles cannot exceed the synthetic consumer population.');
  if (config.modelId === 'library-oer' && config.params.wage > config.params.variableCost) throw new RangeError('Contributor work is part of variable cost, not an additional charge.');
  return JSON.parse(JSON.stringify(config));
}
