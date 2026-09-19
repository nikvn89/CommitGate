# CommitGate

**Only bind commitments that define a real failure state.**

CommitGate is a GenLayer dApp built on the `CommitmentTestability` Intelligent Contract. It asks one narrow semantic question about commitment text, then lets deterministic contract logic decide whether the agreement may become `BOUND`.

> **Honest limitation:** CommitGate only checks whether submitted commitment text states at least one behavior, result, or deadline whose non-occurrence is treated by that text as failure to perform. It does **not** judge fairness, strength, legal enforceability, real-world performance, or who is allowed to decide compliance.

## How to try it

The project is designed for a short reviewer flow and needs only **one signing wallet**. The promisee is just another valid address and does not need to sign.

1. **Connect MetaMask**. The app checks GenLayer Studio Network (`61999`) before every write and can add/switch the network if needed.
2. **Create an agreement** in the **Agreement** tab. Example name: `Hosting SLA`. Enter any valid promisee address different from the creator.
3. Open **Commitments**, load the **vague demo**, and submit:

   ```text
   The operator will respond to incidents in the manner warranted by operational needs.
   ```

   The intended semantic branch is `COMMITMENT_NO_FAILURE_STATE`; if that is what StudioNet actually returns, `attached_count` stays `0` and the Bind button stays gated.
4. Load the **testable demo** and submit:

   ```text
   The operator must publish a post-incident report containing root cause, customer impact and corrective actions within five business days after incident closure.
   ```

   If StudioNet returns `COMMITMENT_TESTABLE`, `attached_count` becomes `1` and Bind becomes available.
5. **Bind agreement**. On success the on-chain state becomes `BOUND`, and the agreement is frozen.

The frontend never invents a verdict. It only submits input, reads authoritative contract state, and renders the result.

## Project contract

```text
0xe8999d51e91B8b7Ee82CeF530B1620236B84828F
```

Explorer:

```text
https://explorer-studio.genlayer.com/address/0xe8999d51e91B8b7Ee82CeF530B1620236B84828F
```

## What the Intelligent Contract does

GenLayer validators classify a single immutable commitment text into exactly one of:

```text
COMMITMENT_TESTABLE
COMMITMENT_NO_FAILURE_STATE
```

The semantic question is whether the text itself states at least one behavior, result, or deadline whose non-occurrence counts as failure to perform.

The AI does **not**:

- evaluate actual performance;
- decide who judges compliance;
- score quality, fairness, or legal strength;
- read URLs or external evidence;
- rewrite the commitment;
- select arbitrary state transitions.

## Deterministic consequence

```text
COMMITMENT_TESTABLE
-> commitment.active = true
-> agreement.attached_count += 1

COMMITMENT_NO_FAILURE_STATE
-> commitment.active = false
-> attached_count unchanged

bind_agreement
-> allowed only when attached_count >= 1
-> agreement.bound = true
-> agreement becomes frozen
```

## Multi-tenant model

- Any wallet may create its own agreement.
- `agreement_id` is content-derived from creator address + agreement name.
- Identical names from different creators produce different IDs.
- Only the agreement creator may submit commitments or bind that agreement.
- There is no deployer admin or shared global workflow state.

## Exact replay protection

`commitment_id` is content-addressed from:

```text
agreement_id + exact commitment text
```

Submitting the exact same text again produces the same ID and reverts, so exact-text semantic re-rolls are not possible.

## Frontend reliability rules

The dApp follows the established StudioNet frontend rules:

- reads go through the same-origin `/api/rpc` proxy;
- writes use MetaMask via EIP-1193;
- no `client.connect()` / GenLayer Snap dependency;
- `accountsChanged` and `chainChanged` are handled;
- every write runs an explicit StudioNet chain check;
- transaction submission and state confirmation are separate UI phases;
- after a tx hash exists, the app never tells the user the write definitely failed merely because confirmation timed out;
- there is no browser `waitForTransactionReceipt()` loop;
- state confirmation uses bounded, low-frequency accepted-state reads;
- only after state confirmation times out, one leader-receipt diagnostic read may expose an exact rollback reason and transaction hash;
- write buttons are locked during active submission flow;
- plain provider objects are normalized instead of displaying `[object Object]`.

## UI structure

The interface is intentionally compact rather than one long operations page:

```text
Header
Hero / semantic flow
Workspace
  ├─ Agreement tab
  │   ├─ Create
  │   ├─ Open / recent IDs
  │   └─ On-chain state + Bind gate
  └─ Commitments tab
      ├─ Semantic submission
      └─ Append-only attempt history
How it works
Honest limitation
Footer / GenLayer branding
```

## Visual assets

```text
public/commitgate-logo.png
public/genlayer-logo.png        # local fallback only
public/favicon.png
```

The CommitGate logo is a project-specific asset. The UI loads the official black GenLayer logo from GenLayer's public Brand asset URL and keeps `public/genlayer-logo.png` only as a local fallback. Project branding and protocol branding remain visually separate.

## Tech stack

- Vite
- React
- TypeScript
- `genlayer-js@1.1.8`
- `viem`
- MetaMask / EIP-1193
- GenLayer StudioNet
- Vercel

## Repository structure

```text
CommitGate/
├─ api/
│  └─ rpc.js
├─ contract/
│  └─ CommitmentTestability.py
├─ public/
│  ├─ commitgate-logo.png
│  ├─ genlayer-logo.png
│  └─ favicon.png
├─ src/
│  ├─ App.tsx
│  ├─ config.ts
│  ├─ errors.ts
│  ├─ genlayer.ts
│  ├─ main.tsx
│  ├─ ids.ts
│  ├─ pystrip.ts
│  ├─ styles.css
│  ├─ types.ts
│  └─ vite-env.d.ts
├─ .env.example
├─ .gitignore
├─ index.html
├─ LICENSE
├─ package.json
├─ package-lock.json
├─ LOCKED_SPEC.md
├─ README.md
├─ RUNTIME_EVIDENCE.md
├─ SECURITY.md
├─ SOURCE_SHA256.txt
├─ TESTING.md
├─ SUBMISSION_NOTE.md
├─ tsconfig.app.json
├─ tsconfig.json
├─ tsconfig.node.json
├─ vercel.json
└─ vite.config.ts
```

## Local development

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

Deterministic ID parity test:

```bash
npm test
```

The test executes the production `src/ids.ts` implementation, covers ordinary text, astral Unicode, Python-only whitespace, JS-only `U+FEFF`, and the recorded on-chain vector. It also runs a legacy `.trim()` / UTF-16 `.length` mutation check so the pre-fix behavior cannot pass unnoticed.

On Windows you can also double-click `LOCAL_TEST.cmd`; it installs dependencies, runs the production build, and starts the Vite dev server only if the build succeeds.

## Environment

The project already contains the current StudioNet deployment as its fallback configuration.

Optional overrides:

```text
VITE_CONTRACT_ADDRESS=0xe8999d51e91B8b7Ee82CeF530B1620236B84828F
VITE_READ_RPC=/api/rpc
```

## Vercel

Typical settings:

```text
Framework: Vite
Build Command: npm run build
Output Directory: dist
```

`api/rpc.js` is the production StudioNet read proxy. No private key, wallet secret, or backend credential is required.

## Testing status

The **local frontend integration against the current StudioNet project deployment has been runtime-tested** with the project contract above.

Observed local flow:

```text
Create Hosting SLA agreement
-> OPEN / TESTABLE 0 / SUBMITTED 0 / BOUND NO

Vague commitment
-> COMMITMENT_NO_FAILURE_STATE
-> TESTABLE 0 / SUBMITTED 1

Bind gate before testable commitment
-> UI remains closed / Bind disabled

Positive 160-character commitment
-> COMMITMENT_TESTABLE
-> TESTABLE 1 / SUBMITTED 2

Bind agreement
-> BOUND
-> TESTABLE 1 / SUBMITTED 2 / BOUND YES
```

The RLP regression was also isolated with the included Studio probe: the oversized
`compute_commitment_id()` read failed above the Studio RPC RLP threshold, while the
corresponding `submit_commitment` write path remained valid. The frontend now computes
content-addressed IDs locally and no longer issues that oversized read.

**Vercel has not yet been tested in this final build.** Do not claim live/Vercel PASS until
the same short flow is observed after deployment.

See [`TESTING.md`](./TESTING.md).


## Wallet disconnect behavior

When a wallet is connected, the header button is **Disconnect** rather than `Reconnect`.

The app first attempts the EIP-1193/MetaMask `wallet_revokePermissions` method for
`eth_accounts`. It also clears wallet-scoped UI state immediately. If the current wallet
does not support automatic permission revocation, CommitGate still disconnects locally
and tells the user to remove the site from the wallet's Connected sites list for a full
provider-side revoke.

## Final project links

**Live dApp**

https://commit-gate.vercel.app/

**GitHub**

https://github.com/nikvn89/CommitGate

**GenLayer StudioNet contract**

https://explorer-studio.genlayer.com/address/0xe8999d51e91B8b7Ee82CeF530B1620236B84828F

Contract address:

```text
0xe8999d51e91B8b7Ee82CeF530B1620236B84828F
```

## Final Vercel runtime result

The final Vercel deployment was tested end-to-end against the StudioNet contract.

Observed live flow:

```text
Create "Vercel SLA"
-> OPEN
-> TESTABLE 0
-> SUBMITTED 0
-> BOUND NO

Vague commitment
-> COMMITMENT_NO_FAILURE_STATE
-> TESTABLE 0
-> SUBMITTED 1
-> BOUND NO

Positive commitment
-> COMMITMENT_TESTABLE
-> TESTABLE 1
-> SUBMITTED 2
-> BOUND NO

Bind agreement
-> BOUND
-> TESTABLE 1
-> SUBMITTED 2
-> BOUND YES
```

The final live UI also showed StudioNet chain `61999`, the correct project contract,
wallet-scoped creator/promisee state, append-only commitment history, and the final
`Agreement is BOUND` state.

**Final core Vercel flow status: PASS**

The separate provider-side permission revoke behind the Disconnect button is implemented,
but is not claimed as a runtime PASS here because a completed revoke was not separately
captured as evidence.
