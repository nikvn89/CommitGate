# CommitGate — Project Testing

## Current deployment

```text
Network:  GenLayer StudioNet
Contract: 0xe8999d51e91B8b7Ee82CeF530B1620236B84828F
```

Explorer:

```text
https://explorer-studio.genlayer.com/address/0xe8999d51e91B8b7Ee82CeF530B1620236B84828F
```

## Test wallets used

```text
Creator / Wallet A:
0x6276095FAEA15108740445ff277fdA8c304657F4

Promisee / Wallet B:
0x037f58E33c1Ec8fdA272361E0aAC1e31054a1CDE

Isolation wallet / Wallet C:
0x146e44881d35814bA582D265AF5b97ef2695ec8e
```

## Observed local frontend runtime evidence

Agreement:

```text
name:
Hosting SLA

agreement_id:
9b6fe8cafa5d901438a83d81bcb99c2870a6ac0eea80163f220289239d364050
```

### 1 — Create agreement

Observed local frontend state:

```text
state = OPEN
TESTABLE = 0
SUBMITTED = 0
BOUND = NO
```

**Status: PASS — LOCAL FRONTEND**

### 2 — Vague semantic case

Submitted:

```text
The operator will respond to incidents in the manner warranted by operational needs.
```

Observed:

```text
COMMITMENT_NO_FAILURE_STATE
active = false
TESTABLE = 0
SUBMITTED = 1
BOUND = NO
```

Observed commitment id:

```text
857a605cbf8ca30bde1f0406fefc14f759fb0b9b33c6f3a0f5ab088edad1bc30
```

**Status: PASS — LOCAL FRONTEND**

### 3 — Deterministic bind gate before TESTABLE

Observed UI state:

```text
Bind agreement = disabled
Gate closed: Requires at least one TESTABLE commitment.
```

This matches the already-verified contract-level revert condition without spending an
additional frontend transaction.

**Status: PASS — LOCAL FRONTEND**

### 4 — Positive semantic case

Submitted:

```text
The operator must publish a post-incident report containing root cause, customer impact and corrective actions within five business days after incident closure.
```

Observed:

```text
COMMITMENT_TESTABLE
TESTABLE = 1
SUBMITTED = 2
BOUND = NO
```

Append-only history showed:

```text
#1 NO FAILURE STATE
#2 TESTABLE
```

**Status: PASS — LOCAL FRONTEND**

### 5 — Bind agreement

Observed final state:

```text
state = BOUND
TESTABLE = 1
SUBMITTED = 2
BOUND = YES
```

The button changed to:

```text
Agreement is BOUND
```

**Status: PASS — LOCAL FRONTEND**

---

## RLP regression diagnosis and fix

The included probe reproduced the frontend failure and isolated it from the contract write.

Observed probe:

```text
READ  get_agreement
RESULT OK

READ  compute_commitment_id (vague, 84 chars)
payload 194 bytes
RESULT OK

READ  compute_commitment_id (positive, 160 chars)
payload 272 bytes
RESULT FAIL
-32603 RLP string ends with 268 superfluous bytes

WRITE submit_commitment via estimateGas (vague)
RESULT OK

WRITE submit_commitment via estimateGas (positive)
RESULT OK
```

The probe found:

```text
compute_commitment_id crosses the problematic RPC-size boundary before the positive demo text.
submit_commitment itself remains a valid write.
```

Fix:

```text
The frontend no longer calls compute_agreement_id / compute_commitment_id through RPC.
It reproduces the contract's content-addressed keccak256 IDs locally in src/ids.ts.
```

The same positive 160-character commitment then completed successfully through the frontend.

**Status: PASS — REGRESSION FIX VERIFIED LOCALLY**

## Deterministic ID parity regression test

Command:

```text
npm test
```

Result from the packaged source on 2026-09-19:

```text
PASS: 8 parity cases, 15/15 production assertions green.
MUTATION PROOF: legacy trim()/length is red in 6/8 cases (12/15 ID assertions).
ON-CHAIN VECTOR: 9b6fe8ca…364050 -> 857a605c…bc30 PASS.
```

Coverage includes ASCII, emoji outside the BMP, extended Han outside the BMP,
`U+001F`, `U+0085`, `U+FEFF`, `U+001C`/`U+001E`, and the fixed real-data vector.

The extended unsigned `eth_estimateGas` probe for 200/300/400/600-character
`submit_commitment` inputs is included in `tools/probe-studio.mjs`. It was run against
StudioNet with Wallet A as the caller and returned:

| Text characters | Serialized payload | `eth_estimateGas` |
|---:|---:|---|
| 200 | 308 bytes | `OK 0x7a120` |
| 300 | 408 bytes | `OK 0x7a120` |
| 400 | 508 bytes | `OK 0x7a120` |
| 600 | 708 bytes | `OK 0x7a120` |

**Status: PASS — EXTENDED WRITE BOUNDARY**

---

## Current project checklist

| Test | Status |
|---|---|
| Create agreement from local dApp | PASS — LOCAL |
| Vague commitment -> NO FAILURE STATE | PASS — LOCAL |
| Bind gate closed before TESTABLE | PASS — LOCAL |
| Positive 160-char commitment -> TESTABLE | PASS — LOCAL |
| Append-only history shows both verdicts | PASS — LOCAL |
| Bind after TESTABLE -> BOUND | PASS — LOCAL |
| RLP regression no longer blocks positive submit | PASS — LOCAL |
| Exact replay through final UI | PASS — duplicate preflight, no state change |
| Wallet C unauthorized submit | PASS — on-chain expected rollback |
| Wallet C unauthorized bind | PASS — on-chain expected rollback |
| Wrong-chain switch UX in final build | NOT RUN |
| Account-change listener in final build | NOT RUN |
| Disconnect button / local session clear | IMPLEMENTED — provider revoke not separately captured |
| Final `npm run build` | PASS |
| Vercel `/api/rpc` reads | PASS — live accepted-state reads |
| Full Vercel flow | PASS |

---

## Transaction UX requirements retained

- no browser `waitForTransactionReceipt()` loop;
- no automatic write resubmission after a tx hash exists;
- writes lock while the current action is active;
- transaction submission and state confirmation remain separate UI phases;
- confirmation uses bounded accepted-state reads;
- frontend verdicts are never invented locally;
- account/network changes are handled through EIP-1193 listeners.

---

## Honest scope

The local PASS evidence proves the dApp integrated correctly with the deployed StudioNet
contract for the observed flow.

It does **not** prove:

- every natural-language commitment will converge identically;
- a TESTABLE commitment is fair or legally valid;
- any commitment was actually performed;
- any future deployment works before it is separately tested.

# Final Vercel runtime evidence

Live dApp:

```text
https://commit-gate.vercel.app/
```

GitHub:

```text
https://github.com/nikvn89/CommitGate
```

Contract:

```text
0xe8999d51e91B8b7Ee82CeF530B1620236B84828F
```

Runtime specimen:

```text
name = Final Review 0919
agreement_id = dfba97c31a292339208b243a44fa623e06750ed9c8f96807fef44460df45df19
```

## V1 — Create agreement on Vercel

Observed agreement:

```text
name = Final Review 0919
state = OPEN
TESTABLE = 0
SUBMITTED = 0
BOUND = NO
```

**Status: PASS — VERCEL**

## V2 — Negative semantic branch

Observed:

```text
CONFIRMED NO FAILURE STATE
TESTABLE = 0
SUBMITTED = 1
BOUND = NO
```

The bind gate remained closed.

**Status: PASS — VERCEL**

## V3 — Positive semantic branch

Observed:

```text
CONFIRMED TESTABLE
TESTABLE = 1
SUBMITTED = 2
BOUND = NO
```

The bind button became available.

**Status: PASS — VERCEL**

## V4 — Deterministic bind

Observed:

```text
CONFIRMED Agreement BOUND
state = BOUND
TESTABLE = 1
SUBMITTED = 2
BOUND = YES
```

The action button changed to:

```text
Agreement is BOUND
```

**Status: PASS — VERCEL**

Explorer transaction:

```text
https://explorer-studio.genlayer.com/tx/0x625c62cf71918ae68a8c73f161ab7870b665783f99387b06d37db36b89a0a268
```

## V5 — Exact replay guard

The byte-identical positive commitment was submitted again through the final UI. The
frontend recomputed the content-derived commitment ID, found the existing on-chain
record and stopped the duplicate before wallet signing:

```text
This exact commitment already exists. Exact-text re-rolls are blocked by the contract.
```

The attempt history stayed at two records and the counters stayed `1/2`.

**Status: PASS — FINAL UI / NO DUPLICATE WRITE**

## V6 — Unauthorized submit through the final dApp

Verification URL:

```text
https://commit-gate.vercel.app/?verify=1
```

Wallet C submitted the real `submit_commitment` call against the loaded agreement.

```text
tx = 0xf2563dbc432588d56e15be9070a943c23dffd583b7f40136ca91fcaf8218e626
rollback = Only agreement creator may submit commitments
```

After finalization, the accepted state remained `BOUND`, TESTABLE `1`, SUBMITTED `2`.

**Status: PASS — EXPECTED ON-CHAIN ROLLBACK**

## V7 — Unauthorized bind through the final dApp

Wallet C submitted the real `bind_agreement` call against the same agreement.

```text
tx = 0xc2bda4f67e42a2076e9628fbbe6d4f697335e7be1b9686f86aa17f1b9249abee
rollback = Only agreement creator may bind agreement
```

After finalization, the accepted state remained `BOUND`, TESTABLE `1`, SUBMITTED `2`.

**Status: PASS — EXPECTED ON-CHAIN ROLLBACK**

## Final project result

```text
Local frontend core flow: PASS
RLP regression fix: PASS
Vercel core flow: PASS
Exact replay protection: PASS
Non-creator role guards: PASS
```

Not claimed as PASS without separate runtime evidence:

```text
additional wrong-chain rejection edge cases
provider implementations that do not support permission revocation
```
