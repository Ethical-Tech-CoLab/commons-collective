export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}
export function hash(text) {
  let a = 2166136261, b = 2246822507;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b ^ text.charCodeAt(i), 3266489909);
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}
// Counter-keyed xoshiro128**: four mixed seed words and four warm-up steps.
// A draw never depends on another actor's call count. Not a security PRNG.
export function random(seed, key) {
  let a = 2166136261, b = 2246822507, c = 3266489909, d = 668265263;
  const text = `${seed}|${key}`;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 16777619);
    b = Math.imul(b ^ code, 3266489909);
    c = Math.imul(c ^ code, 668265263);
    d = Math.imul(d ^ code, 374761393);
  }
  if (!(a | b | c | d)) d = 1;
  let output = 0;
  for (let round = 0; round < 4; round++) {
    const timesFive = Math.imul(b, 5);
    output = Math.imul((timesFive << 7) | (timesFive >>> 25), 9);
    const shifted = b << 9;
    c ^= a; d ^= b; b ^= c; a ^= d; c ^= shifted;
    d = (d << 11) | (d >>> 21);
  }
  return (output >>> 0) / 4294967296;
}
export function chance(config, key, probability) {
  return random(`${config.modelId}|${config.seed}`, key) < probability;
}
export function quote(quantity, setup, variable, markup) {
  if (!quantity) return 0;
  const numerator = (setup + quantity * variable) * (10000 + markup);
  if (!Number.isSafeInteger(numerator)) throw new RangeError('Quote exceeds exact monetary arithmetic limits.');
  return Math.ceil(numerator / 10000);
}
export function fraction(numerator, denominator) {
  return denominator ? numerator / denominator : null;
}
export function logistic(value) {
  return value >= 0 ? 1 / (1 + Math.exp(-value)) : Math.exp(value) / (1 + Math.exp(value));
}
export function quality(base, effect) {
  return base === 0 || base === 1 ? base : logistic(Math.log(base / (1 - base)) + effect);
}
export function splitCents(total, count, index) {
  return Math.floor(total / count) + (index < total % count ? 1 : 0);
}
