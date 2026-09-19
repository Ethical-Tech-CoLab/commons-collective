export function createLedger() {
  return { accounts: { operator: 0, commons: 0, agency: 0, contributors: 0 }, inflows: 0, outflows: 0, payable: [], pending: [], obligationIds: {}, journal: [], totals: {} };
}
export function openAccount(ledger, id, cents = 0) {
  if (Object.hasOwn(ledger.accounts, id)) throw new Error(`Duplicate account ${id}`);
  ledger.accounts[id] = 0;
  if (cents) transfer(ledger, 'external', id, cents, 'opening-capital', 0);
}
export function transfer(ledger, from, to, cents, kind, tick) {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new RangeError('A transfer must be nonnegative integer cents.');
  if (!cents) return true;
  if (from === to) throw new Error('A transfer needs distinct accounts.');
  if (from !== 'external' && !Object.hasOwn(ledger.accounts, from)) throw new Error(`Unknown payer ${from}`);
  if (to !== 'outside' && !Object.hasOwn(ledger.accounts, to)) throw new Error(`Unknown recipient ${to}`);
  if (from === 'commons' && kind !== 'commons-maintenance') throw new Error('Restricted commons cash cannot fund this use.');
  if (from === 'agency' && kind !== 'contributor-payment') throw new Error('Agency cash is protected for contributor payments.');
  if (from !== 'external' && ledger.accounts[from] < cents) return false;
  if (from === 'external') ledger.inflows += cents;
  else ledger.accounts[from] -= cents;
  if (to === 'outside') ledger.outflows += cents;
  else ledger.accounts[to] += cents;
  ledger.totals[kind] = (ledger.totals[kind] || 0) + cents;
  ledger.journal.push([tick, from, to, cents, kind]);
  return true;
}
export function owe(ledger, id, from, to, cents, dueTick, kind) {
  if (Object.hasOwn(ledger.obligationIds, id)) throw new Error(`Duplicate obligation ${id}`);
  if (!Number.isSafeInteger(cents) || cents < 0) throw new RangeError('Invalid obligation.');
  if (cents) {
    const item = { id, from, to, cents, dueTick, kind, paid: false };
    ledger.obligationIds[id] = true;
    ledger.payable.push(item);
    ledger.pending.push(item);
  }
}
export function settle(ledger, tick) {
  const paid = [];
  for (const item of ledger.pending) {
    if (!item.paid && item.dueTick <= tick && transfer(ledger, item.from, item.to, item.cents, item.kind, tick)) {
      item.paid = true;
      paid.push(item);
    }
  }
  ledger.pending = ledger.pending.filter(item => !item.paid);
  return paid;
}
export function assertLedger(ledger) {
  for (const [id, cents] of Object.entries(ledger.accounts)) {
    if (!Number.isSafeInteger(cents) || cents < 0) throw new Error(`Invalid ${id} balance.`);
  }
  const cash = Object.values(ledger.accounts).reduce((a, b) => a + b, 0);
  if (!Number.isSafeInteger(cash) || cash !== ledger.inflows - ledger.outflows) throw new Error('Cash does not reconcile.');
  const protectedPayable = ledger.pending.filter(p => p.from === 'agency').reduce((sum, p) => sum + p.cents, 0);
  if (protectedPayable !== ledger.accounts.agency) throw new Error('Contributor cash and liabilities do not reconcile.');
}
