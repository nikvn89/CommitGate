# CommitGate Locked Specification

These invariants are part of CommitGate v1.0 and must not be weakened by a frontend or contract patch.

## Content-addressed identifiers

- `agreement_id` and `commitment_id` are content-addressed.
- Frontend ID derivation must be byte-identical to `contract/CommitmentTestability.py`.
- Text cleaning must match Python `str.strip()` and length prefixes must match Python `len()` (Unicode code points), not JavaScript `trim()` or UTF-16 `.length`.
- Exact commitment replay therefore resolves to the same ID and is rejected by contract state.

## Closed semantic verdict set

The semantic classifier may produce exactly two accepted verdicts:

```text
COMMITMENT_TESTABLE
COMMITMENT_NO_FAILURE_STATE
```

The frontend must display the authoritative stored verdict and must not invent or remap additional semantic outcomes.

## Deterministic bind gate

`bind_agreement` may succeed only after at least one commitment for that agreement is stored as `COMMITMENT_TESTABLE`. A `COMMITMENT_NO_FAILURE_STATE` record remains readable but does not open the bind gate.

## Deterministic prefilter

Before any model call, the contract rejects commitment text containing reserved prompt fences or reserved verdict labels. This prefilter must remain deterministic and must run before semantic evaluation.

## Confirmation architecture

Accepted-state matching is the primary transaction confirmation path. After a state-matching timeout, the frontend may perform one diagnostic leader-receipt read to expose a rollback reason; it must not replace state confirmation with receipt polling or automatically resubmit a write.
