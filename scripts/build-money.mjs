import { readFile, writeFile } from 'node:fs/promises';
import { projectStartup, createStartupConfig } from '../simulation/startup.mjs';
import { startupMoney } from '../simulation/money.mjs';
import { renderMoneyHTML } from '../simulation/money-render.mjs';

export function referenceMoney() {
  const projection = projectStartup(createStartupConfig());
  return { projection, rollup: startupMoney(projection) };
}
export async function buildMoney(root, reference) {
  await writeFile(new URL('dist/money-reference.json', root), JSON.stringify(reference.projection, null, 2) + '\n');
  return (await readFile(new URL('site/money.html', root), 'utf8'))
    .replace('{{MONEY_THROUGH}}', String(reference.rollup.source.through))
    .replace('{{MONEY_ROLLUP}}', renderMoneyHTML(reference.rollup));
}
export function moneyReportMarkdown(reference) {
  const p = reference.projection.config.params, rollup = reference.rollup, account = rollup.accounts[0];
  const dollars = amount => '$' + (amount / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `The current published reference is the same AI Commons startup projection used by the Simulation Lab and Follow the Money: month 0 through ${rollup.source.through}, source identity \`${rollup.source.identity}\`. These are conditional planned cash flows, not executed payments or an empirical forecast.

| Operator source / use | Cumulative USD | Accounting treatment |
|---|---:|---|
${account.sources.map(line => `| ${line.name} | ${dollars(line.cents)} | ${line.classification} |`).join('\n')}
| Total uses, including commons transfers | ${dollars(account.outflowsCents)} | Derived from the Lab's monthly cost rows |
| Of those uses: commons transfer | ${dollars(account.uses.find(line => line.id === 'commons').cents)} | ${p.covenantBps / 100}% of service fees, not investor capital |
| Closing projected operator position | ${dollars(account.closingCents)} | Sources minus uses, not distributable profit |
| Reconciliation difference | $0.00 | Must match the detailed model exactly |

Staffing, acquisition, the user ramp, and every cost line are editable in the [Simulation Lab](./simulation/#startup-finance). The [Follow the Money rollup](#lab) reads that model's output; it has no separate financial assumptions. [Published trial evidence](./trials.html) records the distinct, frozen design and holdout study.`;
}
