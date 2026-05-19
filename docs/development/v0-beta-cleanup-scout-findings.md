# v0 Beta Codebase Cleanup — Deletion Seam Scout Findings

**Issue**: #116 (dev-scout)
**Scout date**: 2026-05-19
**Status**: Complete

---

## Summary

This scout confirms which artifacts are safe to delete and identifies one
blocking dependency that affects issue #115's scope.

---

## 1. atomica-web and atomica-web-demo (Issue #114 scope)

### Directory existence

Neither `source/atomica-web/` nor `source/atomica-web-demo/` exist in the
repository. These directories have already been removed from the tree on
`main`. Issue #114 can proceed, but its deletion work is already done —
the remaining work is to clean up **references** in surviving files.

### Live package import references

No live TypeScript/JavaScript `import` or `require` statement pulls from an
`atomica-web` or `atomica-web-demo` package path. All string mentions are:

| File | Line | Nature | Safe to clean |
|------|------|--------|---------------|
| `source/atomica-demo/scripts/orchestrator.ts` | 20 | `WEB_DIR` path constant pointing to `source/atomica-web-demo` | Yes — dead code path; `WEB_DIR` is used to `bun install` and `spawn dev` a non-existent directory |
| `source/atomica-web-components/tests/browser-extension/run-metamask-test.ts` | 14 | Comment only | Yes |
| `source/atomica-web-components/tests/browser-extension/metamask-compat.test.ts` | 20 | Comment only | Yes |
| `source/atomica-web-components/tests/integration/fixtures/dual-chain.ts` | 2 | Comment only | Yes |
| `source/atomica-web-components/tests/integration/helpers/auction-setup.ts` | 38 | Comment only | Yes |
| `source/test-utils/browser-utils/EthereumMintMock.ts` | 4 | Comment only (`atomica-web-ui`) | Yes |
| `source/test-utils/browser-commands.ts` | 3 | Comment only (`atomica-web-ui`) | Yes |
| `source/docker-testnet/aptos-testnet/src/aptos-keys.ts` | 53 | Comment only | Yes |
| `source/atomica-demo/package.json` | 12 | `prepare:deps` script references `atomica-web-components` (NOT `atomica-web`) | Not affected |

### Monorepo workspace config

There is no root-level `package.json` with a `workspaces` field. Each
package manages its own dependencies via `file:` references. The
`atomica-demo/package.json` depends on `@atomica/atomica-web-components`
(the **surviving** package, not the deleted one).

### Remediation for #114

The only live code change needed is in `orchestrator.ts`: remove or update
the `WEB_DIR` constant and the three lines that use it (lines 20, 56–64).
Everything else is comments.

---

## 2. AuctionRegistry.sol and Governance.sol (Issue #115 scope)

### BLOCKER: AuctionRegistry.sol is actively imported by DepositBox.sol

`DepositBox.sol` (`source/evm-contracts/src/DepositBox.sol`) imports
`AuctionRegistry.sol` directly and uses it at runtime:

```
import "./AuctionRegistry.sol";
AuctionRegistry public immutable auctionRegistry;
```

`DepositBox.sol` is in turn imported by `Settlement.sol`, which is the
canonical active contract. The dependency chain is:

```
Settlement.sol → DepositBox.sol → AuctionRegistry.sol
```

**AuctionRegistry.sol cannot be deleted or archived without first
refactoring DepositBox.sol** to remove the auction-registry dependency.
Issue #115's scope must include this refactor, or a precondition note must
be added acknowledging the extra work.

### Governance.sol — no live production dependency

`Governance.sol` is imported only in:

- `src/script/Deploy.s.sol` (deployment script, not a production contract)
- `test/integration/DepositSettle.t.sol`
- `test/integration/GovernanceGenesis.t.sol`
- `test/e2e/DeploymentVerification.t.sol`

None of these are imported by any production contract. `Governance.sol`
itself is safe to archive/delete provided the three test files and the
deploy script are updated.

### TypeScript references

`source/evm-contracts/test-orchestration/src/deploy.ts` references
`Governance` in:

- Line 126: reading `deployment.Governance` from a JSON config file
- Line 181: passing `GovernanceGenesis.t.sol` as a `--match-path` arg

Both references must be removed when issue #115 archives `Governance.sol`.

### Summary table

| Contract | Used by production code | Used by tests/scripts | Deletion safety |
|---|---|---|---|
| `AuctionRegistry.sol` | YES — `DepositBox.sol` imports it | YES | BLOCKED — requires DepositBox refactor first |
| `Governance.sol` | No | YES (3 test files + deploy script) | Safe after removing test/script references |

---

## 3. No unexpected cross-package imports found

Grepping all `source/` packages (excluding `node_modules` and `dist/`)
for `atomica-web`, `atomica-web-demo`, `AuctionRegistry`, and `Governance`
found no unexpected live imports outside the locations documented above.

---

## Downstream issue notes

See comments posted to #114 and #115 for per-issue remediation guidance.
