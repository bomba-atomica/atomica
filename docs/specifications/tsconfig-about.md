# TypeScript Configuration Documentation

This document maintains the documentation that was originally embedded as comments in the `tsconfig` files. The comments were removed from the JSON files to ensure strict JSON compliance.

## 1. tsconfig.json (Root)

**TypeScript Project References - Root Configuration**

This is the ROOT TypeScript configuration that orchestrates the entire project using TypeScript's Project References feature.

### What This File Does

- Defines a "solution" that contains multiple sub-projects
- Each sub-project has its own tsconfig with specific settings
- Enables incremental builds across project boundaries
- Keeps browser code (`src/`) separate from Node.js tooling code (`vite.config.ts`)

### Why Project References?

This project has code that runs in TWO different environments:

1.  **Browser code (`src/`)** - React app, UI components, browser-side SDK
2.  **Node.js code (`vite.config.ts`, `test-utils/`)** - Build tools, test infrastructure

These environments have DIFFERENT TypeScript requirements:

- **Browser:** needs DOM types, no Node.js types
- **Node.js:** needs Node.js types, no DOM types

Project References allow us to have separate tsconfig files for each environment while still maintaining a unified project structure.

### The Two Sub-Projects

1.  **tsconfig.app.json**
    - Compiles: `src/` directory (application code)
    - Environment: Browser
    - Types: DOM, DOM.Iterable, vite/client
    - Target: ES2022
    - Use for: React components, UI code, browser-side SDK

2.  **tsconfig.node.json**
    - Compiles: `vite.config.ts`, `vitest.config.ts` (tooling)
    - Environment: Node.js
    - Types: node
    - Target: ES2023
    - Use for: Vite config, Vitest config, build scripts

### How It Works

When you run `tsc --build`, TypeScript:

1.  Reads this root config
2.  Sees the "references" array
3.  Builds each referenced project in dependency order
4.  Enables incremental builds (only rebuilds what changed)

### Important for AI Agents

1.  **DON'T add "compilerOptions" to this file**
    - This is a references-only config
    - All compiler options go in the referenced configs

2.  **DON'T add "include" to this file**
    - Each referenced config has its own "include"
    - This file just orchestrates the sub-projects

3.  **When adding new environment-specific code:**
    - Browser code? Add to `src/` (automatically included by `tsconfig.app.json`)
    - Node.js tooling? Update "include" in `tsconfig.node.json`

4.  **Test code is NOT included here**
    - Tests use Vitest's built-in TypeScript handling
    - Test type checking happens during test execution
    - See `vitest.config.ts` and `vitest.config.nodejs.ts`

---

## 2. tsconfig.app.json (Browser/App)

**TypeScript Configuration - Browser/Application Code**

This configuration is for CODE THAT RUNS IN THE BROWSER.

### What This Compiles

- `src/` directory (all application code)
- React components
- UI logic
- Browser-side SDK usage
- Frontend utilities

**ENVIRONMENT:** Browser (Chromium, Firefox, Safari)
**TARGET:** Modern browsers supporting ES2022

### Important for AI Agents

1.  **This config is for BROWSER CODE ONLY**
    - ✅ React components (`src/components/`)
    - ✅ Browser utilities (`src/lib/`)
    - ✅ Frontend pages (`src/pages/`)
    - ✅ Browser-side state management
    - ❌ Node.js tooling (use `tsconfig.node.json` instead)
    - ❌ Test utilities (handled by Vitest)
    - ❌ Build scripts (use `tsconfig.node.json` instead)

2.  **AVAILABLE GLOBALS**
    - window, document, DOM APIs (from "lib": ["DOM", "DOM.Iterable"])
    - Modern JavaScript features (from "lib": ["ES2022"])
    - Vite client types (import.meta.env, etc.)
    - NO Node.js globals (no process, \_\_dirname, require, etc.)

3.  **When adding new files to src/:**
    - They're automatically included (no config change needed)
    - Use browser APIs freely (window, document, fetch, etc.)
    - Don't import Node.js modules (fs, path, child_process, etc.)

### Key Compiler Options Explained

- **"target": "ES2022"**
  - Output JavaScript compatible with ES2022
  - Modern browsers (Chrome 94+, Firefox 93+, Safari 15.4+)
  - Supports: async/await, optional chaining, nullish coalescing, etc.

- **"lib": ["ES2022", "DOM", "DOM.Iterable"]**
  - ES2022: Modern JavaScript features
  - DOM: Browser APIs (window, document, Element, etc.)
  - DOM.Iterable: Iteration over DOM collections (NodeList, HTMLCollection)

- **"module": "ESNext"**
  - Use latest ES module features
  - import/export syntax
  - Dynamic imports supported

- **"types": ["vite/client"]**
  - Vite-specific types (import.meta.env, import.meta.hot, etc.)
  - Enables TypeScript to understand Vite's special globals

- **"jsx": "react-jsx"**
  - Use React 17+ JSX transform
  - No need to import React in every file
  - Automatically transforms JSX to React.createElement

### Bundler Mode Options

- **"moduleResolution": "bundler"**
  - Vite/bundler-aware module resolution
  - Understands package.json "exports" field
  - Resolves .ts/.tsx extensions correctly

- **"allowImportingTsExtensions": true**
  - Can import .ts/.tsx files directly
  - Example: `import { Foo } from './Foo.tsx'`
  - Vite handles the compilation

- **"noEmit": true**
  - TypeScript doesn't output files
  - Vite handles transpilation and bundling
  - This is just for type checking

### Strict Type Checking

- **"strict": true**
  - Enables all strict type-checking options
  - noImplicitAny, strictNullChecks, strictFunctionTypes, etc.
  - Catches more errors at compile time

- **"noUnusedLocals": true**
  - Error on unused local variables
  - Helps keep code clean

- **"noUnusedParameters": true**
  - Error on unused function parameters
  - Prefix with \_ to explicitly mark as unused: `(_param) => {}`

- **"noFallthroughCasesInSwitch": true**
  - Error on switch cases that fall through without break/return
  - Catches common bugs

### Build Info

- **"tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo"**
  - Stores incremental build information
  - Speeds up subsequent type checks
  - Stored in node_modules/.tmp (gitignored)

---

## 3. tsconfig.node.json (Node Tooling)

**TypeScript Configuration - Node.js Tooling Code**

This configuration is for CODE THAT RUNS IN NODE.JS (build tools, configs).

### What This Compiles

- `vite.config.ts` (Vite configuration)
- `vitest.config.ts` (Vitest browser config)
- `vitest.config.nodejs.ts` (Vitest Node.js config)
- Other build/tooling scripts

**ENVIRONMENT:** Node.js (v18+)
**TARGET:** ES2023 (latest Node.js features)

### Important for AI Agents

1.  **This config is for NODE.JS TOOLING ONLY**
    - ✅ vite.config.ts (Vite setup)
    - ✅ vitest.config.ts (test configuration)
    - ✅ Build scripts
    - ✅ Deployment scripts
    - ❌ Application code (use `tsconfig.app.json` instead)
    - ❌ React components (use `tsconfig.app.json` instead)
    - ❌ Test files (handled by Vitest, not this config)

2.  **AVAILABLE GLOBALS**
    - Node.js APIs (fs, path, child_process, http, etc.)
    - process, **dirname, **filename, require
    - Modern JavaScript features (ES2023)
    - NO browser APIs (no window, document, DOM, etc.)

3.  **When adding new tooling files:**
    - Add to "include" array in this file
    - Example: `"include": ["vite.config.ts", "scripts/**/*.ts"]`
    - Use Node.js APIs freely
    - Don't use browser globals (window, document, etc.)

### Key Differences from tsconfig.app.json

| Feature           | tsconfig.app.json         | tsconfig.node.json     |
| ----------------- | ------------------------- | ---------------------- |
| Environment       | Browser                   | Node.js                |
| Target            | ES2022                    | ES2023                 |
| Lib               | ES2022, DOM, DOM.Iterable | ES2023                 |
| Types             | vite/client               | node                   |
| window, document  | ✅ Yes                    | ❌ No                  |
| fs, path, process | ❌ No                     | ✅ Yes                 |
| JSX               | react-jsx                 | Not supported          |
| Include           | `src/`                    | `vite.config.ts`, etc. |

### Key Compiler Options Explained

- **"target": "ES2023"**
  - Output JavaScript compatible with ES2023
  - Latest Node.js features (Node.js 18+)
  - More modern than browser target (browsers lag behind Node.js)

- **"lib": ["ES2023"]**
  - ES2023 JavaScript features
  - NO DOM types (this is Node.js, not browser)
  - Includes: async/await, top-level await, etc.

- **"types": ["node"]**
  - Node.js type definitions
  - Enables: process, \_\_dirname, fs, path, etc.
  - Provides types for all built-in Node.js modules

- **"module": "ESNext"**
  - Use ES modules (import/export)
  - Vite config files use ES module syntax
  - Node.js supports ES modules natively

### Bundler Mode Options

- **"moduleResolution": "bundler"**
  - Resolves modules for bundler environments
  - Vite uses this for config files
  - Understands package.json "exports"

- **"allowImportingTsExtensions": true**
  - Can import .ts files directly
  - Example: `import { config } from './config.ts'`
  - Vite handles TypeScript compilation

- **"noEmit": true**
  - TypeScript doesn't output files
  - Vite handles transpilation
  - This is just for type checking

### What Files Are Included

- Currently: `["vite.config.ts"]`
  - Only Vite configuration file
  - `vitest.config.ts` is NOT included here (it imports from `vite.config.ts`)

- To add more tooling files:
  ```json
  "include": [
    "vite.config.ts",
    "vitest.config.ts",
    "vitest.config.nodejs.ts",
    "scripts/**/*.ts"
  ]
  ```

### Why Separate from tsconfig.app.json?

Tooling code has different requirements:

- Needs Node.js APIs (fs, path, child_process)
- Doesn't need DOM types
- Can use newer ES features (Node.js updates faster than browsers)
- Different module resolution rules

Mixing browser and Node.js configs leads to:

- Type errors (can't use 'window' in Node.js)
- Incorrect autocomplete
- Confusion about what APIs are available

### Relationship to Other Configs

- `tsconfig.json` (root) - References this config
- `tsconfig.app.json` - For browser/application code
- `vitest.config.ts` - Uses types from this config
- `vitest.config.nodejs.ts` - Uses types from this config

### Test Code is Not Here

Test files (`tests/**/*.test.ts`) are NOT included in this config.
Why?

- Vitest handles TypeScript compilation for tests
- Tests run in different environments (browser or Node.js)
- Test type checking happens during test execution
- See `vitest.config.ts` and `vitest.config.nodejs.ts` for test setup
