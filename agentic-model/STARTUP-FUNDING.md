# AI Commons: investor-funded ramp and uses of funds

**20 September 2026 UTC. Synthetic planning study, not a funding commitment, valuation, or forecast.**

## The corrected question

An investor-backed startup is a normal case. Early losses are not evidence of
failure when planned financing covers them and a credible route to sustainable
operations exists. The useful questions are:

1. What does launch and growth cost, including staff and acquisition?
2. How much committed capital bridges the worst cash trough and a reserve?
3. At what paying-member scale do recurring economics work?
4. When do cash operations break even, and when might the business recover
   the capital it has consumed?
5. Are members receiving a lower all-in price for an equivalent service?

The new startup-finance view in the
[Simulation Lab](https://ethical-tech-colab.github.io/commons-collective/simulation/#startup-finance)
models these separately. Turning capital off retains the identical plan and
reveals its funding gap. It does **not** depict a business that somehow carried
on executing transactions with negative cash.

## Why the original operating reference failed

The supplied run was reproduced exactly: final checksum
`4248275e8c798890`. Its initial 229 paying members generated $916 in fees per
30-day period. After the 20% commons commitment, $732.80 remained against $3,500
in operator costs: a $2,767.20 period deficit. Funding stopped at tick 90, and
$3,500 in operator obligations remained unpaid.

Even all 1,000 eligible consumers paying the $4 fee would leave only $3,200 after
the covenant. Covering $3,500 required 1,094 payers, beyond that population.
Members' aggregate purchasing costs were also $2,116.80 worse than comparable
direct purchasing over the saved run.

This was useful as a deliberately unfavorable test, but not a suitable
unlabeled default launch budget. It is now identified as the **original
operating stress reference**. Extra cash alone extends its runway; it does not
repair its mature economics or member value.

The [operating controls](experiments/viability-2026-09-20/operating-controls.json)
test the original, extra-capital-only, and higher-fee-only cases against the
current individual-agent model. They are diagnostic controls, not the new
staffed startup projection.

## Two linked, distinct models

- The **operating-agent model** examines buyer/provider decisions, rights gates,
  service outcomes, and institutional arrangements.
- The **startup-finance projection** is a monthly cohort cash-flow model. It
  accepts a planned paying-member ramp and tests the funding needed to deliver
  it. It does not predict that advertising or investor money will cause that
  adoption, and it is not an execution of 150,000 individual agents.

The large-member business case is therefore a planning hypothesis requiring
market validation. Neither financial success nor a lower price establishes
privacy, equal quality, governance legitimacy, or every member's nonmonetary
welfare. The initial purchasing case assumes equivalent service at an existing
provider; it does not assume that risky migrations become flawless.

## Illustrative staffed starting plan

| Input | Planning assumption |
|---|---:|
| Initial staff | 3 people |
| Staff at scale | 10, reached in month 24 |
| Fully loaded cost per staff member | $120,000/year |
| Recruiting/equipment per new hire | $5,000 |
| External launch setup, excluding staff payroll | $100,000 |
| Paying-member target | 150,000 in month 24 |
| Ramp shape | Slower-start power curve, exponent 1.6 |
| Monthly churn requiring replacement | 1.5% |
| Service administration fee | $3/member/month |
| Commons covenant | 20% of received administration fees |
| Fixed marketing/community budget | $3,000 to $15,000/month |
| Additional acquisition cost | $15 per gross new/replacement member |
| Funded onboarding | $5 per gross new/replacement member |
| Ongoing support | $0.25/member/month |
| Travel | $1,000 to $5,000/month |
| Events | $15,000 every three months, not a smoothed cash bill |
| Technology/tooling | $2,000 to $10,000/month |
| Legal/accounting/assurance | $2,000 to $6,000/month |
| Office/insurance/admin | $1,000 to $5,000/month |
| Liquidity policy | Three months of recurring operating uses |
| Capital contingency | 15% above the deficit-plus-reserve requirement |
| Planning horizon / break-even goal | 60 months / by month 36 |

These costs are explicit assumptions, **not salary surveys, supplier quotes,
or committed budgets**. Fixed marketing covers continuing brand/community
programs; acquisition cost is additional performance/referral expenditure.
Actual budgets must remove overlap if those categories describe the same
spending. Staff payroll must not also be hidden in the one-time setup amount.

### Member protection

The provider cost-plus illustration retains the operating study's $20 retail
comparison, $14 per-member provider cost, $200 pooled setup, and 15% markup.
The finance view admits a paid launch only when:

- The planned cohort reaches the minimum launch size, initially 600.
- The comparable AI service plus the institution's fee is at least $0.50/month
  cheaper than retail.

With the $3 fee, the nominal plan's member saving is **$0.65 to $0.89/month**,
after that fee. The $2.50 alternative improves this to **$1.15 to $1.39/month**.
Both comparisons assume equivalent service, no new member-paid switching cost,
and valid provider terms. They are not evidence of actual negotiated offers.
If the price test fails, people remain outside the paid launch; the model does
not make the institution profitable by charging them a worse deal.

## Base-case result: break-even is not the same as capital recovery

Under the $3 plan:

- Six consecutive nonnegative cash-operating months begin in **month 25**.
- Mature recurring economics require about **78,919 paying members**, using
  average event cost, support, and replacement acquisition/onboarding.
- At 150,000 paying members, mature average cash surplus is **$131,500/month**;
  event-month cash surplus is lower because events are paid in lumps.
- Cumulative cash flow recovers launch/growth spending in **month 44**.
- Cash could cover the original invested principal while retaining the modeled
  reserve in **month 49**, assuming no other distributions or financing costs.

The latter is **not an investor return calculation**. Taxes, debt service,
required return, dilution, legal distribution rights, and time value of money
are not modeled.

### Uses of funds through cash break-even, month 25

| Use | Approximate amount |
|---|---:|
| Staff payroll and hiring/equipment | $1.60m |
| Gross acquisition and funded onboarding | $3.44m |
| Fixed marketing/community programs | $0.231m |
| Variable member support | $0.403m |
| Travel and events | $0.197m |
| Technology/tooling | $0.154m |
| Legal/accounting plus office/insurance/admin | $0.179m |
| External launch setup | $0.100m |
| Commons transfers financed from fees | $0.966m |
| **Total uses** | **$7.27m** |
| **Gross administration fees received** | **$4.83m** |
| **Net financing consumed by month 25** | **$2.44m** |

Amounts are rounded. This is **not** a request for $7.27m of initial equity:
fees finance much of the spending. Provider subscription pass-through is not
booked as institution revenue. Commons transfers are separately identified and
cannot be spent on payroll.

### Capital sizing

The conservative timing convention pays operating costs before the period's
fees arrive. The largest pre-receipt cash gap, rather than the ending balance,
determines runway.

| Component | Base case |
|---|---:|
| Peak cash deficit before reserve | $2.93m |
| Incremental requirement for rolling reserve | $0.68m |
| 15% contingency above deficit plus reserve | $0.54m |
| **Base capital requirement** | **$4.15m** |

A committed funding envelope can be drawn in milestone-based tranches in
practice, but this initial model treats the selected amount as available from
launch. It does not simulate conditional funding promises or lender refusal.

## Monte Carlo: conditional ranges, not a promise

The design study ran **10,000 trials across ten profiles**. Two selected
profiles then received **2,000 trials each under an independent seed**.

Declared uncertainty:

- Target member scale: symmetric triangular range of -25% to +25%.
- Correlated staff/operating/acquisition cost factor: triangular -15% to +15%.
- Churn-rate factor: triangular -30% to +30%.
- Additional launch delay: uniform integer 0-6 months.

These are transparent stress assumptions, not estimated population
distributions. The success condition requires adequate capital including
reserve/contingency, cash break-even by the selected target, nonnegative cash
operations in the final six months, and the member-price floor.

| Held-out profile | Selected capital | Median required capital | 95th-percentile requirement | Trials meeting joint conditions |
|---|---:|---:|---:|---:|
| $3 fee, balanced illustration | $6.0m | $4.64m | $5.68m | 1,963 / 2,000 |
| $2.50 fee, more member price benefit | $6.5m | $5.24m | $6.31m | 1,924 / 2,000 |

The held-out median cash break-even was month 28 and the 95th percentile was
month 31, among trials reaching break-even. The $2.50 profile had 17 trials
that did not reach cash break-even within the 60-month horizon. Neither share
is a real-world probability that a business or investment will succeed.

### Sensitivities that matter

- A 36-month member ramp moves the nominal cash break-even to month 37.
- Raising acquisition cost from $15 to $30 per gross member raises the
  design-sample 95th-percentile capital requirement to about **$9.15m**.
- Reducing acquisition cost to $8 lowers that requirement to about **$4.15m**.
- Raising loaded staff cost to $150,000/year increases it to about **$6.38m**.
- Raising provider cost enough to eliminate the member saving blocks the paid
  launch. More capital does not fix an uncompetitive member offer.
- Keeping only 1,000 paying members cannot support this 3-to-10-person
  organization on the modeled small membership fee.

The practical choice is therefore not simply "raise the fee." It is to test
the acquisition channel, all-in staffing/service costs, provider offer, and
credible member scale. If tens of thousands of paying members are implausible,
the institution needs a different cost/revenue structure, such as separately
validated institutional service contracts, rather than permanent investor
support disguised as break-even.

## Reproduction and scope

- Model: [startup.mjs](../simulation/startup.mjs).
- Financial invariants: [startup-finance.test.mjs](../test/startup-finance.test.mjs).
- Reproduce the design/holdout study with `node scripts\analyze-startup.mjs`.
- [Design results](experiments/viability-2026-09-20/startup-design-results.json).
- [Independent holdout results](experiments/viability-2026-09-20/startup-holdout-results.json).
- [Funded plan](experiments/viability-2026-09-20/funded-startup-plan.json).
- [Same plan without capital](experiments/viability-2026-09-20/no-capital-startup-plan.json).
- [Lower-fee member-value alternative](experiments/viability-2026-09-20/member-value-first-plan.json).

The original uploaded files were read, not changed. This study does not amend
the separate philanthropic funding proposal, claim an investment commitment,
or establish real provider terms. Finance plans have their own versioned
format and do not masquerade as completed operating-agent runs. Existing
operating replay identities are preserved.
