# Security Notes

## Dependency audit

The direct versions verified for this frontend remain pinned: `genlayer-js@1.1.8`, `viem@2.29.0`, `react@19.1.1`, `vite@6.4.3`, and `typescript@5.8.3`.

`viem@2.29.0` permits an older `ws` range. CommitGate does not use a WebSocket transport, but the vulnerable package still appeared in the installed dependency graph. `package.json` therefore overrides only the transitive package to `ws@8.21.3`. With the committed lockfile, `npm audit` reports zero known vulnerabilities and the production build succeeds. Do not use `npm audit fix --force`, because that can change the verified direct dependency pins.

## Deterministic prefilter boundary

The contract prefilter blocks the exact reserved prompt fences and verdict labels before the model call. This prevents direct reuse of protocol control tokens, but it is not a general-purpose prompt-injection detector, content moderator, legal validator, or proof of real-world performance. The model must still treat the fenced commitment as untrusted data, and deterministic contract logic must accept only the two locked verdict strings.

## Frontend trust boundary

Local ID computation is an optimization and must remain byte-identical to contract behavior; the contract is authoritative. Accepted-state reads remain the primary confirmation mechanism. The one-shot leader receipt read after timeout is diagnostic only and does not authorize a retry or establish post-state.
