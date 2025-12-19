# Test Runtime Environments

## Overview

Vitest segregates test runtime environments using the `@vitest-environment` directive. This allows different tests to run in different JavaScript environments based on their needs.

## How Vitest Segregates Runtimes

### 1. Global Default Environment

Set in `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    environment: "happy-dom",  // Default for all tests
  },
});
```

This is the **default environment** used when no explicit directive is specified.

### 2. Per-File Environment Override

Individual test files can override the default using a comment directive:

```typescript
// @vitest-environment node
import { describe, it, expect } from 'vitest';

// This test runs in Node.js environment
```

## Available Environments

Vitest supports three main environments:

### 1. **`node`** - Node.js Environment
- **When to use**: Server-side code, integration tests, CLI tools
- **APIs available**: Node.js built-ins (`fs`, `http`, `child_process`, etc.)
- **NOT available**: Browser APIs (`window`, `document`, `localStorage`, etc.)

### 2. **`happy-dom`** - Simulated Browser Environment
- **When to use**: React components, browser-dependent code, web APIs
- **APIs available**: DOM APIs, `window`, `document`, basic browser globals
- **Performance**: Faster than jsdom, good for most use cases
- **Limitations**: Not 100% spec-compliant, some advanced APIs missing

### 3. **`jsdom`** - Full Browser Simulation
- **When to use**: Tests requiring full browser compatibility
- **APIs available**: Comprehensive DOM implementation
- **Performance**: Slower than happy-dom
- **Best for**: Complex browser interactions

## Current Test Organization

### Integration Tests → **Node.js Environment**

All integration tests use `@vitest-environment node`:

```
tests/integration/
├── flow.test.ts                    # @vitest-environment node
└── sanity/
    ├── deploy-contract.test.ts     # @vitest-environment node
    ├── faucet-ed25519.test.ts      # @vitest-environment node
    ├── localnet.test.ts            # @vitest-environment node
    └── transfer.test.ts            # @vitest-environment node
```

**Why Node.js?**
- Need to spawn child processes (`aptos` CLI)
- Need HTTP requests to localnet (`http.request`)
- Need file system access
- Need to manage long-running processes
- Don't need browser APIs

### Unit Tests → **happy-dom Environment** (default)

Unit tests use the default environment from config:

```
tests/unit/
├── aptos.test.ts        # Uses happy-dom (default)
└── ibe.test.ts          # Uses happy-dom (default)
```

**Why happy-dom?**
- Fast execution
- Web app code may reference `window`, browser globals
- No actual DOM manipulation needed for unit tests
- Can test browser-dependent utilities

### Component Tests → **happy-dom Environment** (when added)

React component tests would use the default happy-dom:

```typescript
// No directive needed - uses default happy-dom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import MyComponent from '../src/components/MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

## Runtime Environment Matrix

| Test Type | Environment | Why | Has DOM? | Has Node APIs? |
|-----------|-------------|-----|----------|----------------|
| Integration tests | `node` | Need child processes, HTTP, filesystem | ❌ No | ✅ Yes |
| Unit tests (current) | `happy-dom` | May reference browser globals, fast | ✅ Simulated | ❌ No |
| Component tests | `happy-dom` | Need DOM for React, fast enough | ✅ Simulated | ❌ No |
| E2E tests (future) | `node` or browser | Would use Playwright/Cypress | N/A | N/A |

## How to Choose the Right Environment

### Use `@vitest-environment node` when:
- ✅ Test needs Node.js APIs (`fs`, `http`, `child_process`, etc.)
- ✅ Test spawns processes or manages system resources
- ✅ Test doesn't need browser APIs at all
- ✅ Integration testing backend/CLI functionality

### Use `happy-dom` (default) when:
- ✅ Testing React components
- ✅ Testing code that references `window` or browser globals
- ✅ Need fast test execution
- ✅ Don't need 100% browser spec compliance

### Use `jsdom` when:
- ✅ Need full browser API compatibility
- ✅ Testing complex browser interactions
- ✅ happy-dom is missing APIs you need
- ⚠️ Willing to accept slower test execution

## Example: Mixed Environment Test File

You can even mix environments in the same project:

```typescript
// tests/integration/backend.test.ts
// @vitest-environment node
import { spawn } from 'child_process';
import http from 'http';

describe('Backend Tests', () => {
  it('starts server', () => {
    // Uses Node.js APIs
  });
});
```

```typescript
// tests/components/Button.test.tsx
// Uses default happy-dom from config
import { render } from '@testing-library/react';

describe('Button', () => {
  it('renders', () => {
    // Uses DOM APIs
  });
});
```

## Verifying the Environment

You can verify which environment a test is running in:

```typescript
it('should run in correct environment', () => {
  // In node environment
  console.log(typeof process);           // 'object'
  console.log(typeof window);            // 'undefined'
  console.log(typeof document);          // 'undefined'

  // In happy-dom/jsdom environment
  console.log(typeof process);           // 'object' (still available)
  console.log(typeof window);            // 'object'
  console.log(typeof document);          // 'object'
});
```

## Common Pitfalls

### ❌ Wrong: Using browser APIs in Node environment

```typescript
// @vitest-environment node
it('test', () => {
  localStorage.setItem('key', 'value');  // ❌ ReferenceError: localStorage is not defined
});
```

### ✅ Right: Use happy-dom for browser APIs

```typescript
// No directive - uses default happy-dom
it('test', () => {
  localStorage.setItem('key', 'value');  // ✅ Works
});
```

### ❌ Wrong: Using Node APIs in browser environment

```typescript
// Uses default happy-dom
import { spawn } from 'child_process';  // ❌ Module not found

it('test', () => {
  spawn('ls');  // ❌ Won't work
});
```

### ✅ Right: Use node environment for Node APIs

```typescript
// @vitest-environment node
import { spawn } from 'child_process';  // ✅ Works

it('test', () => {
  spawn('ls');  // ✅ Works
});
```

## Best Practices

1. **Be explicit** - Add `@vitest-environment node` comment to all integration tests
2. **Default to happy-dom** - Good for most web app tests
3. **Avoid mixing** - Don't try to use Node and browser APIs in the same test
4. **Document why** - Add comment explaining why you chose an environment
5. **Test in right environment** - Component tests in happy-dom, backend tests in node

## Environment Detection Pattern

If you need code that works in both environments:

```typescript
// src/lib/utils.ts
export function getStorage() {
  // Check if running in browser environment
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }

  // Fallback for Node.js environment
  return {
    getItem: () => null,
    setItem: () => {},
    // ... mock implementation
  };
}
```

## Switching Environments

If you need to change an existing test's environment:

```typescript
// Before: Uses default happy-dom
import { describe, it } from 'vitest';

describe('test', () => {
  // ...
});
```

```typescript
// After: Switched to node
// @vitest-environment node
import { describe, it } from 'vitest';

describe('test', () => {
  // Now has access to Node APIs
});
```

## See Also

- [Vitest Environment Documentation](https://vitest.dev/guide/environment.html)
- [happy-dom Documentation](https://github.com/capricorn86/happy-dom)
- [jsdom Documentation](https://github.com/jsdom/jsdom)
