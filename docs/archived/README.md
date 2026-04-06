# docs/archived

This directory holds documentation that is **no longer actively maintained**.

## Archival convention

A file moves here when it meets one or more of these conditions:

- **Superseded** — its content is replaced by a newer canonical document (e.g. `docs/roadmap.md` supersedes the individual phase implementation plans).
- **Completed and closed** — it tracked work that is now fully merged and no longer referenced by active planning.
- **Historically significant** — it records a design decision or product state that informed the current architecture but does not describe the current system.
- **Deprecated feature** — the feature or component it describes has been intentionally dropped.

Files in this directory are kept for reference only. Do not rely on them for current implementation guidance. For current state, see:

- [`docs/roadmap.md`](../roadmap.md) — canonical capability status across v0.1 Beta / v1.0 / v2.0
- [`docs/specifications/prd.md`](../specifications/prd.md) — product requirements
- [`docs/plans/implementation-plan.md`](../plans/implementation-plan.md) — stub pointing to the roadmap

## Naming

Archived files keep their original lowercase kebab-case names. The word `archived` or `deprecated` may appear in the filename when it helps distinguish the file from a current sibling (e.g. `product-design-v0-archived.md`).
