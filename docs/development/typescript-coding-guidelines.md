# TypeScript Coding Guidelines

This document outlines the TypeScript coding standards and best practices for the Atomica project, specifically for the `atomica-web` application.

## Table of Contents

- [Overview](#overview)
- [Type Safety](#type-safety)
- [Import Statements](#import-statements)
- [Error Handling](#error-handling)
- [ESLint and Prettier](#eslint-and-prettier)
- [React Best Practices](#react-best-practices)
- [Testing Guidelines](#testing-guidelines)
- [Common Patterns](#common-patterns)

## Overview

All TypeScript code in the `atomica-web` project must:

- Pass ESLint with **0 errors** (warnings allowed in test files only)
- Be formatted with Prettier
- Avoid use of `@ts-ignore`, `@ts-expect-error`, and `any` types in source code
- Use proper TypeScript type annotations

## Type Safety

### Never Use `any` Without Justification

❌ **Bad:**

```typescript
function processData(data: any) {
  return data.value;
}
```

✅ **Good:**

```typescript
function processData(data: unknown) {
  if (typeof data === "object" && data !== null && "value" in data) {
    return (data as { value: unknown }).value;
  }
  throw new Error("Invalid data structure");
}
```

### When `any` Is Acceptable

The **only** acceptable uses of `any` are:

1. **Variadic function parameters** (like loggers):

   ```typescript
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   static info(...args: any[]) {
     this.log("info", args);
   }
   ```

2. **External SDK types that lack proper typing**:

   ```typescript
   export interface PreparedTransaction {
     // eslint-disable-next-line @typescript-eslint/no-explicit-any
     transaction: any; // SDK doesn't export this type
     auth: AccountAuthenticator;
   }
   ```

3. **Test files** - relaxed rules apply (see [Testing Guidelines](#testing-guidelines))

### Avoid Type Assertions Without Comments

When you must use type assertions, always add a comment explaining why:

❌ **Bad:**

```typescript
const result = (await fetch(url)) as Response;
```

✅ **Good:**

```typescript
// Cast needed because SDK types don't include senderAuthenticator
const result = await aptos.transaction.simulate.simple({
  transaction: preparedTx.transaction,
  senderAuthenticator: preparedTx.auth,
} as Parameters<typeof aptos.transaction.simulate.simple>[0]);
```

## Import Statements

### Use Top-Level Imports Only

❌ **Bad:**

```typescript
// NO inline imports
const module = await import("./module");

// NO require() calls
const config = require("./config");
```

✅ **Good:**

```typescript
import { module } from "./module";
import config from "./config";
```

### Organize Imports

Group imports in this order:

1. External libraries
2. Internal absolute imports
3. Relative imports
4. Type imports

```typescript
// External
import { ethers } from "ethers";
import { useState, useEffect } from "react";

// Internal/Relative
import { aptos } from "./config";
import { getDerivedAddress } from "./siwe";

// Types
import type { InputGenerateTransactionPayloadData } from "@aptos-labs/ts-sdk";
```

### Create Type Declarations for Untyped Libraries

Instead of using `@ts-ignore`, create a type declaration file:

```typescript
// src/types/heroicons.d.ts
declare module "@heroicons/react/24/solid" {
  import { FC, SVGProps } from "react";

  export const ChevronDownIcon: FC<SVGProps<SVGSVGElement>>;
  export const XCircleIcon: FC<SVGProps<SVGSVGElement>>;
}
```

## Error Handling

### Always Use `unknown` for Caught Errors

❌ **Bad:**

```typescript
try {
  await riskyOperation();
} catch (e: any) {
  console.error(e.message);
}
```

✅ **Good:**

```typescript
try {
  await riskyOperation();
} catch (e: unknown) {
  const errorMessage = e instanceof Error ? e.message : String(e);
  console.error(errorMessage);
}
```

### Remove Unused Error Variables

❌ **Bad:**

```typescript
try {
  await operation();
} catch (e) {
  // e is unused
  console.log("Operation failed");
}
```

✅ **Good:**

```typescript
try {
  await operation();
} catch {
  console.log("Operation failed");
}
```

### Handle Errors Appropriately

Don't just rethrow without adding value:

❌ **Bad:**

```typescript
try {
  return await operation();
} catch (e) {
  throw e; // Useless catch
}
```

✅ **Good - Either add context:**

```typescript
try {
  return await operation();
} catch (e: unknown) {
  const errorMessage = e instanceof Error ? e.message : String(e);
  throw new Error(`Operation failed: ${errorMessage}`);
}
```

✅ **Or remove the try/catch:**

```typescript
return await operation();
```

## ESLint and Prettier

### Running Checks

Before committing, always run:

```bash
npm run lint        # Check for errors
npm run format      # Auto-format code
npm run format:check  # Verify formatting (used in CI)
```

### ESLint Configuration

The project uses:

- `@eslint/js` - Base JavaScript rules
- `typescript-eslint` - TypeScript-specific rules
- `eslint-plugin-react-hooks` - React Hooks rules
- `eslint-plugin-react-refresh` - Vite/React refresh rules

### Suppressing Warnings

Only suppress linting rules when absolutely necessary, and **always** add a comment:

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const debugState: any = {
  /* complex debug object */
};
```

### Prettier Formatting

All code is formatted with Prettier. Do not override Prettier settings in individual files.

## React Best Practices

### Avoid Synchronous setState in Effects

❌ **Bad:**

```typescript
useEffect(() => {
  checkBalances(); // Synchronous setState call
  const interval = setInterval(checkBalances, 5000);
  return () => clearInterval(interval);
}, [checkBalances]);
```

✅ **Good:**

```typescript
useEffect(() => {
  let cancelled = false;
  const runCheck = async () => {
    if (!cancelled) {
      await checkBalances();
    }
  };
  void runCheck();
  const interval = setInterval(() => void runCheck(), 5000);
  return () => {
    cancelled = true;
    clearInterval(interval);
  };
}, [checkBalances]);
```

### Use Proper Dependency Arrays

Always include all dependencies in `useEffect`, `useCallback`, and `useMemo`:

❌ **Bad:**

```typescript
useEffect(() => {
  fetchData(userId);
}, []); // Missing userId dependency
```

✅ **Good:**

```typescript
useEffect(() => {
  fetchData(userId);
}, [userId]);
```

## Testing Guidelines

### Test Files Have Relaxed Rules

Test files (in `tests/**` or `*.test.ts`) have relaxed ESLint rules:

- `@typescript-eslint/no-explicit-any`: `off`
- `@typescript-eslint/no-unused-vars`: `warn`
- `@typescript-eslint/ban-ts-comment`: `warn`
- `no-useless-catch`: `warn`
- `no-empty`: `warn`

This allows for more flexibility in mocks and test utilities.

### Test File Example

```typescript
// tests/utils/MockWallet.ts
export class MockWallet {
  // any is acceptable in test utilities for mocking
  request: async ({ method, params }: { method: string; params: any[] }) => {
    switch (method) {
      case "personal_sign":
        const [msgHex] = params;
        return await this.wallet.signMessage(msgHex);
      default:
        throw new Error(`Method ${method} not implemented`);
    }
  }
}
```

### Use Type Assertions for Test Setup

In tests, type assertions are acceptable for setup:

```typescript
// Acceptable in tests
global.fetch = nodeFetch as any;
(window as any).ethereum = mockProvider;
```

## Common Patterns

### Working with External SDKs

When SDKs lack proper types, use type parameters:

```typescript
// Instead of casting the object
const result = await aptos.transaction.simulate.simple({
  transaction: preparedTx.transaction,
  senderAuthenticator: preparedTx.auth,
} as Parameters<typeof aptos.transaction.simulate.simple>[0]);
```

### Handling Environment Variables

Use proper typing for environment variables:

```typescript
// src/lib/aptos/config.ts
const env =
  (import.meta as { env?: Record<string, string> }).env || process.env || {};
export const CONTRACT_ADDR = env.VITE_CONTRACT_ADDRESS || "0x1";
```

### Variadic Functions

For functions that accept any number of arguments:

```typescript
export class Logger {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static info(...args: any[]) {
    this.log("info", args);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static log(level: string, args: any[]) {
    const message = args.map((a) => {
      if (typeof a === "string") return a;
      return JSON.stringify(a);
    });
    // ...
  }
}
```

### React Component Props

Always define explicit interfaces for component props:

```typescript
interface TxButtonProps {
  label: string;
  accountAddress: string;
  prepareTransaction: () => Promise<PayloadData> | PayloadData;
  onSuccess: (hash: string) => void;
  className?: string;
  disabled?: boolean;
}

export function TxButton({
  label,
  accountAddress,
  // ...
}: TxButtonProps) {
  // ...
}
```

## Pre-Commit Checklist

Before submitting a PR, ensure:

- [ ] `npm run lint` shows **0 errors** (warnings in tests are OK)
- [ ] `npm run format:check` passes
- [ ] No `@ts-ignore` or `@ts-expect-error` in `src/` directory
- [ ] No inline `import()` or `require()` calls
- [ ] All caught errors use `unknown` type with proper type guards
- [ ] All React effects have correct dependency arrays
- [ ] New external libraries without types have declaration files in `src/types/`

## GitHub Actions

The CI pipeline runs:

1. `npm run lint` - Must pass with 0 errors
2. `npm run format:check` - Must pass
3. `npx tsc --noEmit` - TypeScript compilation check

These checks must pass before merging to `main`.

## Questions?

If you're unsure about a typing pattern or need to suppress a rule:

1. Check if there's a better way to type it properly
2. Create a type declaration file if the library lacks types
3. Add a detailed comment explaining why the suppression is necessary
4. Ask for review in your PR

---

**Remember:** Type safety helps us catch bugs at compile time. When in doubt, be more strict with types, not less.
