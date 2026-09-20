import { hash, stableStringify } from './math.mjs';
import { summarize } from './engine.mjs';

export const MONEY_VERSION = 1;
export const STARTUP_USES = Object.freeze({
  setup: 'External launch setup', payroll: 'Staff payroll', hiring: 'Hiring and equipment',
  fixedMarketing: 'Fixed marketing and community', acquisition: 'Member acquisition',
  onboarding: 'Member onboarding', support: 'Ongoing member support', travel: 'Travel',
  events: 'Scheduled events', technology: 'Technology and tooling', legal: 'Legal, accounting and assurance',
  administration: 'Office, insurance and administration', commons: 'Transfer to the independent commons fund',
});
const labels = {
  'opening-capital': 'Opening capital, financing not revenue',
  'administration-fee': 'Received administration/service fees',
  'operator-cost': 'Paid operator costs',
  'commons-transfer': 'Transfer between operator and commons fund',
  'restricted-grant': 'Restricted external grant',
  'commons-maintenance': 'Earmarked commons maintenance payment',
  'contribution-receipt': 'Authorized contribution receipts held for contributors',
  'contributor-receipt': 'Vendor-funded work entitlements held for contributors',
  'contributor-payment': 'Disbursements to entitled contributors',
};
const integer = (value, name, signed = false) => {
  if (!Number.isSafeInteger(value) || (!signed && value < 0)) throw new Error(`Invalid money value: ${name}`);
  return value;
};
const total = lines => lines.reduce((sum, line) => integer(sum + integer(line.cents, line.id), 'sum'), 0);
function account(id, name, sources, uses, closingCents, obligationsCents = null, overdueCents = null, receivablesCents = null) {
  const inflowsCents = total(sources), outflowsCents = total(uses);
  integer(closingCents, 'closing balance', true);
  if (inflowsCents - outflowsCents !== closingCents) throw new Error(`${name} does not reconcile to its underlying model.`);
  return { id, name, openingCents: 0, sources, uses, inflowsCents, outflowsCents, closingCents,
    obligationsCents, overdueCents, receivablesCents, reconciliationCents: 0 };
}
export function startupMoney(projection, throughMonth = projection.config.params.breakEvenTarget) {
  if (projection.format !== 'ccsl-startup-projection' || projection.version !== 1) throw new Error('A generated startup projection is required.');
  const horizon = projection.config.params.horizon;
  if (!Number.isSafeInteger(throughMonth) || throughMonth < 0 || throughMonth > horizon) throw new Error('Select a cumulative month within this projection.');
  const selected = projection.rows.filter(row => row.month <= throughMonth);
  const fees = selected.reduce((sum, row) => sum + integer(row.fees, 'fees'), 0);
  const uses = Object.entries(STARTUP_USES).map(([id, name]) => ({
    id, name, cents: id === 'setup' ? projection.totals.setup : selected.reduce((sum, row) => sum + integer(row[id], id), 0),
    classification: id === 'commons' ? 'earmarked-transfer' : 'operating-use',
  }));
  const closing = throughMonth === 0 ? projection.summary.capital - projection.totals.setup : selected.at(-1).cash;
  const operator = account('operator', 'Operator, projected cash position', [
    { id: 'capital', name: 'Available investor capital, financing not revenue', cents: projection.summary.capital, classification: 'financing' },
    { id: 'fees', name: 'Projected administration/service fees', cents: fees, classification: 'earned-revenue' },
  ], uses, closing);
  const referenceBudget = throughMonth === projection.config.params.breakEvenTarget ? projection.budgetToTarget
    : throughMonth === projection.summary.operatingBreakEvenMonth ? projection.budgetToBreakEven : null;
  if (referenceBudget && (referenceBudget.totalUses !== operator.outflowsCents || referenceBudget.grossFees !== fees)) {
    throw new Error('The financial rollup differs from the Lab budget.');
  }
  for (const line of uses) if (referenceBudget && referenceBudget.uses[line.id] !== line.cents) throw new Error(`Lab use differs: ${line.id}`);
  const budget = {
    throughMonth, uses: Object.fromEntries(uses.map(line => [line.id, line.cents])), grossFees: fees,
    totalUses: operator.outflowsCents, netFundingConsumed: operator.outflowsCents - fees,
    peakCashDeficit: Math.max(projection.totals.setup, ...selected.map(row => projection.summary.capital - row.preRevenueCash)),
    note: 'Uses include fee-financed commons transfers. Investor capital bridges the net cash gap; it is not the only source paying these costs.',
  };
  if (referenceBudget && budget.peakCashDeficit !== referenceBudget.peakCashDeficit) throw new Error('Cash-timing rollup differs from the Lab projection.');
  const lastPaid = selected.findLast(row => row.members > 0);
  return {
    format: 'ccsl-money-rollup', version: MONEY_VERSION, currency: 'USD', unit: 'integer-cents',
    source: { kind: 'startup-projection', modelId: 'ai-commons', identity: projection.id, methodVersion: projection.methodVersion,
      through: throughMonth, maximum: horizon, periodUnit: 'month', label: `Startup projection, month 0 through ${throughMonth}`,
      status: projection.summary.funded ? 'Conditional projection, not executed payments' : 'Unfunded conditional plan, not executed payments' },
    accounts: [operator], budget,
    policy: `Commons allocation is ${projection.config.params.covenantBps / 100}% of administration fees, not of investor capital or provider subscriptions.`,
    indicators: [
      { label: 'Transferred to the commons in this window', cents: uses.find(line => line.id === 'commons').cents },
      { label: 'Capital needed for the full planning horizon, including reserve and contingency', cents: projection.summary.capitalRequired },
      { label: 'Last paid cohort: price after fee per member/month', cents: lastPaid?.memberPrice ?? null },
      { label: 'Last paid cohort: saving versus equivalent retail per member/month', cents: lastPaid?.memberSaving ?? null },
    ],
    notes: [
      'This is the operator perimeter. AI-provider subscription payments are not operator revenue.',
      'The forecast models transfers to an independent commons fund, not its downstream cash balance or contributor distributions.',
      'Unpaid liabilities are not modeled in this cohort cash plan. A negative projected position is a funding gap, not negative executed cash.',
      'Reserve and contingency are funding requirements, not extra uses of funds. No automatic 40/30/20/10 distribution is applied.',
    ],
  };
}
function grouped(journal, id, incoming) {
  const groups = new Map();
  for (const [, from, to, cents, kind] of journal) {
    if ((incoming ? to : from) !== id) continue;
    groups.set(kind, (groups.get(kind) || 0) + integer(cents, kind));
  }
  return [...groups].map(([kind, cents]) => ({
    id: kind, name: labels[kind] ?? `Explicit model transaction: ${kind}`, cents,
    classification: kind === 'opening-capital' ? 'financing' : kind === 'administration-fee' ? 'earned-revenue' : 'model-flow',
  }));
}
export function operatingMoney(world, verifiedFullChecksum) {
  if (!/^[a-f0-9]{16}$/.test(verifiedFullChecksum)) throw new Error('Verify the completed source run before constructing its financial rollup.');
  if (world.tick % 30 !== 0) throw new Error('Operating money views require a completed cumulative 30-day period boundary.');
  const ledger = world.ledger;
  const measured = summarize(world);
  const names = { operator: 'Operator, simulated cash', commons: 'Independent commons fund, restricted cash', agency: 'Contributor agency, safeguarded cash' };
  const accounts = Object.entries(names).map(([id, name]) => {
    const owed = ledger.pending.filter(item => item.from === id);
    return account(id, name, grouped(ledger.journal, id, true), grouped(ledger.journal, id, false),
      ledger.accounts[id], owed.reduce((sum, item) => sum + item.cents, 0),
      owed.filter(item => item.dueTick < world.tick).reduce((sum, item) => sum + item.cents, 0),
      ledger.pending.filter(item => item.to === id).reduce((sum, item) => sum + item.cents, 0));
  });
  if (accounts.find(item => item.id === 'agency').closingCents !== accounts.find(item => item.id === 'agency').obligationsCents) {
    throw new Error('Agency cash must match unpaid contributor entitlements.');
  }
  const included = new Set(Object.keys(names));
  let externalIn = 0, externalOut = 0, internalTransfers = 0;
  for (const [, from, to, cents] of ledger.journal) {
    if (included.has(from) && included.has(to)) internalTransfers += cents;
    else if (included.has(to)) externalIn += cents;
    else if (included.has(from)) externalOut += cents;
  }
  const consolidatedClosing = accounts.reduce((sum, item) => sum + item.closingCents, 0);
  if (externalIn - externalOut !== consolidatedClosing) throw new Error('Combined institutional cash does not reconcile after eliminating internal transfers.');
  return {
    format: 'ccsl-money-rollup', version: MONEY_VERSION, currency: 'USD', unit: 'integer-cents',
    source: { kind: 'operating-run', modelId: world.config.modelId, identity: verifiedFullChecksum,
      configKey: hash(stableStringify(world.config)), through: world.tick / 30, maximum: world.horizon / 30,
      periodUnit: '30-day period', label: world.tick ? `${world.config.modelId}, cumulative periods 1 through ${world.tick / 30}` : `${world.config.modelId}, initial funding before period 1`,
      status: 'Recomputed ledger window from a checksum-verified completed synthetic run' },
    accounts,
    consolidation: { externalInCents: externalIn, externalOutCents: externalOut, internalTransfersEliminatedCents: internalTransfers,
      closingCents: consolidatedClosing, reconciliationCents: 0 },
    policy: `${world.config.arrangement === 'A3' ? `This A3 run applies a ${world.config.params.covenant / 100}% commons covenant to received administration fees.` : `No A3 fee covenant is applied in this ${world.config.arrangement} run; separately modeled commons grants remain visible.`} Contribution/work receipts remain owed to contributors, not operator revenue.`,
    indicators: [
      { label: 'Buyer purchasing cost difference versus comparable direct service, including unpaid charges', cents: measured.memberNetBenefitCents },
      { label: 'Contributor payments received, including paid commons work where applicable', cents: ledger.totals['contributor-payment'] || 0 },
      { label: 'Contributor receipts less the effort modeled in this run, not complete welfare', cents: measured.contributorNetCents },
      { label: 'Operator cash less unpaid operator obligations', cents: ledger.accounts.operator - accounts[0].obligationsCents },
      { label: 'Buyer payments to providers, not operator revenue', cents: ledger.totals['service-payment'] || 0 },
      { label: 'Buyer administration fees actually paid', cents: ledger.totals['administration-fee'] || 0 },
    ],
    notes: [
      'Each account is shown separately. Internal operator/commons/agency transfers are eliminated only in the combined reconciliation.',
      'Sources include financing and earmarked receipts as labeled; they are not all earned revenue.',
      'Outstanding obligations are shown beside cash, not silently counted as paid. Only the selected cumulative ledger window is summarized.',
      'Purchasing savings do not establish equal service quality. Receipts less modeled effort are not proof of all contributor or nonmember welfare.',
      'The retired 40/30/20/10 licensing illustration is not a policy of this run. All displayed amounts come from its actual simulated journal.',
    ],
  };
}
