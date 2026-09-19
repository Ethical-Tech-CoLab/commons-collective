# Commons Collective Simulation Lab: delivery plan

- **Version/date:** 0.1 / 19 September 2026
- **Status:** proposed plan; no implementation milestone is complete
- **Authority:** the user requested the specification, plan, and backlog. This is not approval for live API spending, empirical data collection, public deployment, or institutional operations.
- **Companions:** [Concept](CONCEPT-IDEA.md), [Specification](SPECIFICATION.md), [Backlog](BACKLOG.md)

## 1. Objective and scope decision

Build one inspectable agent-based institutional laboratory with **two required domain models**:

1. **AI Commons Collective (`ai-commons`, default):** collective AI procurement, authorized contributor offers, provider response, scoped rights, actual switching, independent commons funding, and governance.
2. **Library-led open education (`library-oer`):** a validation case using resource defects, accessibility, contracted maintenance, institutional procurement, and renewal.

The second case tests portability of the institutional architecture; it is not the main mission. These are different domain dynamics within the same AI commons research program, not successive AI training iterations. The community environmental-observation idea is deferred and must not enter the initial dropdown, required tests, or delivery estimates.

Both models must support the same time-tick/accounting/rights contracts and all four arrangements A0-A3. Neither may pass as a cosmetic reskin of the other. A complete scenario switch resets all active variables and rejects old asynchronous results.

This plan ends at a reviewed synthetic research prototype. Empirical institutional validation is a separate, consented program.

## 2. Delivery principles

- Build verifiable transitions before animation and batch runs.
- Preserve exact financial invariants and hard rights gates in every policy mode.
- Implement the direct AI model before claiming the central question is represented.
- Exercise the library case early enough to expose abstractions that accidentally hard-code AI-specific state.
- Treat whole-state replacement and generation barriers as architecture, not a late UI cleanup.
- Use simple deterministic/seeded actors before introducing live generative calls.
- Keep model identity, institution, behavioral family, and P0-P3 execution mode as independent experiment factors.
- Prefer a transparent negative result over default parameters tuned to make the new institution win.
- Keep the research website, AI audit snapshot, and PDF separate until explicit publication approval.

## 3. Phase map and exit gates

### PH0 - Review and freeze the implementation contract

**Dependencies:** none beyond these documents.

**Work:**
- Review [S01-S07](SPECIFICATION.md#s01-scope-and-required-models): central AI problem, distinct library case, hypothetical rights regime, actor observations, costs, and numerical fixtures.
- Review the reset contract in [S09](SPECIFICATION.md#s09-model-dropdown-and-complete-reset-transaction), including saved-history retention versus active-state clearing.
- Confirm parameter definitions, bounds, monetary treatment, default clocks, PRNG/reference attribution, and safety budgets.
- Name accountable engineering/research reviewers by role; do not infer commitments from the report's participant list.
- Record open disagreements and any approved changes before implementation.

**Artifacts:** approved/revised specification version, parameter-review record, test inventory, and an explicit decision on implementation authorization.

**Exit gate:** both models and the central AI question are accepted as scope; no hidden real-data/API/deployment dependency; accounting fixtures reconcile; required unresolved decisions have owners.

**Stop condition:** if a rights/accounting assumption is unresolved, restrict the prototype to explicit synthetic fixtures or revise it. Do not silently label an uncertain legal regime as approved.

### PH1 - Shared kernel and trustworthy fixtures

**Depends on:** PH0.

**Work:**
- Implement model registry, validated immutable defaults, state factories, action/event records, and canonical artifact identities.
- Implement tick phases, process cadences, expiry boundaries, idempotent schedules, named randomness, checkpointing, and deterministic commit.
- Implement rights/mandate/role separation, governance denominators, ledgers, protected money, and explicit failure states.
- Implement F0/F1 with P0/P1 adapters and a common observation/action boundary.
- Reproduce existing toy settlement/operator fixtures without modifying their meaning.

**Exit gate:** T01-T11 pass. No active model state depends on browser frames, wall-clock timing, global random state, or untracked money. No domain model is yet claimed empirically valid.

**Parallelism:** schemas/ledger tests and clock/randomness tests can proceed independently after shared contracts are agreed. Merge only after event identity and state-commit semantics agree.

### PH2 - Direct AI model and library robustness case

**Depends on:** PH1.

**Work:**
- Deliver AI procurement, scoped contribution demand, privacy constraints, provider alternatives, meaningful switching, fees, commons funding, and provider/contributor/operator accounting.
- Reproduce AI quote, negative full-cost comparison, operator deficit, and zero-value contribution-demand fixtures.
- Deliver library resource/defect/accessibility transitions, observed maintenance queue, vendor/maintainer capacity, contracting, and renewal.
- Reproduce the library negative A2 comparison and demonstrate that rights/ledger behavior is shared rather than copied inconsistently.
- Run tiny deterministic examples to completion in both models, including no-deal, withdrawal, insufficient funding, and institutional failure.

**Exit gate:** T12-T18 pass alongside PH1 tests. Both models emit distinguishable domain state/events/metrics and inspectable traces. The default application model is AI Commons.

**Parallelism:** AI and library modules may be implemented by different contributors after PH1, using the same module contract. Neither contributor may modify shared rules independently to make its scenario pass.

**Stop condition:** if the library case requires hard-coded branching inside the shared ledger/tick engine, revisit the module boundary before adding more domains.

### PH3 - Scenario lifecycle, worker isolation, and reset-first UI

**Depends on:** PH1; complete model-specific integration requires PH2.

**Work:**
- Create the active-scenario store as one replaceable root with immutable configuration and model identity.
- Implement exactly two dropdown choices, Save scenario, and Reset selected model.
- Implement cancellation plus session-generation/model/config/run guards on every asynchronous path.
- Generate controls from parameter definitions; implement runtime-state factories rather than manual field-clearing lists.
- Separate immutable saved/audit history from the active view. Prevent automatic hydration after a switch.
- Exercise AI -> Library -> AI while running, paused, replaying, errored, and batch-completing.

**Exit gate:** T19-T24 pass. Every registered field is covered by generated reset tests. An old LLM/worker/chart response cannot appear under the newly selected model.

**Important:** cancellation alone is insufficient. A provider can return after abort; the generation barrier is the correctness mechanism.

### PH4 - Experiments, analysis, and explanatory views

**Depends on:** PH2 and PH3.

**Work:**
- Add fixed-count nested experiments, common exogenous random streams, paired comparisons, parameter grids, and held-out confirmation settings.
- Add domain-specific outcome definitions and the shared institutional outcome vector with valid denominators.
- Add distributions, cash/runway views, tick traces, actor/rights maps, comparisons, assumption displays, and downloadable manifests.
- Add clear invalid/canceled/insolvent/budget-exhausted statuses and missing-pair reporting.
- Run small experiments in both domains; include predetermined null/negative fixtures rather than cherry-picking positive configurations.

**Exit gate:** T25-T27 and T31 pass. Every number links back to model/config/run/metric identity. Cross-domain presentation never treats unlike quality units as interchangeable.

**Budget progression:** one hand-check -> a few deterministic runs -> one parameter setting with repeated stochastic runs -> small two-domain matrix -> larger design only after profiling. The 16,000-trajectory envelope is not the first run and is not a precision guarantee.

### PH5 - Replay and gated generative-agent experiments

**Depends on:** PH1-PH4.

**Work:**
- Complete P3 recorded-action replay and mismatched-record rejection.
- Deliver the P2 adapter contract and explicit disabled state when no approved adapter exists.
- If separately authorized, connect a local/headless provider adapter with typed actions, scoped observations, strict budgets, and recorded failures/usage.
- Compare selected generative roles with P0/P1 controls under matched arrangements; do not assign a better model only to the collective treatment.
- Test late responses during model switches, timeouts, invalid JSON/actions, refusal, and provider errors.

**Exit gate:** T28-T29 pass. Recorded replay is distinguished from regenerating live responses. Browser bundles contain no credentials; resetting a scenario does not reset real spending limits.

**Two delivery gates:** P0/P1/P3 synthetic prototype release does not require paid live calls. A P2 research release additionally requires provider/data permission, model/version documentation, an approved spend ceiling, and a documented experiment design. The UI must not advertise unavailable live behavior as implemented.

### PH6 - Independent checks, performance, and release decision

**Depends on:** PH1-PH5 contracts; paid P2 execution remains conditional.

**Work:**
- Run unit, integration, end-to-end, accessibility, race/reset, import/export, and parity checks.
- Profile both default scenarios on a recorded runtime/machine; test resource exhaustion and cancellation.
- Review role/authority/accounting fidelity separately from software correctness.
- Prepare a reproducibility bundle with small complete experiments in both models and declared limits.
- Check the original site/audit/PDF boundary and obtain explicit approval before any public simulator deployment.

**Exit gate:** T01-T34 pass for supported capabilities, with no library-only shortcut. Any conditional P2 behavior is visibly gated, not counted as executed validation. Research reviewers can trace both a gain and a failure/null case without reading the engine.

**Stop condition:** no public "validated institution" claim follows from this release. Calibration and prospective field comparison need their own protocol.

## 4. Dependency summary

```text
PH0: scope/defaults/contract review
  -> PH1: shared schemas, tick, randomness, rights, ledgers, policies
       -> PH2-AI: direct AI model -----+
       -> PH2-Library: second model --+-> PH4: paired experiments and analysis
       -> PH3: reset/store/worker ----+
                                      -> PH5: replay + gated P2
                                      -> PH6: independent release checks
```

PH3's store/race tests can begin with small model fixtures, but its completion gate uses both actual domain modules. PH4 cannot call an integration complete using only mocks. PH5 does not block the core synthetic prototype on an unnecessary paid provider.

## 5. Work and review roles

| Role | Responsibility | Independence boundary |
|---|---|---|
| Research/model lead | Hypotheses, parameters, behavioral alternatives, metric interpretation | Does not declare empirical validity merely because implementation fits assumptions |
| Engine engineer | State, ticks, PRNG, contracts, and ledgers | Cannot silently change institutional rules to resolve errors |
| Domain implementer(s) | AI and library dynamics | Use the shared contract; document domain-specific mechanisms |
| Interface engineer | Controls, complete reset, charts, accessibility | Cannot label old results as the new scenario |
| Verification reviewer | Fixtures, invariants, reproducibility, race and failure testing | Must challenge favorable and unfavorable results |
| Institutional/rights reviewer | Authority, representation, privacy, money custody, comparator credibility | A software role or simulated vote is not real legal approval |
| Affected-constituency reviewer | Missing burdens, refusal, access, exclusion, and usability | Participation should be supported; no person is presumed to agree |
| Release/spend approver | Publication boundary and optional real provider budget | Retains separate authority from scenario controls |

Names, commitments, fees, calendar estimates, and funding remain unassigned. This is a dependency-based plan, not an invented staffing commitment or delivery-date promise.

## 6. Risks that change the plan

| Trigger | Required response |
|---|---|
| Default AI scenario cannot express procurement, authorized contribution, and commons funding separately | Return to S06/PH2; do not substitute a library demo |
| Institutional advantage is encoded as a guaranteed discount/quality premium | Add a competing/null mechanism and rerun fixtures before analysis |
| Model switching leaks a hidden value or late result | Block release; fix whole-state identity rather than patching one visible field |
| Numerical/model results depend on frame rate or worker order | Return to clock/randomness/commit design |
| Annual surplus hides protected liabilities or month-to-month failure | Fix ledger/timing model before generating more charts |
| Live agents dominate cost or cannot be replayed | Keep baseline synthetic; reduce decision opportunities and record actions under a reviewed design |
| Larger sampling exceeds budget without adequate precision | Publish the shortfall; revise the design or stop, not label it converged |
| Another domain requires fundamentally different legal/measurement assumptions | Defer it and document the limitation; do not inflate initial scope |
| Public deployment would expose private evidence or real credentials | Do not deploy; use synthetic/local artifacts and a separate review |

## 7. Validation of this documentation stage

For the current documentation-only task, check links, requirement/test/backlog coverage, numerical hand-checks, absence of contradictory model IDs/defaults, and the public-build boundary. Existing Pages CI can confirm no regression to the published research.

Do **not** mark future tests, prototype milestones, empirical hypotheses, or backlog implementation items complete because these documents parse. The [backlog](BACKLOG.md) remains proposed until implementation is separately authorized.
