# Commons Collective Simulation Lab: implementation backlog

- **Version/date:** 0.1 / 19 September 2026
- **Status of every item:** proposed / not started
- **Scope:** `ai-commons` as the default direct model and `library-oer` as the second validation model; no required environmental-observation module
- **Authority:** documentation requested; implementation, real API spending, empirical data, and public deployment still require their applicable gates
- **Sources of truth:** [SPECIFICATION.md](SPECIFICATION.md) for behavior; [PLAN.md](PLAN.md) for delivery sequence

`MUST` is required for the synthetic two-model prototype. `GATED` is required only when the separately authorized live-agent capability is pursued. Owners below are roles, not assigned people.

## B01: Freeze scope and reviewed defaults

- **Priority/phase:** MUST / PH0
- **Depends on:** none
- **Owner role:** research/model lead with institutional and verification reviewers
- **Specification/tests:** S01-S07, S15; prepares T01-T18
- **Deliverable:** decision record accepting or revising both domain models, actor/observation boundaries, illustrative defaults, rights assumptions, numeric conventions, and implementation authority.
- **Acceptance:** the AI Commons model is the default; library is a robustness case; observations are deferred. No unresolved mandatory rule is silently assigned a legal approval. Review confirms no simulator/experiment has run merely because this backlog exists.

## B02: Model registry, parameter metadata, and complete factories

- **Priority/phase:** MUST / PH1
- **Depends on:** B01
- **Owner role:** engine engineer
- **Specification/tests:** S02-S03, S09; T01-T02
- **Deliverable:** exactly two registered versioned model definitions, complete immutable default bundles, parameter metadata, fresh configuration/world/UI factories, and runtime validators.
- **Acceptance:** unknown fields/model IDs reject; counts/units/probabilities/overflow/dependencies validate; inactive-domain keys are impossible; every parameter declares `model-default` reset behavior. Two sessions share no mutable nested defaults.

## B03: Tick scheduler and phase-commit kernel

- **Priority/phase:** MUST / PH1
- **Depends on:** B02
- **Owner role:** engine engineer
- **Specification/tests:** S04; T03-T06, T08
- **Deliverable:** world ticks, phase snapshots, due-event queues, process cadences, deterministic conflicts, idempotent recurring events, and explicit terminal-boundary treatment.
- **Acceptance:** tick 30 expiry denies tick 30 use; initialization does not repeat; terminal payables remain visible; headless/step/pause/display speeds yield identical committed states. Finer ticks convert hazards rather than multiplying their frequency accidentally.

## B04: Named random streams and artifact identity

- **Priority/phase:** MUST / PH1
- **Depends on:** B02
- **Owner role:** engine engineer / verification reviewer
- **Specification/tests:** S03-S04, S12; T03, T07-T08
- **Deliverable:** reviewed PRNG/reference attribution, seed derivation, versioned transforms, named actor/process/event streams, canonical scientific hashes, and checkpoint state.
- **Acceptance:** golden vectors pass; worker order cannot change draws; extra endogenous events do not shift paired exogenous shocks. Scientific hashes exclude display/wall-time metadata, and exact-versus-tolerant numeric claims are documented.

## B05: Protected ledgers and accounting parity

- **Priority/phase:** MUST / PH1
- **Depends on:** B02-B03
- **Owner role:** engine engineer with finance reviewer
- **Specification/tests:** S05; T06, T09
- **Deliverable:** cash, receivables/payables, agency restrictions, commons restrictions, rounding, transfers, source-of-funds, arrears and insolvency transitions.
- **Acceptance:** existing toy and annual operator fixtures reconcile without being merged into a domain budget. Contributor liability/residue stays protected; internal transfers eliminate once; a cash shortfall is never repaired with restricted funds or hidden forgiveness.

## B06: Rights, mandates, governance, and complaints

- **Priority/phase:** MUST / PH1
- **Depends on:** B02-B03, B05
- **Owner role:** engine engineer with institutional reviewer
- **Specification/tests:** S04-S05; T05, T10-T11
- **Deliverable:** purpose/version authority gates, membership-role separation, scoped expiry/withdrawal, quorum/approval denominators, conflict rules, affected-party review and funded complaint queues.
- **Acceptance:** no purchase, vote, token, or membership creates missing authority. Open permissions survive where applicable. Zero eligible voters do not approve decisions. Unfunded remedies remain visible rather than being declared resolved.

## B07: Behavioral families and deterministic/stochastic adapters

- **Priority/phase:** MUST / PH1
- **Depends on:** B03-B04, B06
- **Owner role:** model lead / engine engineer
- **Specification/tests:** S04; T11, T28
- **Deliverable:** F0/F1 decision policies and P0/P1 action adapters using the same scoped observations and typed action validation.
- **Acceptance:** refusal is a valid action; budget/rights constraints precede preferences; zero-budget/zero-denominator handling is explicit; adaptation uses observed evidence only. Neither family silently changes accounting or gives one institutional arrangement privileged information.

## B08: Direct AI procurement and switching

- **Priority/phase:** MUST / PH2
- **Depends on:** B05-B07
- **Owner role:** AI-domain implementer
- **Specification/tests:** S06; T12, T14
- **Deliverable:** synthetic AI consumers/providers, retail versus collective offers, funded commitments, capacity, bounded negotiation rounds, provider selection, service tasks, renewals and actual switch events.
- **Acceptance:** 1,000-commitment quote is 1,633,000 cents under the hand-check inputs; A3 full price exceeds retail by 33 cents before switching. Final charges reconcile to actual commitments. Export/activation/cost are required for a completed switch; changing an ID alone does not count.

## B09: Authorized contributions and commons funding

- **Priority/phase:** MUST / PH2
- **Depends on:** B08
- **Owner role:** AI-domain implementer with rights/finance reviewers
- **Specification/tests:** S05-S06; T09, T12-T14
- **Deliverable:** multidimensional knowledge objects, scoped offers, provider willingness-to-pay from observed incremental value, private-context isolation, maintained-service costs, contributor payouts, and independent commons allocation.
- **Acceptance:** the correct-belief zero-value fixture yields no paid contribution demand. Denied authority blocks even a profitable offer. Duplicate coverage is not purchased twice. A3's fee-based covenant produces the stated 30,000-cent operator deficit in the fixture without using protected money.

## B10: Direct AI model integration and negative cases

- **Priority/phase:** MUST / PH2
- **Depends on:** B08-B09
- **Owner role:** verification reviewer / AI-domain implementer
- **Specification/tests:** S06, S11; T12-T14, T18
- **Deliverable:** small complete AI scenarios and traces covering A0-A3, F0/F1, P0/P1, no deal, no contribution demand, withdrawal, failed switch, late payment, and institutional wind-down.
- **Acceptance:** buyer benefits, contributor receipts, operator cash, and commons work are separate outcomes. No universal data dividend or guaranteed governance premium appears. The central model can explain a null or loss as clearly as a gain.

## B11: Library resource and maintenance dynamics

- **Priority/phase:** MUST / PH2
- **Depends on:** B05-B07
- **Owner role:** library-domain implementer
- **Specification/tests:** S07; T16-T17
- **Deliverable:** OER versions, eligibility, accessibility needs, defects, observations, work queues, finite maintainer capacity, delays, repair success/failure, and task outcomes.
- **Acceptance:** no actor reads hidden defects without permitted evidence; duplicate work is not created to exhaust budget; unfilled and failed work remain distinct. No learner records or real learner tracking enter the model.

## B12: Library procurement, payments, and renewal

- **Priority/phase:** MUST / PH2
- **Depends on:** B11
- **Owner role:** library-domain implementer with finance reviewer
- **Specification/tests:** S07; T15-T17
- **Deliverable:** direct/pooled orders, service fees, vendor and contributor costs, covenant payments, affordability and observed-quality renewal.
- **Acceptance:** A0/A1/A2 hand-check totals are 432,000 / 372,000 / 462,000 cents respectively. Labor cost is not charged twice; zero tasks do not mean perfect quality; the A2 full-cost loss and A3 cash deficit remain observable.

## B13: Two-model conformance suite

- **Priority/phase:** MUST / PH2
- **Depends on:** B10, B12
- **Owner role:** verification reviewer
- **Specification/tests:** S01-S07; T01-T18, T34
- **Deliverable:** one common contract suite applied to both modules plus domain-specific transition fixtures.
- **Acceptance:** each module has different typed state/events/metrics; shared rights/ledger tests behave identically where rules match. A library-only implementation or cosmetic reskin fails the gate. Both models can complete small runs with null/negative outcomes.

## B14: Active-scenario root store and reset transaction

- **Priority/phase:** MUST / PH3
- **Depends on:** B02-B03; final integration requires B13
- **Owner role:** interface engineer / engine engineer
- **Specification/tests:** S09; T19-T20, T22
- **Deliverable:** one active root state, deep-cloned model defaults, atomic replacement, generation invalidation, and Reset selected model.
- **Acceptance:** modify every valid configurable leaf and representative runtime state in AI, switch to Library, then return: each selection equals a fresh reference session. Hidden values, clocks, ledgers, actor memory, RNG state, queues, comparison and chart state do not survive.

## B15: Worker, agent, and analysis cancellation barriers

- **Priority/phase:** MUST / PH3
- **Depends on:** B14
- **Owner role:** interface/engine engineer
- **Specification/tests:** S09, S12; T21-T23, T29
- **Deliverable:** worker termination/request abort plus generation/model/version/config/run guards on every asynchronous path.
- **Acceptance:** adversarial out-of-order completions during AI -> Library -> AI cannot mutate the current state, label, export or chart. Tests must include callbacks that ignore cancellation. Real audit charges remain recorded even when a response becomes stale.

## B16: Registry-driven model dropdown and controls

- **Priority/phase:** MUST / PH3
- **Depends on:** B14-B15
- **Owner role:** interface engineer
- **Specification/tests:** S03, S09-S10; T19-T24, T30
- **Deliverable:** exactly two choices with AI default, complete parameter controls, evidence/units/constraints, Save scenario, reset disclosure, and accessible reset announcements.
- **Acceptance:** no environmental-model option; no automatic rerun or external call on switch; every new registered input joins reset tests automatically. Unknown model IDs show an error, never a fallback. Returning to a model never auto-restores prior edits.

## B17: Fixed-count experiment runner

- **Priority/phase:** MUST / PH4
- **Depends on:** B04, B13, B15
- **Owner role:** engine engineer / research lead
- **Specification/tests:** S08, S14; T07, T25-T27
- **Deliverable:** parameter settings, replications, arrangement/family dimensions, matched exogenous streams, budget previews, progress, cancellation, and explicit run statuses.
- **Acceptance:** one-domain default batch plans 160 trajectories; the documented large two-domain envelope is 16,000. Actual run counts match the selected manifest. No unapproved adaptive stopping, silent clipping, failed-run deletion, or automatic large launch occurs.

## B18: Metrics, paired analysis, and uncertainty

- **Priority/phase:** MUST / PH4
- **Depends on:** B17
- **Owner role:** research/model lead with verification reviewer
- **Specification/tests:** S08, S11; T25-T27, T31
- **Deliverable:** typed domain metrics, shared outcome vector, paired differences, Monte Carlo error, cohort distributions, valid-pair/missing-run reports, and explicit zero-denominator states.
- **Acceptance:** AI tasks and OER work are not pooled into a fake universal quality score. A zero baseline does not produce a fabricated percentage. Insolvent institutions remain valid outcomes; corrupt computations are separate. Hand-calculated statistical fixtures pass.

## B19: Explanatory views and tick replay interface

- **Priority/phase:** MUST / PH4
- **Depends on:** B16, B18
- **Owner role:** interface engineer
- **Specification/tests:** S10-S11; T04, T23, T30-T31
- **Deliverable:** tick/phase timeline, actor/rights/flow diagram, separate ledgers, distributions, comparison panels, AI contribution/procurement view, and library accessibility/defect/work-queue view.
- **Acceptance:** every displayed value has matching model/config/run/metric identity. No values appear before execution; switched-model results clear immediately. Diagnostic latent truth is labeled and never enters actor observations.

## B20: Immutable storage, exports, and explicit loading

- **Priority/phase:** MUST / PH4
- **Depends on:** B04, B14, B18
- **Owner role:** engine/interface engineer
- **Specification/tests:** S09, S12; T24, T32
- **Deliverable:** versioned JSON/JSONL artifacts, immutable saved history, explicit scenario import, hashes, quota/corruption handling and synthetic-data boundary.
- **Acceptance:** importing a saved scenario is an explicit full validated load after the reset barrier, never a partial merge. Corrupt/version-incompatible artifacts reject with a clear reason. Dropdown selection never silently hydrates saved state.

## B21: Recorded-action replay and P2 adapter contract

- **Priority/phase:** MUST / PH5
- **Depends on:** B07, B15, B20
- **Owner role:** engine engineer / verification reviewer
- **Specification/tests:** S04, S12; T28-T29
- **Deliverable:** P3 trace replay, bounded P2 action/observation interface, timeout/refusal/error policy, and explicit unavailable-mode UI.
- **Acceptance:** replay validates original tick/phase/config/observation identity; wrong-model recordings reject. Without an approved provider adapter, P2 is visibly disabled and never impersonated by synthetic behavior.

## B22: Optional live generative-agent adapter

- **Priority/phase:** GATED / PH5
- **Depends on:** B21 and explicit provider/data/spend authorization
- **Owner role:** adapter engineer with release/spend approver
- **Specification/tests:** S04, S12; T21, T28-T29, T32
- **Deliverable:** local/headless real-model calls, model/prompt/harness provenance, typed actions, aggregate usage, append-only cost records, budget caps, and recorded actions for replay.
- **Acceptance:** no browser credentials, raw private input, or agent ledger authority. Late/invalid outputs are rejected. Scenario reset cannot erase incurred cost or evade the global cap. Live responses are not advertised as reproducible merely because a seed exists.

## B23: Accessibility, bounded execution, and performance

- **Priority/phase:** MUST / PH6
- **Depends on:** B13, B16-B21
- **Owner role:** interface engineer / verification reviewer
- **Specification/tests:** S10, S12-S14; T30-T32
- **Deliverable:** keyboard/table/reduced-motion checks, recorded-machine benchmarks, event/artifact budgets, cancellation tests and visible exhaustion states.
- **Acceptance:** both model defaults are profiled; UI remains interruptible; budget exhaustion is not completed success. Export/storage failure is explicit. No performance claim is made without recording the workload/runtime.

## B24: Independent model review and reproducibility bundle

- **Priority/phase:** MUST / PH6
- **Depends on:** B13, B18-B21, B23; B22 only for a separately approved live-agent release
- **Owner role:** independent verification and institutional reviewers
- **Specification/tests:** S11-S15; T01-T34
- **Deliverable:** ODD-informed model description, TRACE-informed verification evidence, parameter provenance, small reproduced experiments for both domains, sensitivity limits, and unresolved empirical questions.
- **Acceptance:** reviewers can reconstruct positive, negative and null cases; no covert dependence on an agent's hidden truth or an unpriced subsidy. Two synthetic models are not claimed to validate real human behavior or legal authority.

## B25: Release boundary and explicit publication decision

- **Priority/phase:** MUST / PH6
- **Depends on:** B24
- **Owner role:** release approver / maintainer
- **Specification/tests:** S01, S12-S15; T33-T34
- **Deliverable:** reviewed synthetic prototype release decision, supported-mode disclosure, and separate decision on whether/where to publish a simulator.
- **Acceptance:** existing research/audit/PDF behavior remains intact; no automatic study navigation link, private-data exposure, or unsupported live-agent promise. No model is omitted to meet a release date. If approval is absent, keep the prototype repository/local only.

## Traceability and completion rule

| Requirement family | Backlog coverage | Mandatory tests |
|---|---|---|
| Central AI problem and two actual domain models | B01, B08-B13 | T12-T18, T34 |
| Schemas, complete defaults, clocks, deterministic state and randomness | B02-B04 | T01-T08 |
| Rights, roles, governance and financial integrity | B05-B07 | T05-T11 |
| Every-variable reset and late-response isolation | B14-B16 | T19-T24 |
| Monte Carlo, uncertainty, metrics and honest failure reporting | B17-B19 | T25-T27, T31 |
| Storage, replay, optional real agents and real cost | B20-B22 | T24, T28-T29, T32 |
| Accessibility, performance, review and publication boundary | B23-B25 | T30-T34 |

An item is complete only when its deliverable exists, its acceptance evidence is recorded, its dependencies are complete, and a reviewer accepts any applicable caveats. Documentation creation does not complete implementation items. Conditional B22 may remain explicitly unapproved without mislabeling the P0/P1/P3 prototype as a live-agent release.
