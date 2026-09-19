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
`submit_commitment` inputs is included in `tools/probe-studio.mjs`. Its runtime table is
not recorded here because that network probe still must be run and captured by the user.

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
| Exact replay through final UI | NOT RUN |
| Wallet C unauthorized submit/bind | NOT RUN |
| Wrong-chain switch UX in final build | NOT RUN |
| Account-change listener in final build | NOT RUN |
| Disconnect button / permission revoke | TO RUN ON USER PC |
| Final `npm run build` after footer-only polish | TO RUN ON USER PC |
| Vercel `/api/rpc` | NOT RUN |
| Full Vercel flow | NOT RUN |

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
- the final Vercel deployment works before it is separately tested.

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

## V1 — Create agreement on Vercel

Observed agreement:

```text
name = Vercel SLA
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

## Final project result

```text
Local frontend core flow: PASS
RLP regression fix: PASS
Vercel core flow: PASS
```

Not claimed as PASS without separate runtime evidence:

```text
provider-side Disconnect permission revoke
Wallet C unauthorized submit/bind regression
additional wrong-chain rejection edge cases
```
