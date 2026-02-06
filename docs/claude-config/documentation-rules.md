# Documentation Rules

This document outlines the rules for documentation files in this repository. These rules are enforced by a git pre-push hook.

## 1. Location Structure
- **Substantial Documentation:** All substantial documentation files must reside in the appropriate subfolder of the root `./docs/` directory.
- **Root and Modules:** Outside of the `./docs/` directory, only `README.md` files are permitted. These should strictly summarize the contents of that directory (e.g., describing a module) and link back to canonical documents within `./docs/`.

## 2. Naming Conventions
- **README Files:** Must be named exactly `README.md` (capitalized).
- **Other Documents:** All other documentation files (located within `./docs/` subdirectories) must use **kebab-case** (lowercase letters separated by hyphens, e.g., `my-feature-specs.md`).

## 3. Enforcement
A git pre-push hook runs a Node.js script to verify these rules. If a violation is detected, the push will be rejected, and you will be referred to this document.
