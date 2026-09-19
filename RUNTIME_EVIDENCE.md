# CommitGate Runtime Evidence Record

This file is the evidence ledger for reviewer-reproducible on-chain runs. Do not replace `PENDING` with `PASS` until the transaction link and post-state have been captured from the final UI/deployment.

## Deployment under test

```text
Network: GenLayer StudioNet (61999)
Contract: 0xe8999d51e91B8b7Ee82CeF530B1620236B84828F
Live UI: https://commit-gate.vercel.app/
```

## Required transaction evidence

| Case | Wallet / role | Method | Parameters or input | Transaction hash | Execution result / exact rollback | Authoritative post-state | Status |
|---|---|---|---|---|---|---|---|
| Create agreement | Wallet A / creator | `create_agreement` | Agreement name + Wallet B promisee | PENDING | PENDING | Agreement exists, `OPEN`, counters `0/0` | PENDING |
| Vague commitment | Wallet A / creator | `submit_commitment` | Vague demo text | PENDING | PENDING | Stored verdict and counters copied from `get_agreement` / `get_commitment` | PENDING |
| Testable commitment | Wallet A / creator | `submit_commitment` | Testable demo text | PENDING | PENDING | Stored verdict and counters copied from `get_agreement` / `get_commitment` | PENDING |
| Bind after TESTABLE | Wallet A / creator | `bind_agreement` | Agreement ID | PENDING | PENDING | `bound = true`, state `BOUND` | PENDING |
| Exact replay | Wallet A / creator | `submit_commitment` | Byte-identical prior text | PENDING | PENDING — capture the verbatim rollback reason | Counters and attempt log unchanged | PENDING |
| Unauthorized submit | Wallet C / isolation | `submit_commitment` | Existing agreement ID + new text | PENDING | PENDING — capture the verbatim rollback reason | Counters and attempt log unchanged | PENDING |
| Unauthorized bind | Wallet C / isolation | `bind_agreement` | Existing agreement ID | PENDING | PENDING — capture the verbatim rollback reason | Agreement remains unbound or unchanged | PENDING |

## Capture checklist

For every row, save the Explorer URL, connected address, method and exact parameters, finalized execution result, and a fresh accepted-state read after the transaction. For rollback cases, copy the exact reason shown by the final UI together with the transaction hash. A consensus status alone is not sufficient evidence of unchanged contract state.

## Current evidence boundary

The supplied project notes describe earlier local and Vercel observations, but the package contains no transaction hashes for those observations. They are not silently promoted into this ledger. The rows above remain `PENDING` until the reviewer-grade artifacts are supplied.
