# Git Commit Hooks

This repository uses Git hooks to maintain code quality and ensure that all commits meet the project's standards. These hooks are automatically configured for all developers.

## Overview

We use a `pre-commit` hook to validate changes before they are committed to the repository. This ensures that the CI/CD pipeline remains stable and reduces feedback loops for developers.

### Pre-commit Hook Actions

The `pre-commit` hook currently performs the following checks for the **state-proof** module:

1.  **Dependency Build**: Automatically builds the `typescript-sdk` in `source/docker-testnet/ethereum-testnet/typescript-sdk`, which is a required dependency for the state-proof verifier.
2.  **Linting**: Runs `eslint` to ensure code adheres to the project's style guide.
3.  **Formatting**: Checks code formatting using `prettier`.
4.  **Type Checking**: Runs `tsc` (TypeScript Compiler) to verify type safety.

## Automatic Installation

The hooks are designed to be installed automatically. When you run `bun install` or `npm install` in any major sub-module (like `source/state-proofs/typescript`), the `prepare` script will trigger the hook installation.

### AI Agent Instructions

If you are an AI agent working in this repository, you should manually install the git hooks before making any commits to ensure you are following the project's quality standards.

To manually install or refresh the hooks, run:

```bash
./scripts/install-hooks.sh
```

To verify the installation, you can check the git configuration:

```bash
git config core.hooksPath
```
It should return `.githooks`.

## Configuration

*   **Hook Scripts**: Located in the `.githooks/` directory at the repository root.
*   **Installation Logic**: Handled by `scripts/install-hooks.sh`, which configures Git to use the `.githooks` directory via `git config core.hooksPath`.

## Troubleshooting

If a commit fails due to the `pre-commit` hook, review the error message in your terminal. You must fix the linting, formatting, or compilation errors before Git will allow the commit to proceed.

If you need to bypass the hooks in an emergency (not recommended), you can use the `--no-verify` flag:

```bash
git commit -m "your message" --no-verify
```
