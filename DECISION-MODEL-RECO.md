# Decision-model recommendation: eligibility-first evidence discovery

Date: 2026-10-11. Status: proposed research experiment.
Scope: this repository's research workflow. Public-source-only assessment.

## Existing principles

Reviewed [README](https://github.com/Ethical-Tech-CoLab/commons-collective/blob/6de0faa59d112f0ffb7af8e9f5f0673cdd7f6898/README.md)
and the beginning of
[source records](https://github.com/Ethical-Tech-CoLab/commons-collective/blob/6de0faa59d112f0ffb7af8e9f5f0673cdd7f6898/research/sources.json),
revision `6de0faa59d112f0ffb7af8e9f5f0673cdd7f6898`.
This is a document/schema sample, not a full governance-system review.

The discussion draft preserves attribution, consent and legal caveats, with
claims, limits and access dates in source records. Eligibility must be
established before relevance ranking.

## Recommended architecture

```text
authoritative authorization/eligibility filter
    -> retrieval of permitted assets
    -> optional semantic relevance ranking
    -> human review with attribution and limitations intact
```

Possible bounded outputs: topical relevance, clause category, source supports /
contradicts / does not establish a claim, or insufficient information.
Retain source IDs, claim text, limitations and dates alongside each assessment.

No model output establishes consent, ownership, membership, compensation
eligibility or permission to share data. Do not infer rights from similarity
or drop a source's caveats to improve apparent answer quality.

## Candidate methods

Start with the existing source taxonomy and lexical retrieval. Compare a
licensed local reranker, Jev's
[reranking](https://docs.typesafe.ai/cookbooks/rerank_typesafe.md) and
[citation-checking](https://docs.typesafe.ai/cookbooks/citation_check.md)
patterns, Microsoft-Decision-1 and Sage only where the asset's license and
governance permit processing by that endpoint.

The proprietary named models have no publicly offered exact local weights in
the researched documentation. A local model is a distinct candidate and does
not remove obligations concerning consent, purpose and retention.

## Evaluation

Use query/source-family-disjoint examples with relevant-but-ineligible assets,
outdated clauses, ambiguous permissions, conflicting claims and essential
caveats. Evaluate retrieval/ranking only among already permitted items.

Measure eligible-candidate recall, NDCG, support false acceptance, lost-caveat
rate, calibration, reviewer burden and total cost per accepted research record.
Test that excluded assets never enter model context or output. This invariant
is an authorization property, not a statistical accuracy target.

Go/no-go requires zero authorization-filter bypasses in regression tests and
owner-approved quality/error bounds for the semantic layer. No governance
action may depend solely on a model classification.

## Pilot

Use public research assets first; keep annotations derived and reversible.
Shadow mode should have no influence on rights or payments. Measure added
review value before replacing any existing process. No saving is yet measured.
