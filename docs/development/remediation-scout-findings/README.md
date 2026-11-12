# Remediation Scout Findings

> Scout pass over the 28 remediation issues (216 to 243) filed from the
> 2026-11-11 adversarial code review in `docs/code-reviews/2026-11-11-2005-fable/`.

The scouts stubbed every site each issue adds, edits or removes, as a
horizontal prototype. Find the sites of one issue with:

```sh
grep -rn "SCOUT(#216)" .
```

Markers read `SCOUT(#N) KIND: <change>`, where `KIND` is `ADD`, `EDIT`,
`REMOVE`, `TEST` or `DOC`. Stubs abort or throw `NOT_IMPLEMENTED` and are
never called from live code. The fork side of the prototype lives in
`bomba-atomica/atomica-aptos` on `dev-atomica`.

Each report has one section per issue: sites, stubs, issue text
corrections, hidden costs, cross-issue pressure, CI coverage and the
questions the code answers. Each ends with check results and a suggested
landing order.

| Partition | Report | Scope |
| --- | --- | --- |
| Move | [move.md](move.md) | `source/atomica-move-contracts` |
| EVM | [evm.md](evm.md) | `source/evm-contracts` |
| SDK | [sdk.md](sdk.md) | `source/atomica-sdk`, `source/state-proofs`, `source/golden-vectors`, `source/shared` |
| UI | [ui.md](ui.md) | `source/atomica-web-components`, `source/atomica-demo` |
| Infra | [infra.md](infra.md) | `source/docker-testnet`, `source/test-utils`, CI, hooks, scripts |
| Docs | [docs.md](docs.md) | `docs/` |
| Fork | [fork.md](fork.md) | the `atomica-aptos` worktree |

The issue bodies on GitHub carry the distilled lessons. These reports are
the evidence behind them.
