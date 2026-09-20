import { STARTUP_VERSION, STARTUP_FIELDS, createStartupConfig, validateStartupConfig, projectStartup } from './startup.mjs';
import { startupMoney } from './money.mjs';
import { startupMoneyRequest, sendMoneyRequest } from './money-request.mjs';

const svgNS = 'http://www.w3.org/2000/svg';
const maxPlanBytes = 1024 * 1024;
const coreKeys = new Set([
  'capitalEnabled', 'capitalUsd', 'horizon', 'breakEvenTarget',
  'targetMembers', 'rampMonths', 'feeUsd', 'monthlyChurn',
  'staffStart', 'staffTarget', 'staffRampMonths', 'annualStaffUsd',
  'marketingStartUsd', 'acquisitionUsd', 'travelStartUsd', 'eventUsd',
]);
const fieldHints = {
  capitalEnabled: 'OFF removes only the funding source. The exact same spending and member-growth assumptions remain.',
  capitalUsd: 'Manually committed amount. Never auto-filled to make the plan pass; retained but unavailable when capital is OFF.',
  breakEvenTarget: 'Keep at least six months from this target through the planning horizon.',
  targetMembers: 'Assumed paying-member scale if price-eligible; not a forecast or a consequence of funding.',
  annualStaffUsd: 'Includes salary, employer costs, and benefits. This is not take-home pay.',
  staffStart: 'Initial team must be fewer than five people.',
  feeUsd: 'Included in the member price and saving comparison; the commons share is taken from this fee.',
  monthlyChurn: 'Fraction replaced each month: 0.015 means 1.5%. Replacement acquisition is paid.',
  acquisitionUsd: 'Per acquired member, including churn replacement; separate from fixed marketing and onboarding.',
  eventUsd: 'A lumpy payment in every scheduled event month, not an averaged cash expense.',
  contingencyBps: '1,500 basis points means 15%, added after the reserve requirement.',
  covenantBps: '2,000 basis points means 20% of received service fees.',
  providerMarkupBps: '1,500 basis points means 15%.',
  minimumSavingUsd: 'Paid launch is blocked unless the all-in price leaves this saving after fees.',
};
const useLabels = {
  setup: 'External launch setup', payroll: 'Fully loaded staff payroll', hiring: 'Hiring & equipment',
  fixedMarketing: 'Fixed marketing & community', acquisition: 'Acquisition (growth + replacement)',
  onboarding: 'New-member onboarding', support: 'Ongoing member support', travel: 'Travel',
  events: 'Scheduled events', technology: 'Technology & tooling', legal: 'Legal, accounting & assurance',
  administration: 'Office, insurance & administration', commons: 'Commons share of service fees',
};
const number = (value, digits = 0) => Number.isFinite(value)
  ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : 'Not available';
const money = value => Number.isFinite(value) ? `$${number(value / 100, 2)}` : 'Not available';
const month = value => value === null ? 'Not reached in horizon' : `Month ${number(value, Number.isInteger(value) ? 0 : 1)}`;
const errorText = error => error instanceof Error ? error.message : String(error);

export function initStartupFinance(rootElement) {
  if (!rootElement) throw new Error('The startup-finance mount element is missing.');
  const doc = rootElement.ownerDocument;
  const $ = suffix => rootElement.querySelector(`#startup-${suffix}`);
  const hasWorkers = typeof Worker !== 'undefined';
  let generation = 0, worker = null, destroyed = false, activeModel = 'ai-commons';
  let config = null, projection = null, trialResult = null, trialCount = 100;
  let moneyWindowExplicit = false;
  const listeners = [], downloads = new Map();
  const on = (node, event, handler) => {
    node.addEventListener(event, handler);
    listeners.push(() => node.removeEventListener(event, handler));
  };
  const set = (suffix, text) => { $(suffix).textContent = text; };
  function element(tag, text, className) {
    const node = doc.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function terminateWorker() {
    const previous = worker;
    worker = null;
    if (previous) {
      previous.onmessage = null;
      previous.onerror = null;
      previous.onmessageerror = null;
      previous.terminate();
    }
  }
  function invalidateTrials(message = 'Not run. No Monte Carlo results for these assumptions.') {
    // Publish the barrier before terminating: even an already-queued callback must be rejected.
    generation++;
    terminateWorker();
    trialResult = null;
    $('trial-results').replaceChildren();
    $('trial-results').hidden = true;
    $('export-trials').disabled = true;
    $('cancel').disabled = true;
    $('progress').value = 0;
    set('import-status', '');
    set('trial-status', message);
  }
  function updateActions() {
    const unavailable = destroyed || activeModel !== 'ai-commons' || !projection;
    $('run').disabled = unavailable || !hasWorkers || worker !== null;
    $('cancel').disabled = worker === null;
    $('export-plan').disabled = unavailable;
    $('inspect-money').disabled = unavailable;
    $('export-trials').disabled = unavailable || trialResult === null;
  }
  function showError(error) {
    set('error', errorText(error));
    $('error').hidden = false;
  }
  function hideError() {
    $('error').hidden = true;
    set('error', '');
  }
  function createControls(defaults) {
    $('core-fields').replaceChildren();
    $('advanced-fields').replaceChildren();
    const groups = new Map();
    for (const definition of STARTUP_FIELDS) {
      const core = coreKeys.has(definition.key);
      const groupName = core && ['Member ramp', 'Member value'].includes(definition.group)
        ? 'Member ramp & price' : definition.group;
      const groupId = `${core ? 'core' : 'advanced'}:${groupName}`;
      if (!groups.has(groupId)) {
        const fieldset = element('fieldset', undefined, 'startup-control-group');
        fieldset.append(element('legend', groupName));
        const fields = element('div', undefined, 'startup-fields');
        fieldset.append(fields);
        $(core ? 'core-fields' : 'advanced-fields').append(fieldset);
        groups.set(groupId, fields);
      }
      const toggle = definition.kind === 'toggle';
      const wrap = element('div', undefined, `startup-field${toggle ? ' startup-toggle' : ''}`);
      const label = element('label', definition.label);
      const input = element('input');
      input.id = `startup-${definition.key}`;
      input.name = `startup-${definition.key}`;
      input.dataset.startupKey = definition.key;
      label.htmlFor = input.id;
      input.type = toggle ? 'checkbox' : 'number';
      if (toggle) {
        input.checked = defaults.params[definition.key] === 1;
        label.prepend(input);
        wrap.append(label);
      } else {
        input.min = definition.min;
        input.max = definition.max;
        input.step = definition.step;
        input.value = defaults.params[definition.key];
        input.required = true;
        const unit = definition.unit.replace('USD', 'USD ($)');
        label.append(element('span', unit, 'startup-field-unit'));
        wrap.append(label, input);
      }
      const range = toggle ? '' : `Range ${number(definition.min, definition.step < 1 ? 2 : 0)}–${number(definition.max)} ${definition.unit}.`;
      const hint = element('span', fieldHints[definition.key] ?? range, 'startup-field-hint');
      hint.id = `startup-hint-${definition.key}`;
      input.setAttribute('aria-describedby', hint.id);
      input.title = `${definition.label}. ${range}`;
      wrap.append(hint);
      groups.get(groupId).append(wrap);
    }
  }
  function readInputs() {
    for (const input of rootElement.querySelectorAll('input')) input.removeAttribute('aria-invalid');
    const params = {};
    for (const definition of STARTUP_FIELDS) {
      const input = $(definition.key);
      const value = definition.kind === 'toggle' ? Number(input.checked)
        : input.value.trim() === '' ? NaN : input.valueAsNumber;
      if (!Number.isFinite(value) || value < definition.min || value > definition.max
          || (definition.step >= 1 && !Number.isSafeInteger(value))) {
        input.setAttribute('aria-invalid', 'true');
        throw new Error(`${definition.label}: enter ${definition.min}–${definition.max} ${definition.unit}.`);
      }
      params[definition.key] = value;
    }
    if (!$('seed').value.trim() || $('seed').value.length > 80) {
      $('seed').setAttribute('aria-invalid', 'true');
      throw new Error('Enter a finance seed of 1–80 characters.');
    }
    const nextCount = $('trials').valueAsNumber;
    if (!Number.isSafeInteger(nextCount) || nextCount < 20 || nextCount > 1000) {
      $('trials').setAttribute('aria-invalid', 'true');
      throw new Error('Enter an integer trial count from 20 to 1,000.');
    }
    const nextConfig = validateStartupConfig({ version: 1, seed: $('seed').value, params });
    trialCount = nextCount;
    return nextConfig;
  }
  function table(caption, headings, rows, className = '') {
    const wrap = element('div', undefined, 'startup-table-scroll');
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', caption);
    const node = element('table', undefined, className);
    node.append(element('caption', caption));
    const head = element('thead'), headingRow = element('tr'), body = element('tbody');
    for (const heading of headings) {
      const th = element('th', heading);
      th.scope = 'col';
      headingRow.append(th);
    }
    head.append(headingRow);
    for (const entry of rows) {
      const cells = Array.isArray(entry) ? entry : entry.cells;
      const tr = element('tr');
      if (entry.total) tr.dataset.total = 'true';
      if (entry.unfunded) tr.dataset.unfunded = 'true';
      cells.forEach((cell, index) => {
        const td = element(index === 0 ? 'th' : 'td', String(cell));
        if (index === 0) td.scope = 'row';
        if (String(cell).startsWith('$-')) td.dataset.negative = 'true';
        tr.append(td);
      });
      body.append(tr);
    }
    node.append(head, body);
    wrap.append(node);
    return wrap;
  }
  function metric(label, value, note, tone = '') {
    const wrap = element('div', undefined, 'startup-metric');
    if (tone) wrap.dataset.tone = tone;
    wrap.append(element('dt', label));
    const dd = element('dd', value);
    if (note) dd.append(element('small', note));
    wrap.append(dd);
    return wrap;
  }
  function renderCashChart(result) {
    const { rows, summary, totals } = result;
    const points = [{ month: 0, cash: summary.capital - totals.setup, preRevenueCash: summary.capital - totals.setup }, ...rows];
    const values = points.flatMap(row => [row.cash, row.preRevenueCash]);
    const minimum = Math.min(0, ...values), maximum = Math.max(0, summary.capital, ...values);
    const span = Math.max(100, maximum - minimum);
    const low = minimum - span * .08, high = maximum + span * .08;
    const width = 880, height = 300, left = 112, right = 22, top = 25, bottom = 44;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const x = value => left + value / result.config.params.horizon * plotWidth;
    const y = value => top + (high - value) / (high - low) * plotHeight;
    function svgNode(tag, attributes = {}, text) {
      const node = doc.createElementNS(svgNS, tag);
      for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
      if (text !== undefined) node.textContent = text;
      return node;
    }
    const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-labelledby': 'startup-chart-title startup-chart-description' });
    svg.append(svgNode('title', { id: 'startup-chart-title' }, 'Planned closing cash and before-fee cash by month, in US dollars'));
    svg.append(svgNode('desc', { id: 'startup-chart-description' },
      `Conditional cohort projection. ${summary.funded ? 'Committed capital covers the modeled cash trough.' : `Unfunded plan; first shortfall ${summary.firstShortfallMonth === 0 ? 'at setup' : `in month ${summary.firstShortfallMonth}`}.`} Negative balances are funding gaps, not executed spending. Exact values are in the monthly table below.`));
    svg.append(svgNode('rect', { x: left, y: y(0), width: plotWidth, height: top + plotHeight - y(0), class: 'startup-chart-gap' }));
    const axisMoney = value => {
      const dollars = value / 100, magnitude = Math.abs(dollars);
      if (magnitude >= 1000000) return `$${number(dollars / 1000000, 1)}m`;
      if (magnitude >= 1000) return `$${number(dollars / 1000, 0)}k`;
      return `$${number(dollars)}`;
    };
    const ticks = [...new Set([minimum, (minimum + maximum) / 2, maximum, 0])].sort((a, b) => a - b);
    let lastLabelY = Infinity;
    for (const value of ticks) {
      const position = y(value);
      svg.append(svgNode('line', { x1: left, x2: width - right, y1: position, y2: position, class: value === 0 ? 'startup-chart-zero' : 'startup-chart-grid' }));
      if (Math.abs(lastLabelY - position) > 18) {
        svg.append(svgNode('text', { x: left - 10, y: position + 4, 'text-anchor': 'end' }, axisMoney(value)));
        lastLabelY = position;
      }
    }
    for (const value of [0, Math.round(result.config.params.horizon / 2), result.config.params.horizon]) {
      svg.append(svgNode('text', { x: x(value), y: height - 17, 'text-anchor': value === 0 ? 'start' : value === result.config.params.horizon ? 'end' : 'middle' }, `Month ${value}`));
    }
    for (const [key, className] of [['preRevenueCash', 'startup-chart-prefee'], ['cash', 'startup-chart-closing']]) {
      svg.append(svgNode('polyline', { points: points.map(row => `${x(row.month).toFixed(2)},${y(row[key]).toFixed(2)}`).join(' '), class: className }));
    }
    $('cash-chart').replaceChildren(svg);
  }
  function renderSources(result) {
    const target = startupMoney(result, result.config.params.breakEvenTarget).budget;
    set('target-window', `Month 0–${target.throughMonth} · USD`);
    const targetRows = [
      ['Source: available committed investor capital', money(result.summary.capital)],
      ['Source: gross membership service fees', money(target.grossFees)],
      { total: true, cells: ['Total sources through target', money(result.summary.capital + target.grossFees)] },
      ...Object.entries(useLabels).map(([key, label]) => [`Use: ${label}`, money(target.uses[key])]),
      { total: true, cells: ['Total uses through target (including fee-financed costs)', money(target.totalUses)] },
      { total: true, cells: ['Net operating funding consumed: uses minus fees', money(target.netFundingConsumed)] },
      ['Peak cash-timing bridge before fees (excludes buffers)', money(target.peakCashDeficit)],
      { total: true, cells: ['Sources minus uses: planned target balance / gap', money(result.summary.capital + target.grossFees - target.totalUses)] },
    ];
    $('sources-table').replaceChildren(table(`Primary funding budget through target month ${target.throughMonth} · USD`, ['Source / use', `Through month ${target.throughMonth}`], targetRows));
    const netDescription = target.netFundingConsumed >= 0
      ? `${money(target.netFundingConsumed)} of net operating funding is consumed by the target`
      : `fees exceed cumulative uses by ${money(-target.netFundingConsumed)} at the target; that surplus is not a promised distribution`;
    set('target-funding-note', `${target.note} Gross uses are ${money(target.totalUses)} and gross member fees are ${money(target.grossFees)}; ${netDescription}. Cash timing still requires a peak bridge of ${money(target.peakCashDeficit)} before fees arrive. The required-capital summary separately protects the full ${result.config.params.horizon}-month horizon, with reserve and contingency.`);
    const periods = [
      { label: 'Through cash break-even', budget: result.summary.operatingBreakEvenMonth === null ? null : startupMoney(result, result.summary.operatingBreakEvenMonth).budget },
      { label: 'Full horizon', budget: startupMoney(result, result.config.params.horizon).budget },
    ];
    const at = callback => periods.map(({ budget }) => budget ? callback(budget) : 'Not reached');
    const rows = [
      ['Window', ...at(budget => `Month 0–${budget.throughMonth}`)],
      ['Source: committed investor capital', ...at(() => money(result.summary.capital))],
      ['Source: membership service fees', ...at(budget => money(budget.grossFees))],
      { total: true, cells: ['Total sources', ...at(budget => money(result.summary.capital + budget.grossFees))] },
      ...Object.entries(useLabels).map(([key, label]) => [`Use: ${label}`, ...at(budget => money(budget.uses[key]))]),
      { total: true, cells: ['Total uses', ...at(budget => money(budget.totalUses))] },
      ['Net operating funding consumed: uses minus fees', ...at(budget => money(budget.netFundingConsumed))],
      ['Peak cash-timing bridge before fees (excludes buffers)', ...at(budget => money(budget.peakCashDeficit))],
      { total: true, cells: ['Sources minus uses: planned balance / gap', ...at(budget => money(result.summary.capital + budget.grossFees - budget.totalUses))] },
    ];
    $('comparison-table').replaceChildren(table('Secondary budget windows · USD; negative balances are unfunded gaps', ['Source / use', ...periods.map(item => item.label)], rows));
  }
  function renderProjection(result) {
    const { summary: s, config: { params: p }, rows } = result;
    const fundedLabel = s.funded
      ? s.meetsReserveAndContingency ? 'Committed capital covers the modeled cash trough, reserve, and contingency.' : 'Cash timing is covered, but the reserve/contingency requirement is not.'
      : `Unfunded plan: first cash shortfall ${s.firstShortfallMonth === 0 ? 'at setup (month 0)' : `in month ${s.firstShortfallMonth}`}. Later rows are hypothetical, not executed activity.`;
    set('health', `${fundedLabel} ${s.meetsBreakEvenTarget ? 'The projected break-even timing would meet the target if the plan is financed and achieved.' : 'The projected break-even timing does not meet the target under these assumptions.'}`);
    $('health').dataset.state = s.funded && s.meetsReserveAndContingency && s.meetsBreakEvenTarget && s.memberPriceProtected ? 'positive' : 'warning';
    const fundingGap = Math.max(0, s.capitalRequired - s.capital);
    $('metrics').replaceChildren(
      metric('Required startup capital', money(s.capitalRequired), `Full ${p.horizon}-month horizon: pre-fee trough + reserve + contingency`),
      metric(p.capitalEnabled ? 'Committed capital' : 'Capital OFF · available funding', money(s.capital), `${money(p.capitalUsd * 100)} commitment assumption${p.capitalEnabled ? '' : ' retained, not available'}`),
      metric('Gap to full funding requirement', money(fundingGap), s.meetsReserveAndContingency ? 'Plan plus buffers covered, conditionally' : 'Additional committed funding needed', fundingGap ? 'warning' : 'positive'),
      metric('Projected operating cash break-even', month(s.operatingBreakEvenMonth), `Target: month ${p.breakEvenTarget}; six-month cash test`, s.meetsBreakEvenTarget ? 'positive' : 'warning'),
      metric(`Month ${p.horizon} planned cash profit`, money(s.lastMonthlyProfit), `${number(s.lastMembers)} planned members · ${number(s.lastStaff)} staff`, s.lastMonthlyProfit >= 0 ? 'positive' : 'warning'),
      metric('Minimum member saving after fee', money(s.minimumMemberSaving), s.minimumMemberSaving === null ? 'No price-eligible paid cohort in this horizon' : 'Per member / month versus the individual subscription', s.memberPriceProtected ? 'positive' : 'warning'),
    );
    const lastPaid = rows.findLast(row => row.members > 0);
    set('member-note', lastPaid
      ? `Member value alongside institutional health: at the last paid cohort (month ${lastPaid.month}), the all-in price is ${money(lastPaid.memberPrice)}/month, including the ${money(p.feeUsd * 100)} service fee, versus ${money(p.retailUsd * 100)} individually. Ongoing saving after the fee: ${money(lastPaid.memberSaving)}/member/month. These are ${s.funded ? 'conditional projected' : 'hypothetical, unfunded'} savings, not observed outcomes.`
      : 'No paid cohort passes the launch-size and member-saving checks in this horizon. There is no realized or projected paid-member saving to report; staff and fixed costs still belong to the spending plan.');
    $('member-note').dataset.state = s.memberPriceProtected ? 'positive' : 'warning';
    $('requirement-table').replaceChildren(table('Funding requirement in USD', ['Capital component', 'USD'], [
      ['Cash timing: worst pre-revenue trough', money(s.capitalForNoShortfall)],
      ['Additional rolling reserve', money(s.reserveAddon)],
      ['Cash timing + reserve', money(s.capitalWithReserve)],
      ['Contingency above reserve requirement', money(s.contingency)],
      { total: true, cells: ['Total capital required', money(s.capitalRequired)] },
      ['Capital available', money(s.capital)],
      { total: true, cells: ['Uncommitted funding gap', money(fundingGap)] },
      ['Lowest planned pre-fee balance / gap', money(s.minimumPlannedCash)],
      ['Final planned balance / gap', money(s.endingCash)],
    ]));
    const definitions = [
      ['Operating cash break-even', month(s.operatingBreakEvenMonth)],
      ['Smoothed recurring run-rate break-even', month(s.runRateBreakEvenMonth)],
      ['Stable run-rate members needed', s.runRateMembersNeeded === null ? 'No finite threshold at this unit margin' : `${number(s.runRateMembersNeeded)} members (not a demand forecast)`],
      ['Cumulative operating/setup cost recovery', month(s.cumulativeBreakEvenMonth)],
      ['Potential committed-capital recovery capacity', p.capitalEnabled && s.funded ? month(s.potentialCapitalRepaymentMonth) : 'Not applicable: capital OFF or plan unfunded'],
    ];
    $('breakeven').replaceChildren(...definitions.map(([label, value]) => {
      const item = element('div');
      item.append(element('dt', label), element('dd', value));
      return item;
    }));
    renderCashChart(result);
    renderSources(result);
    const monthlyRows = [{
      unfunded: s.firstShortfallMonth === 0,
      cells: ['0 · setup', 'Not applicable', 'Not applicable', 'Not applicable', 'Not applicable', money(0), money(result.totals.setup), money(0), money(-result.totals.setup),
        money(s.capital - result.totals.setup), money(s.capital - result.totals.setup), 'Not applicable', 'Not applicable', s.firstShortfallMonth === 0 ? 'Unfunded plan' : 'Cash covered'],
    }, ...rows.map(row => ({
      unfunded: !row.financed,
      cells: [number(row.month), number(row.desiredMembers), number(row.members), number(row.acquired), number(row.staff),
        money(row.fees), money(row.operatingUses), money(row.commons), money(row.cashProfit), money(row.preRevenueCash),
        money(row.cash), money(row.memberPrice), money(row.memberSaving), row.financed ? 'Cash covered' : 'Unfunded plan'],
    }))];
    $('monthly-table').replaceChildren(table('Monthly cohort finance projection · USD · table alternative to the cash chart', [
      'Month', 'Planned cohort', 'Price-eligible members', 'Acquired incl. replacement', 'Staff', 'Service fees',
      'Operating uses / setup', 'Commons transfer', 'Net cash profit', 'Pre-fee cash / gap',
      'Closing cash / gap', 'Member all-in price', 'Member saving after fee', 'Funding status',
    ], monthlyRows, 'startup-monthly-data'));
    set('notice', result.notice);
    set('identity', `Projection ${result.id} · method ${result.methodVersion} · ${p.horizon} months · all monetary results in cents in JSON · deterministic assumptions, no Monte Carlo executed by this calculation.`);
    $('projection').hidden = false;
  }
  function recompute() {
    hideError();
    config = null;
    projection = null;
    $('projection').hidden = true;
    for (const suffix of ['metrics', 'breakeven', 'requirement-table', 'sources-table', 'comparison-table', 'monthly-table', 'cash-chart']) $(suffix).replaceChildren();
    for (const suffix of ['target-window', 'target-funding-note']) set(suffix, '');
    const capitalEnabled = $('capitalEnabled').checked;
    set('capital-note', capitalEnabled
      ? 'Capital ON: use only the manually committed amount. Compare it with the cash-timing requirement and buffers; the calculator never assumes investment causes member growth.'
      : 'Capital OFF: available investor funding is $0. The same staffing, marketing, travel, events, and member ramp remain as an unfunded plan. A negative planned balance is a funding gap, not permission to run a business with negative cash.');
    $('capital-note').dataset.state = capitalEnabled ? 'positive' : 'warning';
    try {
      config = readInputs();
      projection = projectStartup(config);
      renderProjection(projection);
      $('money-through').max = config.params.horizon;
      if (!moneyWindowExplicit) $('money-through').value = config.params.breakEvenTarget;
      $('progress').max = trialCount;
      set('status', 'Assumption-based plan recalculated. This is not an executed operating-agent simulation.');
    } catch (error) {
      config = null;
      projection = null;
      $('projection').hidden = true;
      showError(error);
      set('status', 'Invalid or unavailable plan. Previous finance outputs are cleared; correct the assumptions to calculate again.');
    }
    updateActions();
  }
  function renderTrials(result) {
    const wrap = $('trial-results');
    const share = number(result.conditionalSuccessShare * 100, 1);
    const heading = element('h4', 'Conditional trial results, not a real-world success probability');
    const metrics = element('dl', undefined, 'startup-metrics');
    metrics.append(
      metric('Trials meeting all conditions', `${share}%`, `${number(result.successful)} / ${number(result.trials)} completed trials`),
      metric('Median required capital', money(result.requiredCapital.median), 'Conditional median of specified input distributions'),
      metric('95th-percentile required capital', money(result.requiredCapital.p95), 'Not a guarantee or a confidence interval for real-world cost'),
    );
    const condition = element('p', '“All conditions” requires funded cash timing, reserve and contingency coverage, durable cash break-even by the target, and price-protected member savings. Changing any input clears these results.', 'startup-trial-caveat');
    const outcomes = table('Completed trials under declared assumptions', ['Condition', 'Trials'], [
      ['No cash-timing shortfall', `${number(result.funded)} / ${number(result.trials)}`],
      ['Meeting cash break-even target (including mature cash test)', `${number(result.meetingTarget)} / ${number(result.trials)}`],
      ['No durable cash break-even in horizon', `${number(result.neverCashBreakEven)} / ${number(result.trials)}`],
    ]);
    const percentiles = table('Required capital percentiles · USD', ['5th percentile', 'Median', '90th percentile', '95th percentile', 'Maximum sampled'], [[
      money(result.requiredCapital.p05), money(result.requiredCapital.median), money(result.requiredCapital.p90), money(result.requiredCapital.p95), money(result.requiredCapital.max),
    ]]);
    const b = result.breakEvenMonths;
    const timing = element('p', b
      ? `Cash break-even timing among only the ${number(b.count)} trials reaching it: 5th percentile ${month(b.p05).toLowerCase()}, median ${month(b.median).toLowerCase()}, 95th percentile ${month(b.p95).toLowerCase()}. The ${number(result.neverCashBreakEven)} trials that never reach it are excluded, not silently assigned a late date.`
      : 'No trial reached durable cash break-even in the horizon. There is no break-even timing distribution to report.', 'sim-help');
    wrap.replaceChildren(heading, metrics, condition, outcomes, percentiles, timing, element('p', result.notice, 'sim-help'));
    wrap.hidden = false;
  }
  function verifyTrialResult(result, count, sentConfig) {
    if (!result || result.format !== 'ccsl-startup-monte-carlo' || result.version !== 1 || result.methodVersion !== STARTUP_VERSION
        || result.trials !== count || JSON.stringify(result.config) !== JSON.stringify(sentConfig)
        || !Number.isFinite(result.conditionalSuccessShare) || result.conditionalSuccessShare !== result.successful / count
        || typeof result.notice !== 'string'
        || !['successful', 'funded', 'meetingTarget', 'neverCashBreakEven'].every(key => Number.isSafeInteger(result[key]) && result[key] >= 0 && result[key] <= count)
        || !['p05', 'median', 'p90', 'p95', 'max'].every(key => Number.isFinite(result.requiredCapital?.[key]) && result.requiredCapital[key] >= 0)
        || (result.breakEvenMonths !== null && (!result.breakEvenMonths
          || !['p05', 'median', 'p95', 'count'].every(key => Number.isFinite(result.breakEvenMonths[key]))))) {
      throw new Error('The finance worker returned an invalid or mismatched result. No trial results were accepted.');
    }
  }
  function runTrials() {
    if (destroyed || activeModel !== 'ai-commons') return;
    invalidateTrials();
    recompute();
    if (!projection || !hasWorkers) return;
    const token = generation, sentConfig = config, count = trialCount;
    hideError();
    try {
      const current = new Worker(new URL('./startup-worker.mjs', import.meta.url), { type: 'module' });
      worker = current;
      const accepts = () => !destroyed && activeModel === 'ai-commons' && generation === token && worker === current;
      const fail = error => {
        if (!accepts()) return;
        invalidateTrials('Monte Carlo failed. No partial trials are displayed as completed results.');
        showError(error);
        updateActions();
      };
      current.onmessage = event => {
        if (!accepts() || event.data?.generation !== token) return;
        const message = event.data;
        if (message.type === 'progress') {
          if (!Number.isSafeInteger(message.done) || message.done < 0 || message.done > count || message.total !== count) {
            fail(new Error('The finance worker sent invalid progress.'));
            return;
          }
          $('progress').value = message.done;
          set('trial-status', `Running finance Monte Carlo: ${number(message.done)} / ${number(count)} trials. No completed result yet.`);
        } else if (message.type === 'complete') {
          try {
            verifyTrialResult(message.result, count, sentConfig);
            trialResult = message.result;
            renderTrials(trialResult);
            terminateWorker();
            $('progress').value = count;
            set('trial-status', `${number(count)} finance trials completed under declared assumptions. Shares are not empirical success probabilities.`);
            updateActions();
          } catch (error) { fail(error); }
        } else if (message.type === 'error') {
          fail(new Error(typeof message.message === 'string' ? message.message : 'Finance worker failed.'));
        } else {
          fail(new Error('The finance worker sent an unexpected message.'));
        }
      };
      current.onerror = event => { event.preventDefault(); fail(new Error(event.message || 'Could not execute the finance worker.')); };
      current.onmessageerror = () => fail(new Error('Could not read the finance worker result.'));
      $('progress').max = count;
      set('trial-status', `Running finance Monte Carlo: 0 / ${number(count)} trials.`);
      current.postMessage({ type: 'run', generation: token, config: sentConfig, trials: count });
      updateActions();
    } catch (error) {
      invalidateTrials('Monte Carlo could not start. No completed trial results.');
      showError(error);
      updateActions();
    }
  }
  function download(value, filename) {
    hideError();
    try {
      const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
      const link = element('a');
      link.href = url;
      link.download = filename;
      link.hidden = true;
      rootElement.append(link);
      link.click();
      link.remove();
      const timer = setTimeout(() => { URL.revokeObjectURL(url); downloads.delete(url); }, 1000);
      downloads.set(url, timer);
    } catch (error) { showError(new Error(`Download failed: ${errorText(error)}`)); }
  }
  async function importPlan() {
    if (destroyed || activeModel !== 'ai-commons') return;
    const file = $('plan-file').files?.[0];
    $('plan-file').value = '';
    if (!file) return;
    invalidateTrials('Loading finance assumptions. Previous trials cleared.');
    const token = generation;
    const accepts = () => !destroyed && activeModel === 'ai-commons' && generation === token;
    hideError();
    set('import-status', `Reading ${file.name}. Current assumptions remain until validation succeeds.`);
    updateActions();
    try {
      if (file.size > maxPlanBytes) throw new Error('Finance plan exceeds the 1 MiB file limit.');
      const text = await file.text();
      if (!accepts()) return;
      let saved;
      try { saved = JSON.parse(text); }
      catch { throw new Error('The selected file is not valid JSON. Choose a downloaded finance plan.'); }
      if (saved?.format === 'ccsl-run' || saved?.format === 'ccsl-scenario') {
        throw new Error('This is an operating-agent run or scenario. Use the separate operating importer below, not the startup-finance importer.');
      }
      if (!saved || saved.format !== 'ccsl-startup-projection' || saved.version !== 1) {
        throw new Error('Choose a downloaded finance plan with format ccsl-startup-projection, version 1. Trial summaries are not plan files.');
      }
      if (saved.methodVersion !== STARTUP_VERSION) {
        throw new Error(`Unsupported finance method version. This calculator requires method ${STARTUP_VERSION}; operating replay build IDs are separate.`);
      }
      const nextConfig = validateStartupConfig(saved.config);
      // Check that this config projects safely before replacing the current controls.
      projectStartup(nextConfig);
      createControls(nextConfig);
      $('seed').value = nextConfig.seed;
      $('trials').value = '100';
      moneyWindowExplicit = false;
      $('money-through').value = nextConfig.params.breakEvenTarget;
      trialCount = 100;
      $('progress').max = 100;
      for (const details of rootElement.querySelectorAll('details')) details.open = false;
      recompute();
      if (!projection) throw new Error('The imported configuration could not be projected.');
      set('trial-status', 'Not run. Imported assumptions have not been sampled.');
      set('import-status', `Loaded ${file.name}. Configuration validated and recalculated locally; saved amounts, charts, and prior trial results were ignored. No Monte Carlo was run.`);
      set('status', 'Imported finance plan recalculated from its assumptions, not replayed from saved results.');
    } catch (error) {
      if (!accepts()) return;
      showError(error);
      set('import-status', 'Finance plan not loaded. No saved result numbers were accepted.');
      set('trial-status', 'Not run. File loading cleared prior trials.');
      updateActions();
    }
  }
  function reset(modelId = 'ai-commons', suppliedConfig = null) {
    if (destroyed) return;
    activeModel = modelId;
    invalidateTrials('Not run. No Monte Carlo results.');
    config = null;
    projection = null;
    trialCount = 100;
    moneyWindowExplicit = false;
    const defaults = suppliedConfig ? validateStartupConfig(suppliedConfig) : createStartupConfig();
    createControls(defaults);
    $('seed').value = defaults.seed;
    $('trials').value = '100';
    $('money-through').value = defaults.params.breakEvenTarget;
    $('plan-file').value = '';
    $('progress').max = 100;
    for (const details of rootElement.querySelectorAll('details')) details.open = false;
    for (const input of rootElement.querySelectorAll('input')) input.removeAttribute('aria-invalid');
    for (const suffix of ['metrics', 'breakeven', 'requirement-table', 'sources-table', 'comparison-table', 'monthly-table', 'cash-chart']) $(suffix).replaceChildren();
    for (const suffix of ['health', 'member-note', 'notice', 'identity', 'capital-note', 'status', 'target-window', 'target-funding-note']) set(suffix, '');
    hideError();
    $('projection').hidden = true;
    rootElement.hidden = modelId !== 'ai-commons';
    if (!rootElement.hidden) recompute();
    updateActions();
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    invalidateTrials();
    for (const remove of listeners) remove();
    for (const [url, timer] of downloads) { clearTimeout(timer); URL.revokeObjectURL(url); }
    downloads.clear();
    config = null;
    projection = null;
    rootElement.hidden = true;
    updateActions();
  }
  on(rootElement, 'input', event => {
    if (destroyed || activeModel !== 'ai-commons' || !event.target.matches('input') || event.target === $('plan-file') || event.target === $('money-through')) return;
    invalidateTrials('Assumptions edited. Previous trials cleared; run again when ready.');
    recompute();
  });
  on($('form'), 'submit', event => event.preventDefault());
  on($('trial-form'), 'submit', event => event.preventDefault());
  on($('run'), 'click', runTrials);
  on($('cancel'), 'click', () => {
    invalidateTrials('Cancelled. Partial trials discarded; no completed Monte Carlo results.');
    updateActions();
  });
  on($('table-link'), 'click', () => { $('monthly-details').open = true; });
  on($('export-plan'), 'click', () => {
    if (projection) download(projection, `startup-plan-${projection.id}.json`);
  });
  on($('export-trials'), 'click', () => {
    if (trialResult) download(trialResult, `startup-trials-${projection.id}-${trialResult.trials}.json`);
  });
  on($('plan-file'), 'change', importPlan);
  on($('money-through'), 'input', () => { moneyWindowExplicit = true; });
  on($('inspect-money'), 'click', () => {
    try {
      if (!projection) throw new Error('Calculate a valid finance plan before inspecting its money flows.');
      if (!$('money-through').value.trim()) throw new Error('Select a cumulative month first.');
      sendMoneyRequest(startupMoneyRequest(projection.config, Number($('money-through').value)), '../index.html#lab');
    } catch (error) { showError(error); }
  });
  $('worker-support').hidden = hasWorkers;
  reset('ai-commons');
  return { reset, destroy, cancelBackground() {
    if (worker) {
      invalidateTrials('Finance sampling was canceled when leaving the page. Run it again to obtain completed results.');
      updateActions();
    }
  }, loadConfig(value, through) {
    reset('ai-commons', value);
    if (through !== undefined) {
      moneyWindowExplicit = through !== value.params.breakEvenTarget;
      $('money-through').value = through;
    }
    set('status', 'Shared Lab assumptions restored. Financial values are recalculated, not copied from a summary.');
  } };
}
