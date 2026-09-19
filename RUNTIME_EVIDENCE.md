# CommitGate Runtime Evidence Record

This ledger records the final StudioNet run performed through the production Vercel UI on 2026-09-19. A consensus status alone is not treated as proof: successful cases include accepted contract state, while rollback cases include the transaction hash and exact contract reason.

## Deployment under test

```text
Network: GenLayer StudioNet (61999)
Contract: 0xe8999d51e91B8b7Ee82CeF530B1620236B84828F
Live UI: https://commit-gate.vercel.app/
Verification UI: https://commit-gate.vercel.app/?verify=1
```

## Runtime specimen

```text
Agreement name: Final Review 0919
Agreement ID: dfba97c31a292339208b243a44fa623e06750ed9c8f96807fef44460df45df19
Creator: 0x6276095FAEA15108740445ff277fdA8c304657F4
Promisee: 0x037f58E33c1Ec8fdA272361E0aAC1e31054a1CDE
Isolation wallet: 0x146e44881d35814bA582D265AF5b97ef2695ec8e
```

## Evidence ledger

| Case | Caller | Evidence | Authoritative result | Status |
|---|---|---|---|---|
| Create agreement | Creator | Final UI accepted-state read | `OPEN`, TESTABLE `0`, SUBMITTED `0`, BOUND `NO` | PASS — state evidence |
| Vague commitment | Creator | Final UI accepted-state read + append-only history | `COMMITMENT_NO_FAILURE_STATE`; TESTABLE `0`, SUBMITTED `1` | PASS — state evidence |
| Testable commitment | Creator | [`evidence/01-semantic-history.png`](evidence/01-semantic-history.png) | `COMMITMENT_TESTABLE`; history contains #1 and #2; TESTABLE `1`, SUBMITTED `2` | PASS |
| Exact replay | Creator | [`evidence/02-exact-replay-blocked.png`](evidence/02-exact-replay-blocked.png) | Preflight found the existing content-derived ID and blocked a duplicate transaction; counters/history stayed unchanged | PASS — deterministic UI guard |
| Bind after TESTABLE | Creator | [`0x625c62cf…a0a268`](https://explorer-studio.genlayer.com/tx/0x625c62cf71918ae68a8c73f161ab7870b665783f99387b06d37db36b89a0a268), [`evidence/03-bound-state.png`](evidence/03-bound-state.png), [`evidence/04-bind-explorer.png`](evidence/04-bind-explorer.png) | Explorer: `bind_agreement`, execution `SUCCESS`, result `Return`; accepted state `BOUND`, TESTABLE `1`, SUBMITTED `2` | PASS |
| Unauthorized submit | Isolation wallet | [`0xf2563dbc…18e626`](https://explorer-studio.genlayer.com/tx/0xf2563dbc432588d56e15be9070a943c23dffd583b7f40136ca91fcaf8218e626), [`evidence/05-unauthorized-submit.png`](evidence/05-unauthorized-submit.png) | Rolled back: `Only agreement creator may submit commitments`; accepted state stayed `BOUND`, `1/2` | PASS — expected rollback |
| Unauthorized bind | Isolation wallet | [`0xc2bda4f6…49abee`](https://explorer-studio.genlayer.com/tx/0xc2bda4f67e42a2076e9628fbbe6d4f697335e7be1b9686f86aa17f1b9249abee), [`evidence/06-unauthorized-bind.png`](evidence/06-unauthorized-bind.png) | Rolled back: `Only agreement creator may bind agreement`; accepted state stayed `BOUND`, `1/2` | PASS — expected rollback |

The create, vague and testable transaction hashes were not retained in the supplied capture set, so this file does not invent them. Their accepted post-state and ordered on-chain records are visible in the final UI evidence. The bind and both role-guard cases include direct Explorer transaction links.

## RPC-size regression evidence

The unsigned StudioNet probe reproduced the failed oversized read and verified the real write path:

```text
compute_commitment_id, vague 84 chars:  payload 194 bytes -> OK
compute_commitment_id, positive 160:   payload 272 bytes -> FAIL -32603
submit_commitment, vague 84 chars:      estimateGas -> OK 0x7a120
submit_commitment, positive 160 chars:  estimateGas -> OK 0x7a120

submit_commitment 200 chars: payload 308 bytes -> OK 0x7a120
submit_commitment 300 chars: payload 408 bytes -> OK 0x7a120
submit_commitment 400 chars: payload 508 bytes -> OK 0x7a120
submit_commitment 600 chars: payload 708 bytes -> OK 0x7a120
```

This proves the incident was the removed `compute_commitment_id` read path, not the contract write. Production now derives IDs locally with byte-for-byte parity tests.

## Evidence boundary

- `?verify=1` exposes deliberate non-creator probes; the normal product URL remains unchanged.
- The verifier never bypasses authorization. It submits the real write and reports the finalized contract rollback.
- Both rollback probes left the accepted agreement state and append-only attempt count unchanged.
- No claim is made that CommitGate verifies performance, fairness, legal enforceability or external facts.
