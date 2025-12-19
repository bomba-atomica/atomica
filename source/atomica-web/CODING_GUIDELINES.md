# TypeScript Coding Guidelines

This document contains TypeScript best practices and conventions for the Atomica Web project.

## Table of Contents

- [Module Augmentation](#module-augmentation)
- [File Organization](#file-organization)

---

## Module Augmentation

### Prefer `.ts` Files Over `.d.ts` for Module Augmentation

When augmenting third-party module types, declare the augmentation in your **source `.ts` file** rather than creating a separate `.d.ts` file.

#### ✅ GOOD: Module augmentation in source file

```typescript
// test-utils/browser-commands.ts

import type { BrowserCommand } from "vitest/node";
import { setupLocalnet } from "./localnet";

/**
 * Augment Vitest's browser commands with our custom commands.
 * This provides TypeScript autocomplete in browser tests.
 */
declare module "vitest/browser" {
  interface BrowserCommands {
    setupLocalnet(): Promise<{ success: boolean }>;
  }
}

export const setupLocalnetCommand: BrowserCommand<[]> = async () => {
  await setupLocalnet();
  return { success: true };
};
```

#### ❌ BAD: Separate `.d.ts` file

```typescript
// test-utils/browser-commands.d.ts (UNNECESSARY!)
declare module "vitest/browser" {
  interface BrowserCommands {
    setupLocalnet(): Promise<{ success: boolean }>;
  }
}

// test-utils/browser-commands.ts
export const setupLocalnetCommand: BrowserCommand<[]> = async () => {
  await setupLocalnet();
  return { success: true };
};
```

#### Why?

**Single Source of Truth**
- Types live next to implementation
- No need to keep two files in sync
- Easier to understand and maintain

**How It Works**
- TypeScript's `declare module` can appear in any `.ts` or `.d.ts` file
- If your `.ts` file is imported anywhere, the module augmentation is picked up
- No separate `.d.ts` file needed

**When to Use `.d.ts` Files**
- Only use `.d.ts` when you have **ambient declarations** with no implementation
- Example: Adding types for untyped npm packages that don't have implementations
- If you have a source `.ts` file, put module augmentation there instead

#### Key Principle

> If you're writing implementation code in a `.ts` file, put your type declarations there too.

---

## File Organization

### Co-locate Types with Implementation

Keep type definitions close to their implementation:

```typescript
// ✅ GOOD: Types and implementation together
export interface MyConfig {
  host: string;
  port: number;
}

export function createServer(config: MyConfig) {
  // implementation
}

// ❌ BAD: Types in separate file when not needed
// types.ts
export interface MyConfig { ... }

// server.ts
import type { MyConfig } from './types';
export function createServer(config: MyConfig) { ... }
```

**Exception**: Shared types used across many files should be in a dedicated `types.ts` file.

---

## Future Guidelines

This document will be expanded with additional TypeScript best practices as they are established.

Topics to cover:
- Naming conventions
- Type vs Interface
- Function signatures
- Error handling patterns
- Documentation standards

---

**See Also:**
- [Test Infrastructure Documentation](./tests/README.md)
- [Config File Documentation](./vitest.config.ts)
