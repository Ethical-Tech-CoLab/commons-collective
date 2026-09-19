# Commons Collective Simulation Lab: specification

- **Version/date:** 0.1 / 19 September 2026
- **Status:** target implementation contract with an initial static browser prototype; see the release scope below
- **Concept baseline:** [CONCEPT-IDEA.md](CONCEPT-IDEA.md), originally published in `cc3dc21`
- **Companion documents:** [PLAN.md](PLAN.md), [BACKLOG.md](BACKLOG.md)
- **Publication boundary:** the user authorized a separate GitHub Pages simulator; study Markdown remains repository-only
- **Evidence boundary:** all new numerical defaults below are illustrative engineering fixtures, not empirical estimates, forecasts, legal approvals, or participant endorsements.

The user's follow-on direction authorizes this specification, plan, and backlog and requires **two different simulation models** and a model-choice dropdown that resets **all simulation variables**. Subsequent clarification makes the direct **AI Commons Collective** the primary problem, not a tangential sector application. It does not authorize collecting real data, spending on model APIs, launching an institution, or claiming that either simulation has run.

### Initial browser-release scope

The subsequent request to start the build authorizes the static app at
`simulation/`. Its live parameter registry and schemas are in
[simulation/config.mjs](../simulation/config.mjs); these are authoritative for
the implemented subset. The broader requirements below remain a target, not
a claim that all features or empirical validation are complete.

The first build runs both domain models, P0/P1 decisions, protected accounting,
daily ticks, A0-A3 batches, one-dial sweeps, complete scenario resets and
same-build seeded replay. It does not call LLM APIs or replay recorded P2
conversations. Only implemented controls are exposed; no disabled research
module is presented as if it computed real results.

Implementation refinements are explicit: the schema is a validated flat
parameter registry within `config.params`; batch defaults use five repetitions
of the selected family (20 A0-A3 trajectories), not an automatic 16,000-run
study. Randomness uses a counter-keyed xoshiro128** transform initialized from
four versioned integer mixers, with no shared mutable draw counter.
State fingerprints are noncryptographic reproducibility checks, not signatures.
Build identity, scenario version, schema checks, and regenerated results are
verified on replay.

See [the plan's status](PLAN.md#browser-build-status) for remaining research and
implementation limits. Numerical results displayed by the app are simulated
observations conditional on the selected assumptions; no real population or
institution has been validated.

**MUST** denotes a release requirement; **SHOULD** denotes a documented default that can change through review. A departure from a MUST requires a specification revision, not an undocumented implementation shortcut.

## S01: Scope and required models

Two domain models MUST ship together in the first simulation-capable release:

| Stable model ID | Display name | Sector | Mechanism, not just a different parameter preset |
|---|---|---|---|
| `ai-commons` | AI Commons Collective | Consumer AI services and authorized contributions | Consumers pool AI-service demand; providers make offers and may buy authorized contributor services; scoped permissions, switching, governance, and commons funding change outcomes |
| `library-oer` | Library-led open-education collective | Open education | Relatively durable resource versions acquire defects; contracted maintenance, accessibility work, integration, procurement, and institutional renewal determine outcomes |

**`ai-commons` is the default model.** `library-oer` is a second domain validation case for the same institutional thesis, not an alternative mission. They are not iterations of model training, successive policy modes, or two unrelated research projects.

Both use the same rights/accounting/tick contracts, but they MUST have different state types, domain transition functions, variables, events, and validity tests. Renaming AI subscribers as library patrons while retaining identical service/contribution dynamics fails this requirement.

The initially considered community environmental-observation network is **deferred**. It could later test rapidly changing observations and equipment/coverage costs, drawing on research section 22, but is not a required module, dropdown choice, budget multiplier, or implementation backlog item for this release. Deferral keeps the central AI commons problem in focus.

### Four independent experiment dimensions

1. **Domain model:** `ai-commons` or `library-oer`.
2. **Institutional arrangement:** A0 individual/direct; A1 existing host; A2 pooled procurement; A3 two-sided collective with a commons covenant.
3. **Behavioral family:** F0 constrained current-offer choice; F1 constrained adaptive/aspiration choice.
4. **Policy execution mode:** P0 deterministic; P1 seeded stochastic; P2 live generative proposals; P3 recorded-action replay.

These MUST NOT be encoded as one dropdown whose choice silently upgrades the collective's model, funding, or information. The primary model dropdown selects only the domain and loads its complete reference configuration, including the explicitly displayed default values of the other dimensions.

An **AI provider in the simulated economy** is also distinct from the **LLM provider used to generate an experimental agent's actions**. The former's fictional prices, rights terms, and quality are world parameters. The latter's actual model ID, token usage, latency, and cost belong in experiment provenance. Do not infer one from the other.

The baseline implementation MUST support P0, P1, both behavioral families, all four arrangements, and replay of recorded valid actions in both domains. P2's interface and failure handling are required; actual live-model experiments are a separately gated extension. A disabled P2 control MUST state the missing adapter/authorization and MUST NOT silently run P0/P1 under a P2 label.

### Institutional comparison

| Arrangement | Contracting and governance | Cost treatment |
|---|---|---|
| A0 | Independent principals buy/authorize separately; no collective mandate | Direct counterparties incur each order's setup and operating costs; no fictional free centralized operator |
| A1 | An existing authorized host combines eligible orders under a limited delegation | Explicit host cost and fee schedule; no assumed institutional legitimacy |
| A2 | A proposed purchasing collective combines authorized demand | Explicit startup, operator, support, participation, and exit costs |
| A3 | A2 plus separately authorized contributor representation, dual-chamber protected decisions, affected-party challenge, and an independent commons fund | Explicit additional governance and covenant costs; money and authority remain separate |

Resource and rights floors MUST be visible for every arrangement. Matched equal-resource experiments are the default. Different-grant comparisons are separate treatments. Formation/operating costs need not be identical, but none may disappear from the cost denominator.

Deferred modules remain tax policy, contributor equity, workplace trusts, cross-CMO coordination, model training/RL, multi-sector federation, and data-center energy. Their concept variables MUST NOT appear as working controls in this release.

## S02: Architecture and domain-module contract

### Technology decision

Use **JavaScript ES modules with JSDoc types and strict runtime validation**, executed headlessly in Node and in a browser Web Worker. Use integer arithmetic for money and versioned numeric routines for model calculations. This follows the existing [model functions](../site/model.mjs), Node test runner, and static browser architecture without adding a framework dependency for its name alone.

The initial review UI SHOULD use the existing HTML/CSS/ES-module approach; no React, database service, agent framework, or simulation package is required merely to implement the first two models. Existing Playwright can support browser acceptance tests. New dependencies require a specific gap, license review, reproducibility justification, and manifest change; none is installed by this document.

A domain module implements this conceptual interface:

```text
ModelDefinition
  id, version, title, description, evidenceStatus
  parameterDefinitions, defaultConfig, supportedEvents, metricDefinitions
  validateConfig(config) -> issues[]
  initialize(config, randomProvider) -> domainState
  observe(actor, world, tickPhase) -> boundedObservation
  propose(actor, observation, policyContext) -> typedAction
  transition(world, validatedActions, dueEvents, tickPhase) -> events[]
  measure(world, eventJournal) -> typedMetrics
  validateState(world) -> issues[]
```

Only the kernel commits state and ledger transitions. Domain modules propose events; they MUST NOT mutate another domain, the immutable configuration, UI state, audit records, or ledger balances directly.

### Components and responsibilities

| Component | Requirement |
|---|---|
| Model registry | Exactly one versioned definition per registered ID; immutable defaults; no fallback to the library model for an unknown ID |
| Configuration validator | Reject unknown fields, wrong units/types, infeasible combinations, unresolved mandatory authority, and inconsistent clocks before a run |
| World kernel | Tick/phase progression, scheduler, state transition, rights checks, ledger posting, hashes, invariant checks |
| Policy adapters | F0/F1 and P0-P3 behavior behind the same bounded observation/action interface |
| Experiment runner | Parameter design, named random streams, paired runs, replications, run/failed-run accounting, precision rules |
| Worker/CLI transport | Cancelable jobs with model/config/run/session-generation identity on every message |
| Analysis | Domain metrics, shared outcome vector, paired differences, uncertainty, explicit denominators |
| Review UI | Configuration, tick controls, reset transaction, provenance, tables/charts, replay, export |
| Artifact store | Immutable saved configurations/results; active scenario state is not a view into a prior saved run |

Model modules may share generic queue, ledger, authorization, or aggregation helpers. They MUST NOT depend on DOM, `requestAnimationFrame`, network access, wall-clock timestamps, or `Math.random()` for world evolution.

## S03: Configuration, state, and artifact schemas

The following are required logical records. Concrete JSON schemas/validators are implementation deliverables, not existing files.

### Configuration record

| Field | Type / rule |
|---|---|
| `schemaVersion` | Positive integer; initially 1; unsupported versions reject |
| `modelId`, `modelVersion` | Registered ID and exact domain-model version |
| `arrangementId` | A0/A1/A2/A3 |
| `behaviorFamily` | F0/F1 |
| `policyAssignments` | Actor/role-to-P0/P1/P2/P3 map; no unassigned active role |
| `clock` | Tick duration, accounting duration, horizon, process cadences, boundary convention |
| `population` | Domain-specific synthetic actors and assignment rules; actor count is not empirical sample size |
| `institution` | Mandates, chamber rules, conflicts, support, remedy, and wind-down rules |
| `finance` | Currency, opening balances with sources, schedules, fees, costs, allocation bases, reserve target |
| `domain` | Exactly the selected model's schema; never a union containing inactive fields from both |
| `experiment` | Seed, PRNG/version, design/replication counts, dependence groups, arrangement/family sets, budgets and stopping rules |
| `evidence` | Parameter definitions, evidence tags, source references, and acknowledged illustrative assumptions |

Each parameter definition MUST contain `id`, type, unit, admissible domain, reference value, UI control, precision, owner/class, evidence tag, description, dependence/constraint rules, and reset policy. Every simulation parameter uses `resetPolicy: model-default`; no parameter opts out of a model switch.

Parameters are D design controls, E experiment settings, U uncertain inputs, H heterogeneous attributes, R non-compensable rules, or O derived outputs, following the concept. O values are never independently editable. Required missing values produce an issue with the field path and remedy; `null` does not silently become zero.

**Number discipline:** nonnegative integer counts, integer cents, basis points 0-10,000, and finite probabilities 0-1. Monetary sums/products MUST be checked for safe-integer overflow. Durations are positive except explicitly immediate delays; denominator-zero metrics return `null` with `reason: no-eligible-denominator`, not zero or 100%. Currency is USD for initial fixtures; no implicit exchange-rate conversion.

### Complete reference-reset profile

S06/S07 give domain values. The following shared values complete the required reference profile; implementations MUST materialize them rather than rely on hidden module globals. Code-facing field names use lower camel case inside the records above; dotted names in the domain tables identify parameter-registry entries and must have a single explicit binding to their JSON field.

| Configuration group | AI Commons default | Library default |
|---|---|---|
| Model/version | `ai-commons`, `0.1` | `library-oer`, `0.1` |
| Arrangement/family | A3 / F0 | A3 / F0 |
| Human decision mode | P1; procedural gates/accounting P0 | P1; procedural gates/accounting P0 |
| Provider offer mode | P0 reference cost rule; alternate modes explicitly assigned | P0 reference cost rule; alternate modes explicitly assigned |
| Root seed | `ccsl-ai-commons-v0.1` | `ccsl-library-oer-v0.1` |
| Clock | 1 model day/tick; 30 ticks/period; 36 periods | Same values, recreated rather than retained |
| Currency | USD, integer cents | USD, integer cents |
| Civic membership fee | 0 | 0 |
| External grants | 0; empty grant schedule | 0; empty grant schedule |
| A3 commons allocation | 2,000 bps of received administration fees | Same rule and base, freshly instantiated |
| Reserve target | 3 accounting periods of declared operator costs | Same rule, domain-specific cost base |
| Initial contributor payables / commons restricted cash | 0 / 0 | 0 / 0 |
| Ordinary quorum / approval | Strictly greater than 5,000 bps turnout / strictly greater than 5,000 bps valid unconflicted yes/no approval | Same |
| Protected-rule approval | At least two-thirds in each required chamber, plus steward concurrence | Same |
| Mandate term | 180 ticks | 180 ticks |
| Review queue | 5 cases/period; 5-tick acknowledgment; 30-tick ordinary target | Same |
| Negotiation rounds | Maximum 3; no converged funded commitment means no deal | Same |
| F1 memory update weight | 0.2 on new observed outcome | Same |
| P1 choice temperature | 1 on declared normalized decision scores | Same |
| Evaluation false-accept / false-reject probabilities | 0.02 / 0.05 per independently screened item; not applied to hard rights gates | Same |
| Evaluation sample count | Up to 20 eligible objects per scheduled evaluation, without replacement; actual sample size recorded | Same |
| Single-run UI | Ready at tick 0; no results, active run, saved comparison, or external call | Same |
| Draft batch design | 1 parameter setting, 20 repetitions, A0-A3, F0-F1; one selected domain | Same |
| Replication method | Fixed count; adaptive stopping disabled | Same |
| P2 / replay state | No approved adapter; no response cache/action recording attached | Same |
| Safety budgets | 1,000 trajectories per launch; 5,000,000 events/run; 120,000 ms wall budget/run, subject to profiling | Same |
| Export/history selection | None active; prior immutable history is not loaded | Same |

The batch defaults are **160 planned trajectories for one domain**, not an automatic launch. The larger S08 planning envelope remains separate. Both budget profiles are engineering safeguards to test, not demonstrated throughput. A review may revise these values before implementation; the resulting default bundle/version must change atomically.

Reference F0/P1 scores apply only after hard constraints: normalize full cost against the actor's positive budget (`-full_cost/budget`), with a refusal score representing its declared eligible outside option. A zero-budget actor admits only zero-cost eligible offers and uses an explicitly specified zero-cost tie rule. F1 adds a declared experience term on the same normalized scale. Candidate ordering, tie-breaking, refusal, and the score definition are recorded so temperature is interpretable; implementations cannot quietly invent new utility terms.

### World state

| Field | Required contents |
|---|---|
| Identity | Model/version, canonical config hash, logical run ID, engine/distribution versions |
| Clock | Tick, phase, accounting period, pending events and stable event-sequence counters |
| Actors | Stable synthetic ID, role assignments, lifecycle, observation memory, bounded decision state |
| Institution | Membership and mandates separately; unexpired delegations, votes, quorum, conflicts, appeals |
| Contracts | Parties, scope, authority references, price/cost components, delivery, due dates, obligations, status |
| Ledgers | Authoritative cash/accounts, receivables, payables, restrictions, external-source and internal-transfer records |
| Randomness | Namespaced stream states/counters sufficient for checkpoint replay |
| Domain | Only AI-commons state or library state |
| Metrics/journal | Counters with defined units, causal event references, run-health and invariant results |

An actor holds account references, not a second independently mutable copy of its cash balance. Actor IDs are stable across arrangements within a domain for pairing. IDs are namespaced across domains, for example `ai-commons:buyer:001` versus `library-oer:buyer:001`.

### Actions and events

Every action has `actionId`, actor/role, model/version, run/config identity, tick/phase, action type, typed payload, and observation reference. Common action types include join, leave, authorize, withdraw, offer, accept, refuse, vote, request review, and pay. Domain actions include AI-service requests, authorized knowledge-service offers, collective supplier switching, OER repairs, and accessibility evaluation.

Every event has deterministic event ID, tick/phase, type/version, causal predecessor(s), actors/objects, precondition results, state effect, ledger references if any, and evidence/source class. Invalid actions remain in a rejection journal; they never partially mutate state.

### Run artifact

A `RunReceipt` MUST bind scenario/config, model/kernel/policy/PRNG/distribution versions, named seed scheme, structural family, arrangement, planned/completed ticks, status, numeric checks, inputs/action hashes, metric definitions, errors, usage/cost metadata, and exports. Separate `completed`, `institution-failed`, `canceled`, `budget-exhausted`, `invalid-config`, and `engine-failed`.

Institutional insolvency is a valid modeled outcome. Engine failure is not. Saved/exported records MUST preserve that difference.

## S04: Time-tick, randomness, and policy contracts

### Default clocks and boundaries

- One tick = **one synthetic model day**.
- One accounting period = **30 ticks**.
- Horizon = **36 periods = 1,080 ticks**.
- Opening state is `S[0]`; transitions process ticks 0 through 1,079 and commit `S[1]` through `S[1080]`.
- Period `p` covers ticks `[30*p, 30*(p+1))`; period-start scheduling happens at its first tick; period-close reporting follows its final committed transition.
- Recurring entries have an idempotency key `(scheduleId, periodIndex)`. Initialization is not repeated every tick.
- A mandate is usable only on `[validFromTick, expiresAtTick)` and before effective withdrawal. Expiry at tick 30 denies a new restricted action at tick 30.
- Invoices due at the terminal boundary remain identified as terminal outstanding liabilities unless their payment event was inside the declared horizon. No extra free settlement tick is invented.

The 30-day period is not a real calendar month. Model-day ticks cannot establish real statutory deadlines or network latency.

### Tick phases

| Phase | Ordered work |
|---|---|
| 0 | Load prior committed state; apply due expiry/withdrawal, external shocks, resource degradation/outage transitions, and scheduled income/grant events |
| 1 | Construct actor observations from permitted information; process due membership/participation decisions |
| 2 | Solicit offers, allocate eligible capacity, negotiate and collect due ratification/votes |
| 3 | Validate action authority against current state; execute contracted domain delivery/maintenance; record task/observation outcomes |
| 4 | Recognize invoices and liabilities; execute due, funded settlements and contractual benefit allocations |
| 5 | Handle due audits/complaints/remedies; update bounded actor memory and schedule future events |
| 6 | Reconcile, validate invariants, compute/checkpoint due metrics, and commit next state |

Within each phase, observations use a declared snapshot; proposals are collected before resolution. Resolve capacity ties by an explicit rule, using actor IDs as final deterministic tie-breakers or a declared named random draw. Worker completion order MUST NOT decide who receives a contract.

Task demand, renewal, maintenance, and voting have separate schedules. Tick advancement never implies every actor thinks, every invoice pays, or every LLM is called again.

`pause`, `resume`, `single step`, and display speed change execution scheduling only. They MUST produce the same state/event hashes as an equivalent headless run. A finer tick experiment preserves the physical horizon and converts probabilities through a declared hazard model: for a constant independent daily hazard `p`, the probability over duration `d` days is `1 - (1-p)^d`. Applying a daily probability unchanged at every fractional-day tick is prohibited.

### Randomness

Use a versioned noncryptographic simulation PRNG, proposed **xoshiro128\*\***, with published-reference attribution and golden vectors; see [R3](#s15-review-gates-and-sources). Hash a canonical master-seed/context tuple to initialize the full nonzero 128-bit state. Record algorithm, digest encoding, byte order, and all-zero-state handling. Do not improvise different PRNGs in different modules.

Namespaced contexts identify domain/version, experiment parameter draw, replication, process, actor/object, tick, and draw purpose/index. Exogenous shock streams deliberately exclude institutional arrangement within matched pairs. Endogenous actions have their own contexts. Another actor's extra decision or one treatment's extra event MUST NOT shift an unrelated actor's draws.

Uniform and discrete draws, Bernoulli, bounded-integer selection, and any distribution transforms MUST have versioned tests. Do not silently clip an unconstrained sample into a valid range and call it the requested distribution. Default parameter stress designs are documented lists/strata, not claimed real-world priors.

The exact-repeat contract covers the same recorded runtime/engine and action/random inputs. JavaScript transcendental operations can differ at the last bit across runtimes; monetary and integer invariants remain exact, while cross-runtime floating diagnostics use declared tolerances. Bitwise cross-runtime claims require additional demonstrated numeric controls.

### Actor behavior and mode

- **F0:** apply rights, budget, quality, and capacity constraints first; choose the least full-cash-cost eligible offer, with explicit refusal/no-deal and recorded noncash burdens.
- **F1:** apply the same hard constraints, then compare current eligible offers with a bounded moving aspiration/experience state. Reference update is `a_next = 0.8*a + 0.2*observed_outcome`, on that outcome's declared scale. An actor cannot update from hidden truth or an outcome it did not observe.
- **P0:** deterministic policy action for a fixed observation. Exogenous world randomness can still be enabled.
- **P1:** named-stream stochastic choice among eligible alternatives. For scored alternatives, normalize declared, finite scores using a stable softmax; the temperature and score scale are explicit. Include refusal as an alternative, not an implementation error.
- **P2:** optional bounded generative action from the same observation/action contract. No ledger writes, rule editing, tools, private data, or authority escalation.
- **P3:** replay recorded actions at their original tick/phase with observation/config/policy identity checks. A recording from another model or changed scenario rejects rather than "best-effort" replaying.

Live agent latency is experiment wall time unless explicitly modeled as a separate decision-delay assumption. A late response cannot mutate a newer tick, a completed run, or a switched scenario. P2 failures/timeouts follow a manifest-defined policy: default `record-decision-failure-and-no-action`; no unrecorded repair/retry or substitution by a favorable scripted response.

## S05: Rights, governance, contracts, and money

### Non-negotiable boundaries

An object/purpose requires explicit eligible authority in the synthetic fixture. Denied, unresolved, expired, or withdrawn required authority blocks execution before ranking or pricing. Membership does not grant training permission, create ownership of public facts, or erase other people's rights.

Published/open material stays available under its existing terms when institutional membership ends. A service contract buys work, delivery, or support, not exclusive control of an open resource. No actor receives extra constitutional votes merely by purchasing, donating, contributing more records, or holding overlapping roles.

Reference A3 governance has separate buyer and supplier constituencies plus affected-party review. Ordinary decisions require majority participation and majority unconflicted approval in each required constituency; protected institutional changes require two-thirds approval in each and independent steward concurrence. For quorum, the denominator is the unconflicted eligible electorate fixed at vote opening; participation includes explicit abstention. Ordinary approval uses valid yes/no votes only, with strictly more yes than no. Protected approval requires `3 * yes >= 2 * eligible_unconflicted`, not merely two-thirds of a small turnout. No electorate or no valid yes/no vote yields no decision, not automatic approval. These are scenario rules, not assertions of legal authority. Rights holders still control new permissions individually.

Membership, mandates, service subscriptions, and governance participation are separate states. Mandate reference duration is 180 ticks; renewal is explicit. Complaint access is free, with an independent queue, funding, acknowledgment deadline, resolution deadline, appeal path, and visible arrears if capacity is inadequate. Initial queue capacity is five cases per accounting period; acknowledgment target five ticks and ordinary resolution target 30 ticks are synthetic process assumptions, not legal standards.

### Ledger contract

Cash is posted as balanced transfers between explicitly named accounts. For an actor's own accounts, internal reclassification is not new external revenue. Required controlled ledgers:

1. Operator unrestricted service/administration accounts.
2. Contributor agency accounts and corresponding contributor payables.
3. Restricted commons fund with donor/contract restrictions.

Buyer, vendor, funder, steward, and household accounts are also represented so the modeled system reconciles. Opening money and recurring external income identify their source; nothing materializes from an unlogged balance increment.

```text
cash_close = cash_open + cash_received - cash_paid
payable_close = payable_open + obligation_recognized - obligation_discharged
system_cash_change = declared_external_inflows - declared_external_outflows
```

Receipts held for someone else do not become operator revenue. An unpaid invoice is not cash. A failed payment remains a liability; no automatic "debt forgiveness" repairs an insolvent run. No overdraft facility exists in the reference scenarios. Unfunded obligations trigger arrears, suspended new commitments, and a wind-down path, not negative safeguarded cash.

Reference buyer/consumer accounts start at zero and receive their declared period budget as a logged synthetic external income at phase 0 of each period start. Unspent cash carries forward, while the period spending cap still applies. Opening operator/vendor capital is a separate one-time external inflow. These exogenous funding assumptions are identical across paired arrangements and are reported, not evidence of actual household income or committed library funding.

Every contract MUST identify principal-versus-agent treatment, gross consideration, direct cost, any contributor entitlement, eligible covenant base, payment timing, remaining obligations, and termination. One economic payment may be traced through several accounts but counted once at the relevant consolidation boundary.

### Cash rounding and fixtures

Use integer cents. Quoted positive prices use declared upward rounding; basis-point allocations use downward rounding with residue assigned to a disclosed account. The existing [settlement and tax helpers](../site/model.mjs) are parity fixtures, not universal domain pricing rules.

For the concept's $10 receipt under the 40/30/20/10 example, pools are $4/$3/$2/$1. Three equal contributors receive $1.33 each, leaving a $0.01 contributor liability. The existing annual [operator worksheet](../examples/service-operator-economics.json) stays a separate regression case; neither domain's new reference defaults claim to reproduce a real operator.

An A3 covenant allocates only from its named eligible receipt base. The reference service-administration covenant is 20% of **received administration fees**, not 20% of vendor gross invoices, contributor liabilities, opening capital, or restricted grants. A0-A2 have no covenant unless explicitly varied as a separate intervention.

## S06: Direct AI Commons Collective model contract

### The central institutional problem

The model MUST directly represent the three linked but separate functions in the research:

1. **Buying AI services together:** consumers seek useful AI service, predictable price, adequate quality, privacy, portability, and enforceable conditions.
2. **Bargaining over authorized contributions:** contributors may supply scoped professional material or ongoing services that providers actually value. Membership and ordinary AI use do not imply donation or model training.
3. **Financing the commons:** a disclosed covenant and independently governed fund support shared knowledge without inventing exclusive rights over public-domain/open material.

The question is whether their combination improves outcomes after costs, or whether an existing buyer organization, direct licensing, or separate stewardship funding performs better. The model MUST be capable of reporting no contribution-market demand, no procurement advantage, ineffective governance, and insolvency.

### Actors and controlled objects

| Actor/object | State and decisions |
|---|---|
| Consumer/member | AI task needs, spending limit, minimum acceptable quality, non-negotiable processing constraints, comprehension, membership, scoped procurement commitment, provider choice, refusal, exit/switching costs |
| Contributor role | A person or organization may overlap with consumers; holds only explicitly assigned synthetic authority, reservation price/effort, object/service offers, multihoming, and prospective mandate withdrawal |
| AI provider | Retail and collective offers, capacity, cost, markup policy, permitted processing, task-quality response, licensing/maintenance budget, outside alternatives, fulfillment and renewal |
| Collective/operator | Procurement mandates, ratification, contract administration, support, fees, liabilities, funded enforcement, bargaining and switch execution |
| Existing host | A credible A1 buyer organization with its own explicit costs, mandates, and constraints; not automatically less effective than a new institution |
| Commons steward/fund | Maintains open-resource versions, commissions useful work, honors restrictions, reports public service and additionality |
| Affected nonmember/reviewer | Can bear burdens or challenge use without selling data or joining; independent review and remedy capacity are explicit |
| Knowledge-service object | Version, public/private/professional/synthetic axes, purpose-specific authority, freshness, maintenance, task relevance, price if legitimately offered, and provenance state |

The field "data category" is not a scalar data value. Reference inventory counts below form mutually exclusive **fixture buckets for generation only**; emitted objects retain independent access, origin, profession, privacy, rights, and purpose axes. A professional work can be public; synthetic origin does not clear rights.

### Reference inputs

| Parameter | Reference | Admissible domain / unit |
|---|---:|---|
| `ai.consumer_count` | 1,000 | Integer 1-10,000 synthetic consumers |
| `ai.contributor_role_count` | 100 | Integer 0 to consumer count in the initial fixture; overlaps, not 100 additional people |
| `ai.provider_count` | 3 | Integer 1-20 |
| `ai.knowledge_object_count` | 200 | Integer 0-10,000 |
| `ai.object_bucket_counts` | Public 80, private 60, professional 40, synthetic 20 | Nonnegative integers summing to object count; generation labels do not grant rights |
| `ai.tasks_per_consumer_period` | 20 | Integer 0-10,000; distribute across ticks with a named schedule |
| `ai.initial_procurement_interest_share` | 0.6 | Fraction initially interested in committing; authority/comprehension/capacity checks determine actual commitments |
| `ai.mandate_comprehension_prob` | 0.8 | Probability per new synthetic mandate-comprehension check; not a measured population rate |
| `ai.consumer_budget_cents_period` | 3,000 | Nonnegative safe integer |
| `ai.minimum_observed_task_success` | 0.75 | Fraction; individual thresholds can vary in declared stress designs |
| `ai.retail_price_cents_consumer_period` | 2,000 | Nonnegative safe integer for a defined, comparable service package |
| `ai.provider_variable_cents_consumer_period` | 1,400 | Nonnegative safe integer |
| `ai.collective_contract_setup_cents_period` | 20,000 | Nonnegative safe integer per contracted provider/order |
| `ai.provider_markup_bps` | 1,500 | Integer 0-10,000 |
| `ai.minimum_collective_commitments` | 50 | Positive integer; provider's explicit offer-channel condition |
| `ai.provider_capacity_consumers` | 2,000 | Nonnegative integer per provider |
| `ai.provider_base_success_prob` | 0.8 | Strictly between 0 and 1 for the logit response; boundary 0/1 fixtures use explicit deterministic outcome paths |
| `ai.maintained_data_log_odds_effect` | 0 | Finite coefficient, reference stress set -1, 0, 1; no built-in quality premium |
| `ai.synthetic_alternative_log_odds_effect` | 0 | Same domain; substitutability is a hypothesis |
| `ai.private_context_log_odds_effect` | 0 | Same domain; applies only to authorized private inference context |
| `ai.provider_value_cents_additional_success` | 20 | Nonnegative cents per expected additional accepted task; illustrative willingness-to-pay proxy |
| `ai.contributor_reservation_cents_object_period` | 1,000 | Nonnegative cents for a precisely authorized knowledge service |
| `ai.contributor_effort_cost_cents_object_period` | 600 | Nonnegative cents-equivalent effort; unpaid time also reported separately |
| `ai.provider_contribution_budget_cents_period` | 100,000 | Nonnegative funded spending cap; not a promise to spend |
| `ai.object_freshness_decay_per_day` | 0.005 | Fraction/day, converted consistently for other tick sizes |
| `ai.object_maintenance_cost_cents` | 500 | Nonnegative cents per defined maintenance job |
| `ai.maintenance_success_prob` | 0.9 | Probability per completed job |
| `ai.switching_cost_cents_consumer` | 500 | Nonnegative cents per completed provider switch |
| `ai.portability_delay_ticks` | 2 | Nonnegative integer ticks from approved request to attempted activation |
| `ai.switch_completion_prob` | 0.95 | Probability per funded, authorized activation attempt |
| `ai.procurement_renewal_periods` | 3 | Positive integer |
| `ai.contribution_mandate_ticks` | 180 | Positive integer; renewal is explicit |
| `ai.host_fee_cents_member_period` | 50 | A1 service fee per contracted consumer, not pay-to-vote |
| `ai.procurement_fee_cents_member_period` | 300 | A2 service fee |
| `ai.two_sided_fee_cents_member_period` | 400 | A3 service fee |
| `ai.host_cost_cents_period` | 40,000 | A1 full operator cost |
| `ai.procurement_cost_cents_period` | 250,000 | A2 full operator cost |
| `ai.two_sided_cost_cents_period` | 350,000 | A3 full operator cost, including governance/support/remedy provision |
| `ai.opening_operator_cash_cents` | 1,000,000 | Explicit synthetic unrestricted initial capital in A1-A3 |
| `ai.opening_provider_cash_cents` | 5,000,000 | Per provider; explicit synthetic initial capital, not revenue |
| `ai.baseline_commons_income_cents_period` | 0 | Existing nonproject support, matched across arrangements if varied |
| `ai.commons_displacement_fraction` | 0 | Fraction 0-1 of prior-period covenant receipts that displaces next-period baseline support, capped by that support |
| `ai.payment_delay_ticks` | 0 | Integer 0-180 after invoice recognition |

Common covenant, reserves, governance, and external-funding rules are in S05. A3's reference covenant remains 20% of **received administration fees**, separate from contributor payments. Default external grants are zero; a declared grant treatment must identify use restrictions, schedule, expiry, and source.

Reference authority fixtures permit public compatible retrieval with its conditions; private objects permit only the owner's scoped inference context, **not pooled sale or training**; professional objects require current retrieval-service mandates; synthetic objects require explicitly assigned lineage/rights review before eligibility. No reference scenario authorizes model training. A later training-rights experiment would require a new reviewed purpose/contract model, not a checkbox that overrides authority.

### Procurement, demand, and actual switching

Eligible consumers can join without contributing data. Participation, service purchase, and a binding procurement commitment are separate events. Initial interest is a synthetic initialization assumption; only successful checks create actual commitments. Subsequent participation responds to observed cost, quality, processing terms, and usable alternatives.

A new mandate includes a synthetic comprehension check. Failure records an unsuccessful authorization attempt and withholds that optional mandate; it never grants broader processing because someone misunderstood it. The person retains civic participation and any independently eligible retail service. This mechanism is a declared safety rule plus a comprehension assumption, not proof of actual informed consent.

For `n` authorized committed consumers meeting the provider's minimum and capacity limits, the reference collective offer is:

```text
collective_quote = ceil((setup_cost + n * variable_cost) * (10,000 + markup_bps) / 10,000)
full_member_price = allocated_quote_share + arrangement_service_fee
```

Allocate indivisible quote cents by a stable largest-remainder rule so member charges sum exactly to the quote. Retail is a separate available channel at its declared package price, not the collective formula evaluated at one person. A supplier may decline when capacity, costs, margins, or conditions are unacceptable. Test higher costs/markups, low commitment, a zero setup advantage, and credible retail alternatives.

Consumers evaluate comparable task baskets and hard processing constraints before price. F0 accepts an eligible offer only when within budget and meeting observed quality requirements; anticipated full cost includes the switching charge amortized over the stated contract horizon, with actual cash charged only on the switch event. F1 additionally retains bounded experience/aspiration and inertia. Commitments that are not fulfilled cannot inflate the provider's contract volume.

Consumers who refuse a collective offer remain in the world: they can choose an eligible affordable retail alternative or record unmet need. Exiting, refusing, or receiving no contributor payment does not remove someone from eligible-population or affected-party reporting.

A claimed switch requires export/portability steps, funded cost, an eligible alternative, and successful service activation. Record attempted versus completed switches, interruptions, and rejected changes. Merely changing a provider ID is not effective exit.

Schedule activation after `portability_delay_ticks`, then recheck authority, affordability, provider capacity and the current scenario/run identity. If eligible, use `switch_completion_prob` for the modeled activation outcome. Charge the specified completed-switch fee only on success; retain the prior assignment on failure if it remains available. Record any interruption/unmet tasks separately rather than silently serving from a failed provider.

Reference consumers begin with an eligible retail-provider assignment using stable round-robin IDs; this is shared across matched arrangements. Selecting the same provider without a migration incurs no switching fee. Reference period subscriptions are invoiced at the period's first committed service activation and cover the stated task basket; no duplicate invoice arises on subsequent daily tasks. Complaint remedies/refunds are separately recorded contractual events, not silently netted out of the advertised price.

At each negotiation round, recompute the quote from actual remaining authorized commitments. Offers/acceptances produced for 1,000 buyers cannot bind 600 buyers to an unfunded 1,000-buyer discount. Stop at a stable funded agreement or after three rounds with a recorded no-deal outcome. Use the same rule in each arrangement that pools orders.

### Provider demand for contributions is endogenous

For each task, define incremental authorized maintained coverage `m`, eligible synthetic-alternative coverage `s`, and individually permitted private context `c`, each in [0,1] relative to the common baseline service. The reference performance hypothesis is:

```text
p_success = logistic(logit(base_success) + beta_m*m + beta_s*s + beta_c*c)
```

Public knowledge already present in the baseline is not counted again as an exclusive contribution. The latent quality/freshness state determines the simulated outcome but is hidden from provider decision rules except through declared noisy evaluation/observations.

The default incremental coefficients are zero. Thus the model **does not assume** that governed data improves task performance or that providers will pay for it. Null demand is a valid reference outcome. Nonzero/negative coefficients are explicitly labeled structural/parameter experiments, not established training effects.

A provider's estimated baseline/effect parameters are separate from the world's latent response. Their reference values equal the stated baseline/zero effects only as a disclosed correct-belief fixture; biased-belief stress tests must vary them independently. Initial consumer service-quality belief is 0.8 with `illustrative-prior` provenance, not an invented evaluation sample. Realized feedback and noisy permitted evaluations update beliefs; the actor cannot read latent coefficients or every other consumer's private task outcomes.

A provider estimates the marginal accepted-task gain from a candidate authorized service using its allowed evidence and existing alternatives. Maximum willingness to pay is estimated additional successful tasks times the declared per-success value, bounded by its funded contribution budget. It accepts only when expected benefit covers the full quoted price plus verification/integration cost; equal/nonpositive net benefit defaults to no purchase. The reference extra verification cost is 200 cents per candidate service. No budget is automatically distributed to contributors.

Select positive-surplus candidates in descending expected surplus with deterministic ID tie-breaks, recomputing incremental coverage after each selection to avoid paying repeatedly for identical task coverage. This is a bounded heuristic, not an optimal auction or a calibrated equilibrium. F1 can update estimates from observed results, without learning directly from hidden truth.

In the reference F1 implementation, observed task-success and fulfillment aspirations use the shared 0.2 update weight. Causal quality-effect coefficients stay fixed within the parameter setting; estimating them online requires a separately reviewed learning/identification model. An uncontrolled before/after task average must not be silently treated as an identified contribution effect.

Contributor mandates govern particular object versions, purposes, time windows, and terms. The supplier chamber may coordinate only within the explicit hypothetical rule set; it does not set compulsory federation-wide price floors or gain competition-law immunity. Multihoming is allowed. Prospective withdrawal blocks new commitments, not accrued payment or pre-existing lawful open reuse.

### Money, commons effects, and negative cases

- Consumers pay providers for AI services and operators for disclosed administration; contributor agency liabilities are separate.
- Providers pay only for accepted, fulfilled authorized contribution services. Gross provider contribution payment is earmarked in the agency ledger and disbursed to its entitled contributor(s), not booked as operator income.
- Commons transfers fund approved maintenance work and public availability. Spending may fail to improve usefulness; maintenance success and displacement of other support are explicit assumptions.
- Affected noncontributors can be excluded, exposed, or burdened even when members gain. Represent complaints, funded remedies, and subgroup outcomes rather than equating membership growth with collective agency.
- Contributor receipts must not be averaged over all consumers and advertised as a universal data dividend.

Object freshness starts at 1 and, absent maintenance, evolves as `freshness_next = freshness * (1-decay_per_day)^tick_duration_days`. A completed, authorized maintenance job restores it to 1 on success; failure retains the degraded state and recorded cost. Funded stewards choose the oldest eligible publicly useful object first, with stable ID ties, and cannot spend beyond available restricted cash. Jobs are uniquely identified; the same completed work is not also counted as a separately paid provider contribution.

When baseline support/displacement is studied, next-period baseline income is `max(0, baseline_income - floor(displacement_fraction * prior_period_covenant_receipts))`. Period zero has no prior covenant. New covenant money is then accounted for separately. Measure additional completed maintenance from paired outcomes; do not apply another displacement haircut to those outcomes and count the same effect twice.

At full commitment of 1,000 consumers with the reference offer inputs:

1. Collective quote = `(20,000 + 1,000*1,400)*1.15` = **1,633,000 cents**, or 1,633 cents per member.
2. Retail is 2,000 cents. Before switching costs, A1 full price is 1,683; A2 is 1,933; A3 is 2,033 cents. A3 is **33 cents more expensive** than retail in this equal-quality fixture.
3. A3 receives 400,000 cents administration fees, allocates 80,000 to the commons, and pays 350,000 operator cost: a **30,000-cent unrestricted period deficit** before other allowed income. Contributor liabilities and restricted cash cannot fill it.
4. With both latent and estimated incremental quality coefficients fixed at zero, no falsely favorable evaluation evidence, and positive contribution/verification prices, provider contribution demand is zero. Biased-belief/noisy-evidence experiments are separate cases and can produce mistaken purchases.
5. A fixture with 100 expected additional accepted tasks, 20 cents value each, 1,000 cents contribution price, and 200 cents verification cost has 800 cents positive expected surplus and may be accepted if funded and authorized. Denied authority still rejects it.

These are hand-check conditions, not executed forecasts; the dynamic reference has 60% initial interest before authority/comprehension/capacity checks and may evolve differently.

## S07: Library model contract

### Actors, objects, and endogenous state

- Six institutional library buyers; 200 synthetic adult patrons; 20 maintainer/contributor roles; three service vendors; an operator/host where applicable; independent stewards and affected-party representation.
- Sixty synthetic OER resource versions, each with authority by purpose, license/access state, accessibility status, link/content defect state, last maintenance tick, and task category.
- Work orders, queue positions, finite per-period maintainer capacity, offers, service contracts, task attempts, observed acceptance, renewals, and earmarked payments.
- Patron profiles differ in accessibility need and desired tasks. They are simulated demand, not a proposal to collect learner logs.

Reference public resources have synthetic fixture authority for retrieval and lawful open reuse; model-training is outside scope. Include denied/unresolved authority as tests, not as material the engine quietly admits.

### Reference inputs

All values are **illustrative**, with configured legal domains checked before execution.

| Parameter | Reference | Admissible domain / unit |
|---|---:|---|
| `library.buyer_count` | 6 | Integer 1-100 |
| `library.patron_count` | 200 | Integer 0-10,000 |
| `library.maintainer_count` | 20 | Integer 0-1,000; roles may overlap patrons without duplicating persons |
| `library.vendor_count` | 3 | Integer 1-20 |
| `library.resource_count` | 60 | Integer 1-10,000 |
| `library.requests_per_buyer_period` | 100 | Integer 0-100,000 synthetic retrieval tasks |
| `library.service_units_per_buyer_period` | 5 | Integer 0-1,000; one unit funds one integration/maintenance work item |
| `library.defect_hazard_per_day` | 0.002 | Probability/day; separate link and accessibility flags use separate named streams |
| `library.repair_success_prob` | 0.9 | Probability per completed attempt |
| `library.repair_lead_ticks` | 2 | Integer 1-360 |
| `library.work_capacity_per_maintainer_period` | 3 | Integer 0-100 work items |
| `library.accessibility_need_share` | 0.2 | Fraction of synthetic patrons |
| `library.minimum_observed_acceptance` | 0.8 | Fraction; no-task observations are unknown, not automatic pass |
| `library.renewal_periods` | 6 | Integer 1-36 |
| `library.quote_setup_cents_per_order` | 20,000 | Integer 0-10,000,000 |
| `library.quote_variable_cents_per_unit` | 8,000 | Integer 0-1,000,000; includes contributor work cost below |
| `library.contributor_cents_per_completed_unit` | 5,000 | Integer 0 to variable cost per unit |
| `library.vendor_markup_bps` | 2,000 | Integer 0-10,000 |
| `library.vendor_capacity_units_period` | 60 | Integer 0-100,000 per vendor |
| `library.buyer_budget_cents_period` | 150,000 | Nonnegative safe integer |
| `library.host_cost_cents_period` | 60,000 | A1; nonnegative safe integer |
| `library.collective_cost_cents_period` | 150,000 | A2/A3; includes disclosed administration, participation, and remedy provision |
| `library.host_fee_cents_buyer_period` | 10,000 | A1; paid only by contracted buyers |
| `library.collective_fee_cents_buyer_period` | 25,000 | A2/A3; paid only by contracted buyers |
| `library.opening_operator_cash_cents` | 300,000 | A1-A3 externally sourced unrestricted capital |
| `library.opening_vendor_cash_cents` | 200,000 | Per vendor; explicit initial capital |
| `library.payment_delay_ticks` | 0 | Integer 0-180 after invoice recognition |

Reference starting resources are defect-free. Defect states persist until a successful repair; already-defective resources are not counted as becoming newly defective every day. Initial defect fractions are additional stress inputs, with reference zero. Buyer budgets are period spending limits backed by explicit scheduled income/account funding, not permission for overdrafts.

### Transition and cost rules

1. Each day, a currently intact resource flag becomes defective with its declared hazard. A repair takes its lead time and clears the targeted flag with `repair_success_prob`; failed repairs remain defective and retain recorded cost.
2. Tasks are allocated across eligible resources using a named demand stream; a task succeeds only if the selected resource is available, authorized for the requested purpose, free of the relevant link/content defect, and accessible when required. Denied tasks, no-eligible-resource tasks, attempted failures, and unmet service capacity are distinct.
3. Maintainer work queues use observed defects, requested accessibility improvements, and declared priority rules. Operators do not know hidden defect status without an allowed observation. Reported/observed defects arise from service attempts or evaluations; fixtures can explicitly expose a defect to test the queue.
4. Contracted work is limited by vendor and maintainer capacity, buyer budgets, rights, and actual deadlines. Work units with no eligible work remain unfilled; never create busywork merely to exhaust a budget.
5. A vendor quote for an order of `q > 0` standardized units is:

```text
base = setup_cost_cents + q * variable_cost_cents
quote_cents = ceil(base * (10,000 + markup_bps) / 10,000)
```

For `q = 0`, there is no order, no setup fee, and no quote. A0 solicits each eligible buyer order separately. A1-A3 can combine committed demand, subject to mandates and capacity. The formula represents one explicit transaction-cost hypothesis; zero setup cost and different offer rules MUST be tested. No arrangement receives an additional automatic discount.

6. The vendor receives the contracted consideration and incurs setup/nonlabor cost once per order. For each completed payable work unit, it transfers the contributor entitlement into the agency ledger for disbursement. That work cost is already included in the variable cost; it MUST NOT be charged to the buyer a second time. Incomplete/canceled work follows the contract's stated refund/cost terms; the reference pays per accepted completed unit with no invented completion.
7. Administration fees are separate operator income. A3 allocates the specified fraction of received administration fees to the restricted commons fund. Vendor and contributor receipts are not the covenant base.
8. Renewal occurs at contract boundaries, based on observed service acceptance, full price/fees, affordability, and authority. F0 applies thresholds; F1 also uses observed historical aspiration. No tasks means insufficient quality evidence, not successful service.

Commons stewards can commission additional eligible public maintenance through the same quote/authority/capacity pipeline using their restricted budget after already contracted buyer work is allocated. Each work item has one funding source and completion ID. A transfer too small to fund a valid order remains restricted cash; it is not automatically counted as completed maintenance or operator income.

Maintainer retention depends on received work compensation versus declared direct/time cost and feasible capacity. Record unpaid time and late payments separately. The reference contributor opportunity cost is 3,000 cents per one-hour work item; it is a synthetic parameter, not an empirical wage or a license to underpay real work.

### Library hand-checks

With six independent five-unit orders, setup 20,000 cents, variable cost 8,000 cents, and 20% markup:

- A0 quote per order is 72,000 cents; six orders total 432,000 cents.
- One 30-unit pooled order is 312,000 cents.
- A1 plus six 10,000-cent fees totals 372,000 cents, or 62,000 per buyer.
- A2 plus six 25,000-cent fees totals 462,000 cents, or 77,000 per buyer.
- The pooled purchasing saving alone is 120,000 cents, but A2's full cost is **30,000 cents worse than A0** in this fixture. This is a deliberately checkable counterexample to "bigger always wins."
- A3's covenant on 150,000 cents of received fees is 30,000 cents. With 150,000 cents of operator cost, that creates a 30,000-cent period cash deficit absent other unrestricted income. Restricted money cannot repair it.

These arithmetic fixtures assume all quoted units are eligible, accepted, delivered, and funded. They are not the output of the dynamic reference scenario.

## S08: Monte Carlo and cross-model experiment contract

### Within-model comparisons first

For each domain, compare A0-A3 on the same eligible initial population, capacities, funding sources, permitted observations, and matched exogenous shocks. Behavior families and policy modes are explicit factors, not hidden upgrades attached to A3.

Cross-model evidence asks whether an institutional mechanism remains useful under **different domain dynamics**. It does not treat an AI-assistant task and an OER accessibility work item as interchangeable units, nor does it establish universal generalization from two cases.

Primary shared comparisons are:

- Full user/buyer cash cost, unmet need, and separately reported time burdens.
- Contributor net receipts, nonpayment, effort, retention, and concentration.
- Operator unrestricted runway/arrears and post-grant continuity.
- Additional maintained public service against a matched baseline, using domain-specific units.
- Refusal/withdrawal/appeal outcomes and affected-group distribution.

Report absolute changes within each domain. A relative change is permitted only with a meaningful nonzero baseline and the metric's preferred direction stated. A zero baseline yields an explicit undefined relative change, not infinity coerced to a finite score. Do not average two unrelated quality percentages into a universal "commons success" score.

### Design and precision

The planning envelope is 2 domains x 50 parameter settings x 20 stochastic replications x 4 arrangements x 2 behavioral families = **16,000 trajectories** and **17,280,000 daily ticks** at 1,080 ticks each. This is a budget-sizing example, not the mandatory first execution or a claim of adequate statistical precision.

Start with fixtures and small pilots. Run settings with common random numbers where exogenous events correspond. Maintain separate uncertainty layers: conditional stochastic variation, uncertain parameters, structural family, evaluator error, and optional model-generation variation.

Parameters remain fixed within a conditional replication set. Unknown ranges use labeled stress grids; no fake empirical prior. Preserve dependencies such as private-context permission/coverage, resource complexity/repair effort, or concentration/outside options. Samples that violate a constraint are reported and resampled only under a declared sampling method; arbitrary clipping is prohibited.

For paired outcome differences `d_r`, report mean, count, standard deviation, and Monte Carlo standard error `sd(d)/sqrt(R)`. For binary outcomes, report an appropriate interval and replication count; zero failures is not zero risk. Report incomplete pairing and launched/valid/failed counts.

The initial implementation SHOULD support fixed replication counts and a pilot precision estimate before launching a larger fixed design. Adaptive stopping is disabled until a reviewed sequential method is implemented; repeatedly checking an ordinary interval and stopping when it looks favorable is not supported.

Exploratory sensitivity begins with deterministic grids and ranked/conditional contrasts. Any later global variance/Shapley analysis requires declared dependence assumptions and its own validation fixtures. Sensitivity is not automatically causality.

## S09: Model dropdown and complete reset transaction

This is a **release-blocking requirement**, not a convenience feature.

### User contract

The dropdown labeled **Simulation model** has exactly two registered choices: **AI Commons Collective** (default) and **Library-led open-education collective**. Adjacent text states: "Switching model clears the current scenario, unsaved edits, active run, and displayed results. Saved runs remain available separately." Provide explicit Save scenario and Reset selected model actions.

Switching from either model to the other MUST instantiate the selected model's complete immutable reference defaults. Returning to a prior model MUST NOT restore its prior edits, results, or random-stream position. Reset selected model follows the same transaction even if its ID does not change.

The only retained settings are nonsimulation preferences such as theme, reduced motion, and accessibility preferences; immutable saved/audit records; and non-resettable real-cost safety limits. Their retention MUST NOT seed the new simulated world. Browser locale may format numbers but never change units or values.

### Required reset sequence

1. Validate the requested model ID against the registry. Unknown IDs show an error and do not substitute another model.
2. Increment a monotonic **session generation** token and invalidate the prior active run identity immediately.
3. Cancel/terminate prior simulation workers, abort pending requests where possible, and detach subscriptions/timers. Cancellation is best effort; the generation barrier is mandatory.
4. Record any canceled run and incurred real API cost in the immutable audit store. Do not erase charges by resetting a simulated budget.
5. Build a fresh configuration from the target model's deep-cloned/frozen default definition. Do **not** spread or merge the old configuration into it.
6. Construct a completely new runtime/store tree: tick zero, no phase in progress, fresh seed/PRNG state, initial actors/objects/contracts/ledgers, empty queues and diagnostics, default experiment settings.
7. Reset all scenario-dependent UI state: dynamic controls, hidden advanced values, units, filters, selections, shock schedules, cohort/metric choice, pinned active comparison, charts/tables, progress, errors, replay cursor, pending validation, and exports.
8. Validate the new configuration/state. On failure, show an explicit nonrunnable target-model error state with old results hidden; do not revive the old world under the new title.
9. Atomically publish the new model/config/runtime/UI identity. Status is **ready, not running**, with an accessible reset announcement. No external model call starts automatically.

Every worker message, batch result, chart job, saved-result load, and LLM response MUST carry `(sessionGeneration, modelId, modelVersion, configHash, runId)`. Mismatches are ignored for active-state mutation and recorded as stale operational messages where useful. A result's title alone is never a sufficient match.

### Reset inventory

| State category | Reset behavior |
|---|---|
| Inputs and heterogeneous draws | Entire selected-model defaults, including shared-looking controls and hidden values |
| Institutional configuration | Arrangement, mandates, votes/quorum, fees, support, restrictions, covenant, remedy policy |
| Domain variables | Remove all old-domain keys; regenerate only the new domain |
| Clock and queues | Tick/phase/period zero; no pending old events, invoices, repairs, contribution offers, or renewals |
| People/organizations/objects | Fresh synthetic identities within the model namespace and initial-state definition |
| Money | Restore declared opening balances and zero runtime liabilities except explicitly configured initial liabilities |
| Randomness | Default model seed and freshly derived named streams; no continued state from previous runs |
| Experiment | Parameter grid, repetitions, structural/policy choices, comparisons, stopping state, and budget counters |
| Active analysis | Clear outcomes, chart data, confidence intervals, selected runs, counters, and old error banners |
| Workers and async jobs | Terminate/abort plus generation/config/run guards |
| Caches | No reuse unless a complete immutable artifact identity matches; active results remain blank after a switch |
| Persistence | Never automatically hydrate prior model edits or URL/local-storage state during dropdown reset |
| Audit/history | Retain immutable historical records and real spending, detached from active controls/results |

Loading a saved scenario is a separate, explicit action: validate its complete versioned bundle, run the reset/cancellation barrier for its model, then load the whole approved configuration. Do not partially merge a saved record with another model's defaults. Unsupported versions require an explicit migration or reject.

### Required switching cases

- Edit every valid configurable leaf in AI, advance it, select Library: Library equals a fresh Library session.
- Edit/advance Library, select AI: AI equals a fresh AI session, not the earlier AI.
- AI -> Library -> AI rapidly while a worker/LLM/analysis job resolves out of order: only the newest generation can affect the screen/state.
- Switch while running, paused, replaying, errored, canceled, or batch-completing.
- Same-model Reset restores defaults and seed, not merely tick zero.
- Model defaults are never mutated by a live session; two simultaneous sessions do not share mutable nested arrays/maps.
- Every newly added parameter is covered automatically by a registry-derived reset test. A new field cannot accidentally survive because a hand-maintained clear-list omitted it.

## S10: Review interface and visual contract

The main workspace has model choice, arrangement/family/policy controls, evidence status, configurable parameters, Run/Pause/Step/Reset, tick/period indicators, and an always-visible run/config identity.

**Run scenario** executes one trajectory of the current configuration. **Run experiment** opens the manifest/count/budget review for the selected batch; it is not the same button and does not execute on a dropdown change. Defaults for a one-domain experiment plan 160 trajectories, but no run is started until the user explicitly starts that reviewed plan.

| Shared view | Domain-specific content |
|---|---|
| Tick timeline and actor activation | AI: commitments, provider offers, service use, contribution permissions, payments, switching. Library: defect discovery, work queue, accessibility, renewals |
| Institution/role map | Same actor identity across roles; distinct authority, information, cash, and representation edges |
| Cash-flow diagram plus balance table | Operator, vendor, contributor agency, restricted commons, buyer/funder accounts; no hidden internal-transfer duplication |
| Distribution and paired-comparison view | Domain units, valid pair counts, denominators, uncertainty layers, zero outcomes and excluded groups |
| Run-health/evidence panel | Unknown authority, failed decisions, invalid runs, budget exhaustion, assumptions and source links |
| Domain-state visual | AI: buyer-provider-contributor-steward flow with purpose-specific eligibility and separate money streams. Library: accessible resource/defect matrix and maintenance queue |

Diagnostic hidden truth may be shown to researchers in an explicitly labeled view. It MUST NOT become information available to an actor or its LLM prompt. Default observations show only what the role could know.

No chart displays simulated results before execution. While a configuration is edited, old results are marked as belonging to a different frozen configuration and hidden from the active comparison; a model switch clears them completely. No spinner fallback invents values.

Provide keyboard-operable controls, table alternatives, color-independent statuses, accessible labels/announcements, reduced motion, and units in control labels. Rendered animation uses committed snapshots; frame count never advances the world.

## S11: Metrics, result status, and claims

Each metric definition includes ID/version, numerator, denominator, unit, aggregation window, eligibility, preferred direction if any, hidden-truth versus observed status, and required comparison.

Shared mandatory counters include people versus role counts, eligible/denied/attempted/unmet tasks, joining/exiting/refusing actors, obligations incurred/paid/overdue, operator/agency/restricted balances, grants, maintenance spending and completed work, and launched/valid/invalid/canceled runs.

Domain quality outcomes MUST retain their own denominators:

- AI: successful authorized assistant tasks / attempted authorized tasks; denied/unmet tasks separately; committed buyers / eligible buyers; paid authorized contribution services / eligible offered services; actual switches / eligible switch attempts; baseline versus incremental task performance distinguished.
- Library: successful eligible retrieval tasks / attempted eligible tasks, with denied and unmet requests separately reported; accessible resources / relevant resources; completed repairs / contracted due repairs; observed and true defect rates distinguished.

Agency metrics are conditional on actual opportunities: successful prospective withdrawals / attempted eligible withdrawals, or resolved substantiated complaints / substantiated complaints. With no attempts/cases, report no denominator rather than perfect agency.

Unrestricted runway is derived from unrestricted cash and declared recurring cost obligations; zero ongoing costs is labeled `not-defined-zero-burn`, not an arbitrary infinite-safety score. Survival curves distinguish institutional failure from incomplete/canceled trajectories.

Allowed claims remain conditional: "Under this model, configuration, and experiment design..." Software tests and a second domain model do not establish empirical institutional effectiveness. Publish negative and null comparisons alongside gains; do not suppress A1 outperforming a new collective.

## S12: Storage, privacy, AI cost, and execution boundary

Use canonical JSON for frozen configurations/manifests and JSONL for event/action streams; streaming/compression may be added without changing logical hashes. Canonicalization rules MUST be versioned: key order, UTF-8 encoding, finite numbers, normalized strings, and absent-versus-null semantics. Hash the scientific payload separately from wall-time/UI metadata.

Saved artifacts identify model/config/engine/policy versions and whether their payload is synthetic, public source-derived, or later authorized empirical input. Initial release accepts synthetic scenarios and explicitly reviewed public metadata only. No learner logs, raw private conversations, precise personal locations, credentials, or source attachments are exported.

Active state and immutable history are separate stores. Storage quota failure is visible and must not claim a saved or reproducible run when required artifacts are missing. For large batches, retain manifests, seeds, final results, hashes, all P2 actions and failures, and sufficient checkpoints or regenerable event journals; a selected full trace can be regenerated only under its recorded reproducibility contract.

P2 real calls run only through an explicitly configured, separately approved local/headless adapter. The static GitHub Pages interface does not hold provider keys or automatically call a backend. It can inspect/import P3 records. Any later interactive backend needs a separate deployment/security review.

Real token/cost usage is append-only and grouped by provider/model/role/run. It is not the simulation's fictional money. A scenario reset does not reset an account-wide real spending cap. The existing [usage audit](../usage/README.md) is a historical snapshot and MUST NOT be silently extended to claim coverage of these future runs.

## S13: Acceptance and validation matrix

All checks below are requirements for future implementation, **not tests claimed to pass today**. They refine the concept's V01-V17.

| Test ID | Required evidence |
|---|---|
| T01 | Configuration schemas reject unknown model/domain fields, invalid units, nonfinite values, unsafe integer arithmetic, illegal probabilities, and infeasible combinations |
| T02 | Both model factories create complete independent state; missing defaults or a field without reset metadata fails |
| T03 | Same frozen run inputs reproduce state/event hashes in the same supported runtime, independent of worker count/batch order |
| T04 | Headless, step, pause/resume, and different display speeds give identical committed outcomes |
| T05 | Expiry/withdrawal at tick 30 blocks new restricted use at tick 30; accrued payables and existing open-license rights survive appropriately |
| T06 | Recurring invoices/expenses execute once per period; initialization does not repeat; terminal liabilities remain visible |
| T07 | Named random streams preserve paired exogenous events despite different endogenous event counts |
| T08 | Finer tick conversion preserves duration/hazard meaning; raw per-day probabilities are not reused per sub-day tick |
| T09 | Exact cash/agency/restricted reconciliation and existing toy/operator parity fixtures pass; restricted cash cannot cure operator deficits |
| T10 | Membership, overlapping roles, votes, mandates, authorization and service purchase remain distinct; no extra vote from spending or duplicated role |
| T11 | Capacity, budget, no-deal, no-eligible-resource, refused permission, and unknown evidence produce explicit non-success outcomes |
| T12 | AI quote/fee/covenant hand-checks match S06, including A3 being more expensive and its unrestricted deficit in the equal-quality fixture |
| T13 | AI contribution demand is zero in the correct-belief zero-value/positive-cost fixture; positive-value funded/authorized fixture can trade; false favorable evidence is separately testable; duplicate coverage is not purchased twice |
| T14 | AI membership does not grant contribution/training authority; expired private/professional mandates deny use; switching requires actual authorized completion and cost |
| T15 | Library quote/fee/covenant hand-checks match S07, including the negative A2 full-cost comparison |
| T16 | Library defect discovery, repair delay/failure, accessibility requirement, and workload capacity affect the correct task/queue counters |
| T17 | Library renewal uses observed service and full cost; zero tasks do not imply perfect quality; contributor cost is not charged twice |
| T18 | Domain modules produce different typed events/state/metrics; neither is a cosmetic relabeling of the other |
| T19 | Every configuration leaf changed in AI is replaced by Library defaults and vice versa; AI -> Library -> AI never restores old edits |
| T20 | Running/paused/replaying/errored/batch states all reset; same-model Reset reconstructs the complete world, inputs, seed and UI |
| T21 | Delayed old worker/LLM/analysis/export responses cannot alter a new generation; rapid AI -> Library -> AI resolves correctly |
| T22 | Hidden controls, queues, ledgers, actor memory, PRNG state, comparisons, caches and charts reset; saved history never automatically hydrates |
| T23 | Active-result labels bind model/version/config/run; stale-data and new-model-title combinations never render |
| T24 | Explicit saved-scenario loading validates a complete matching version; incompatible data reject instead of merging |
| T25 | Paired-difference arithmetic, valid-pair counts, missing runs, zero denominators and synthetic uncertainty examples match hand calculations |
| T26 | The planning count is 16,000 trajectories / 17,280,000 ticks; smaller actual experiments record their real counts and precision |
| T27 | Invalid computational runs remain visible and distinct from valid modeled insolvency; selected conclusions withstand or disclose missingness |
| T28 | P0/P1 typed actions obey the same gates; P2 invalid/late outputs cannot gain authority; P3 replay rejects the wrong model/config |
| T29 | P2 is clearly disabled without an approved adapter; retries, failures, model IDs and real cost caps remain visible and survive reset |
| T30 | Keyboard/model-switch focus, reset announcement, table alternatives, reduced motion, and non-color status cues work in both models |
| T31 | All visible numerical results trace to a run/metric definition; no prior or fabricated result is displayed before a new run |
| T32 | Export/import and quota/corruption failures preserve scientific identity or fail explicitly; current private data/credentials are absent |
| T33 | The research website, audit snapshot, papers, and PDF remain unchanged by study implementation until separate publication approval |
| T34 | The first release cannot pass on library-only tests; the default direct AI model and library model both run complete small experiments, reset in both directions, and produce inspectable negative/null outcomes |

Empirical validation is a separate research program: review actor/constraint fidelity with affected constituencies, collect appropriately consented evidence, calibrate on one sample, evaluate held-out patterns, and reject misspecified mechanisms. This release must label itself uncalibrated until that evidence exists.

## S14: Resource limits and operating profile

Reference interactive configuration must remain responsive through a worker, progress messages and cancellation. No large nested Monte Carlo batch starts on page load or model selection. A cost preview shows domain/population/horizon/settings/replications/arrangements/families/policy factors and planned trajectory count before execution.

Initial hard limits SHOULD be explicit configuration constraints: maximum 10,000 synthetic people, 10,000 domain objects, 36,000 ticks/run, and a reviewed event/artifact budget. These are safety/engineering limits, not statistically justified sample sizes. If a domain parameter allows a combination exceeding a global budget, validation explains that combination rather than truncating actors.

Performance release tests measure wall time, memory, serialization cost, worker cancellation, and UI responsiveness on a recorded machine/runtime. No universal milliseconds-per-tick claim is made before benchmarking. A budget-limited run ends with `budget-exhausted`, not a completed result.

The initial public-facing execution surface, if separately approved, is synthetic P0/P1/replay only. A research batch runner can be local and headless; a cloud deployment is not required to validate the architecture.

## S15: Review gates and sources

### Decisions fixed for this specification

- The direct AI Commons Collective as the default model and library OER as its second domain validation case, in one model registry and review interface; the observation network is deferred.
- Complete model-dropdown reset, including old asynchronous responses and hidden state.
- Explicit daily reference tick, process schedules, versioned deterministic kernel, optional nondeterministic action proposals.
- Protected money/rights and domain-specific outcomes; no universal data value or agency score.
- Repository-only documentation now; no implementation, live spend, personal data, or new website page in this task.

### Decisions requiring review before implementation or live use

Illustrative parameter bounds/defaults; local legal/rights assumptions; counterparties and incentives; monetary principal/agent treatment; metric thresholds; exact parameter dependence/sampling distributions; reference numeric/PRNG implementation; compute budgets; and P2 provider/data permissions. These are not solved by passing schema validation.

### Sources

- **R1:** [CONCEPT-IDEA.md](CONCEPT-IDEA.md), including the pinned Mariupol, India-EvacSimulation, War-Games comparisons and M1-M6 methodology references. No external simulator was executed for those comparisons.
- **R2:** [Research report](../research/report.md), [library institutional example](../papers/institutional-blueprint-example.md), [open-work register](../research/open-work.json), and [sector profile](../templates/sector-profile.json). AI and library defaults here are new synthetic fixtures, not numbers inferred from those papers.
- **R3:** Blackman/Vigna [PRNG reference site](https://prng.di.unimi.it/) and [xoshiro128** reference](https://prng.di.unimi.it/xoshiro128starstar.c), accessed 19 September 2026. These inform the proposed reproducible generator choice, not empirical agent behavior or security guarantees; source/license attribution is required if implementation code is reused.
- **R4:** Existing [arithmetic tests](../test/model.test.mjs), [operator accounting tests](../test/operator-economics.test.mjs), and [usage method](../usage/README.md). They are reusable invariants and historical boundaries, not evidence that this new simulator is implemented.

The [plan](PLAN.md) sequences delivery and review. The [backlog](BACKLOG.md) maps each deliverable to these requirements and tests. Neither confers authority to deploy real institutions or implies completed engineering work.
