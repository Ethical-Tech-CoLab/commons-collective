const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const usd = value => value === null ? 'Not modeled / no applicable value' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100);
export function renderMoneyHTML(rollup) {
  if (rollup.format !== 'ccsl-money-rollup' || rollup.version !== 1 || !rollup.accounts?.length) throw new Error('Invalid financial rollup.');
  const tables = rollup.accounts.map(account => {
    if (account.reconciliationCents !== 0 || account.openingCents + account.inflowsCents - account.outflowsCents !== account.closingCents) throw new Error('Do not display an unreconciled account.');
    const rows = [
      ['Opening balance for this cumulative view', account.openingCents, 'opening'],
      ...account.sources.map(line => [`Source: ${line.name}`, line.cents, line.classification]),
      ['Total sources', account.inflowsCents, 'total'],
      ...account.uses.map(line => [`Use: ${line.name}`, line.cents, line.classification]),
      ['Total uses', account.outflowsCents, 'total'],
      ['Closing cash / projected position', account.closingCents, 'total'],
      ['Unpaid obligations, not additional paid uses', account.obligationsCents, 'liability'],
      ['Overdue portion of those obligations', account.overdueCents, 'liability'],
      ['Unreceived amounts owed to this account', account.receivablesCents, 'receivable'],
      ['Reconciliation difference (must be zero)', account.reconciliationCents, 'check'],
    ];
    return `<section class="money-account"><h3>${escape(account.name)}</h3>
      <p class="money-equation">${escape(usd(account.openingCents))} opening + ${escape(usd(account.inflowsCents))} sources - ${escape(usd(account.outflowsCents))} uses = <strong>${escape(usd(account.closingCents))}</strong></p>
      <div class="table-wrap" tabindex="0" role="region" aria-label="${escape(account.name)} financial data"><table>
      <caption>${escape(rollup.source.label)}. USD; figures derive from the selected source.</caption>
      <thead><tr><th scope="col">Flow / balance</th><th scope="col">Amount</th><th scope="col">Treatment</th></tr></thead>
      <tbody>${rows.map(([label, value, kind]) => `<tr data-money-kind="${escape(kind)}"><th scope="row">${escape(label)}</th><td>${escape(usd(value))}</td><td>${escape(kind)}</td></tr>`).join('')}</tbody></table></div></section>`;
  }).join('');
  const group = rollup.consolidation ? `<p class="money-check">Combined operator, commons and agency cash: ${escape(usd(rollup.consolidation.externalInCents))} external inflows - ${escape(usd(rollup.consolidation.externalOutCents))} external outflows = ${escape(usd(rollup.consolidation.closingCents))}. Internal transfers of ${escape(usd(rollup.consolidation.internalTransfersEliminatedCents))} are eliminated, not counted as new receipts.</p>` : '';
  const operator = rollup.accounts[0];
  const highlights = [
    ['Sources, including financing', operator.inflowsCents],
    ['Uses, including commons transfers', operator.outflowsCents],
    ['Closing operator cash / projected position', operator.closingCents],
    ['Financing included in sources, not revenue', operator.sources.filter(line => line.classification === 'financing').reduce((sum, line) => sum + line.cents, 0)],
    ['Received / projected service-fee revenue', operator.sources.filter(line => line.classification === 'earned-revenue').reduce((sum, line) => sum + line.cents, 0)],
    ['Unpaid operator obligations', operator.obligationsCents],
  ];
  return `<p class="money-source"><strong>${escape(rollup.source.label)}</strong><br>${escape(rollup.source.status)}<br>Source identity: <code>${escape(rollup.source.identity)}</code></p>
    <dl class="money-overview">${highlights.map(([name, cents]) => `<div><dt>${escape(name)}</dt><dd${cents !== null && cents < 0 ? ' data-negative="true"' : ''}>${escape(usd(cents))}</dd></div>`).join('')}</dl>
    <p class="money-equation"><strong>${escape(usd(operator.inflowsCents))} sources - ${escape(usd(operator.outflowsCents))} uses = ${escape(usd(operator.closingCents))}</strong>. Reconciliation difference: $0.00.</p>
    <p>${escape(rollup.policy)}</p><details class="money-details"><summary>Inspect the reconciled accounts, transfers and liabilities</summary>${tables}${group}</details>
    <dl class="money-indicators">${rollup.indicators.map(item => `<div><dt>${escape(item.label)}</dt><dd>${escape(usd(item.cents))}</dd></div>`).join('')}</dl>
    <ul class="money-notes">${rollup.notes.map(note => `<li>${escape(note)}</li>`).join('')}</ul>`;
}
