# AI usage audit

This is a **bounded, aggregate-only production snapshot**, not a billing report
or an automatically live meter. It uses the CoLab
[usage-calc](https://github.com/Ethical-Tech-CoLab/usage-calc) calculation modules
at commit `d688a913d298cec5cca722d73c328f756b3dd685`.

## Scope

- Project: Commons Collective.
- Material reference: commit `6ed823c3f96a8760c0b6d4e5664326d21af5b4da`.
- Exclusive cutoff: **2026-09-20T19:50:27.262Z**, the start of the refresh request.
- Selection: exact normalized working-directory match in one local Copilot
  session store, including embedded delegated-agent records.
- This includes earlier audit creation and subsequent scoped project work,
  but excludes producing this refresh and later activity. Other machines,
  missing telemetry, and unlogged work are not established.

`ai-usage.json` is the public snapshot. `audit-config.json` records the scope,
cutoff, material reference, and reviewed model-ID allowlist. It contains no
local paths or raw session identifiers.

The refreshed snapshot contains 1,164 requests: 1,153 recorded as `gpt-6-astra`
and 11 as `gpt-5.4-mini`, with 24 embedded delegated agents. Charges reconcile
to a USD equivalent of $888.8366194, not an invoice. The original 401-request
snapshot is preserved in [history/2026-09-19.json](history/2026-09-19.json)
with its [original configuration](history/2026-09-19-config.json).
That schema-v1 snapshot retains its original cutoff and has no new human-time
estimate. Its [original capture adapter](https://github.com/Ethical-Tech-CoLab/commons-collective/blob/6ed823c3f96a8760c0b6d4e5664326d21af5b4da/scripts/capture-ai-usage.py)
is available at the material revision preceding this refresh.

## What is reused

The original `store.py`, `metrics.py`, and `intervals.py` calculations are
vendored without changes, with their MIT license and normalized checksums in
`vendor/usage-calc/UPSTREAM.json`. The only package adaptation is a minimal
initializer to avoid importing unused dashboard features.

The collector uses a **read-only SQLite transaction**, selects usage rows before
the cutoff, and passes only that metadata to usage-calc in memory. It invokes:

- `store.load_events(..., strict=True)` for per-record charge reconciliation;
- `metrics.group` for model and role aggregation;
- `intervals.busy_union` for overlap-aware request time.
- `intervals.sitting_intervals` and `intervals.span` for the declared
  sitting-union and non-model residual inference.

It never invokes prompt-label, conversation, all-project export, catalogue, or
energy-estimation functionality.

## Interpretation

Price-bearing `token_details_json`, not flat token columns, supplies the
channels and their rates. Differences between these representations are
reported; they do not imply that the requests failed. Every selected record's
calculated charge must equal its stored charge.

Nano-AIU is retained as an exact decimal integer string. The USD equivalent uses
the upstream assumption of one billion nano-AIU per AI credit and USD 0.01 per
credit. **This does not measure an invoice, subscription spending, allowances,
or charged premium requests.** Rates are taken per record, not guessed from a
model name or a blended average.

Cached traffic is not unique authored content. Reasoning metadata is shown
separately and is not added to the priced-channel total. Request counts are
ledger events, not human messages. The model ID does not establish exact model
weights, revisions, or hidden routing.

Summed request duration is additive work across concurrent agents. The union
removes overlapping intervals using usage-calc's interpretation of the recorded
timestamp and duration. Neither measure is human attention, pure GPU time, or
energy consumption. Daily accounting uses UTC event dates.

## Dates and interaction-time proxy

The headline cards distinguish:

- **Start date:** earliest inferred request start, derived from recorded
  completion timestamp minus duration.
- **Last update:** snapshot capture time (`generatedAt`), not the last response
  or a claim that data extends through publication.
- **Days:** inclusive UTC calendar dates from first inferred request start to
  last included completion. Elapsed days and event dates are stated separately.
  These are not human workdays.
- **Elapsed model usage:** the union of all scoped request-active intervals,
  37,811,777 ms (10.50 hours after display rounding).
- **Summed model time:** 42,016,957 ms (11.67 hours), which counts concurrent
  work separately and must not be called elapsed time.
- **Interaction-time proxy:** the non-model residual inside merged sittings at
  an explicitly chosen completion-gap cutoff, not actual prompting, review,
  or measured human labor.
- **Author review:** a separate, revision-based required-review workload
  estimate described below, not the residual and not logged labor.

The 10-minute headline cutoff yields:

```text
47,748,477 ms engaged sitting union
  = 37,811,777 ms model-active union
  +  9,936,700 ms inferred human-side residual
```

That is 13.26 hours = 10.50 hours + 2.76 hours at displayed precision. Model
intervals cover all included requests, including delegated work; they are not
summed again by model or agent. All identities reconcile before rounding.

The unmodified framework groups requests by gaps between completion timestamps.
A sitting starts at its earliest request start and ends at its final
completion; overlapping sittings are unioned. Sensitivity is published at
2, 5, 10 and 30 minutes. For this snapshot the residual ranges from 1.97 to
3.75 hours. **This is not a confidence interval or a bound on actual human
time.** Tool waits, interruptions, and unattended automation can inflate it.
Reading after the final request and human work concurrent with the model can be
missed. Work on another project or another machine is not established.

No user-message, prompt, or response content is queried to obtain this estimate.
It is not an estimate of the hours a human would need to recreate the output.
The fixed UTC date boundary deliberately preserves this adapter's historical
daily grouping instead of adopting the upstream dashboard's local-date display.

## Author review and re-review workload

The audit now distinguishes substantive author review from API-gap inference.
Public Git history records which source sections changed. The declared policy
is **one contextual reading pass per version of each level-two section**,
including its preamble, through the same frozen material commit.

```text
baseline word exposures = latest source words
                        + prior-version words of changed/removed sections
reading minutes = (baseline exposures
                 + current words * extra-reread fraction * extra passes) / wpm
estimated review minutes = reading minutes + separately entered extra minutes
```

For example, a section growing from 100 to 200 to 300 words has 600 word
exposures, not 800. New sections are counted once, unchanged sections are not
counted again, and whitespace changes or heading renumbering add no pass.
A renamed section is recorded as removal/addition. Visible mechanical edits
also count as a new section version. This is a contextual-review policy,
not a claim that each small edit requires reading every word in practice.

The frozen main report has 20 committed revisions, **22,130 current source
words + 27,314 prior-version words = 49,444 word exposures**. At the reference
238 words/minute this is **3.46 hours**; 175-300 wpm gives **2.75-4.71 hours**.
The optional nine-document corpus totals 57,713 current words and 35,146
prior-version words, or 92,859 exposures (**6.50 hours** at 238 wpm).
These are reading-equivalent workloads, not measured hours, a lower bound on
actual labor, or evidence that the author completed those passes.

The pace reference is [Brysbaert (2019), *How many words do we read per minute?*
](https://doi.org/10.1016/j.jml.2019.104047). The reference and 175-300 wpm
sensitivity concern adult English silent nonfiction reading, not technical
review, fact-checking, comprehension, or editorial productivity. Pace is
editable; the interval is sensitivity, not a confidence interval.

The author reports rereading some sections 2-3 times. Revision passes may
already represent those reads, so **extra rereads default to zero**, not an
automatic 2-3 multiplier. Optional extra passes apply only to a declared
share of current text, never the entire historical exposure. Additional
checking, editing and reflection minutes are author-entered and must exclude
counted reading time. Blank extra minutes mean unquantified, not measured zero.

The corpus covers the main report, three public papers, and five named
simulation study documents. It excludes bibliography, citation markers, code
blocks, image pixels, generated-only tables, external-source reading,
uncommitted drafts, and changes after the frozen material commit. The
repository-only funding proposal is excluded. Source fingerprints and all
commit/section events are published in [review-history.json](review-history.json);
the website additionally generates `author-review.json` with editable defaults.
No private chat records are used to derive revision workload.

`scripts/capture-review-history.mjs` captures public history locally.
`scripts/review-corpus.mjs` validates section transitions, totals, provenance
and normalized method hashes at build time. Ordinary CI and website visits
reuse the committed artifact without accessing Git history or the ledger.
After deliberately changing a counting method or material boundary, run:

```powershell
node scripts\capture-review-history.mjs
```

Review is not merely prompting. Neither actual prompting nor actual review
time has been tracked. **Do not add review estimates to the model-active union
or interaction residual**: review can occur during either, or outside logged
sittings. Controls change only a local scenario, without uploading or rewriting
the audit. An author time log would be needed to report actual labor.

## Privacy and reproducibility

No prompts, responses, turn labels, paths, machine names, raw session or agent
IDs, or individual request rows are published. Only reviewed model IDs and
aggregate fields are allowed. Session identifiers are represented by hashes.
The selected-record digest commits to usage metadata, not prompt content; it is
not a provider signature or proof of the private ledger.
The snapshot also hashes the capture adapter and public configuration. A build
refuses a stale snapshot if either changed without recapture and review.

Readers can reconcile the published aggregates. Independently verifying the
original rows requires authorized local access; those records are not shared.

To refresh on the machine holding the ledger, with Python 3.8 or later:

```powershell
python scripts\capture-ai-usage.py
node scripts\capture-review-history.mjs
npm run build
npm run pdf
npm test
npm run test:pdf
```

The default ledger is the current user's `.copilot` session store, or the path
provided through `COPILOT_SESSION_STORE`. The collector also accepts `--db`,
`--scope-directory`, `--config`, and `--out`. Do not use another project's
working directory or combine unidentified machines.

To change the audited period, intentionally update the cutoff and material
reference in the config. Review new model identifiers before adding them to
`approvedModels`. Missing critical fields, unsupported channels, altered
upstream modules, or unreconciled charges stop capture rather than produce
success-shaped estimates.

Schema version 2 also requires explicit `timeInference` thresholds in the
configuration. Changing the collector or those assumptions requires recapture;
their hashes are bound to the public snapshot. Keep historical snapshots
immutable rather than retroactively changing their scope or interpretation.

When deliberately changing the audited period or accepted model set, review the
frozen-snapshot regression expectations as well as the new measurements. The
current assertions preserve the independently checked totals for this boundary.

The ordinary website build reads the committed snapshot and validates its
arithmetic and privacy schema. **GitHub Actions does not read a local ledger.**
Opening the public audit or overview only reads published data; it cannot collect
new private usage. Commit and push a reviewed snapshot to update the website.
