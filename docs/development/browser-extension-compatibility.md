# Browser Extension Compatibility — Research Findings

**Issue:** #48
**Date:** 2026-03-29
**Author:** automated research spike
**Test environment:** MetaMask 12.9.3, Playwright 1.58, Chromium 130, Ubuntu 22.04, Anvil 1.5.1

---

## Summary

MetaMask 12.x works correctly with the Atomica web app's `window.ethereum` usage pattern.
The automated test (`tests/browser-extension/metamask-compat.test.ts`) passes end-to-end:
`wallet_addEthereumChain` → `eth_requestAccounts` → `eth_sendTransaction`.

The test uses a **notification popup queue** pattern to handle MetaMask's complex
popup window reuse behaviour (see Finding #6 below). This was the key engineering
challenge in making the test reliable.

---

## Extensions Tested

| Extension | Version | Result | Notes |
|-----------|---------|--------|-------|
| MetaMask | 12.9.3 | **PASS** | All three EIP-1193 flows work |
| Coinbase Wallet | — | Not tested | Out of scope for this spike |

---

## Test Infrastructure Findings

### 1. Extension loading requires `launchPersistentContext`

Vitest browser mode uses Playwright's `launch()` API, which creates a non-persistent
browser context. Chrome/Chromium silently ignores `--load-extension` in non-persistent
contexts. Extensions only work with `chromium.launchPersistentContext()`.

**Consequence:** MetaMask extension tests cannot run inside the existing Vitest browser
test suite without a custom Playwright project configuration. They must be standalone
Playwright test scripts, run separately via `bun run test:metamask`.

### 2. Extensions require a display (non-headless)

Chrome ignores extensions in `headless: true` mode. On Linux CI, use `xvfb-run -a`
to provide a virtual display without a physical screen.

```bash
xvfb-run -a bun run test:metamask
```

### 3. MetaMask uses Manifest V3 (service workers)

MetaMask 12+ uses a `service_worker` entry in `manifest.json` instead of a background
page. Playwright exposes service workers via `context.serviceWorkers()` and the
`serviceworker` event. The extension ID is discoverable from the service worker URL:

```
chrome-extension://djndjonbmfjegahepblainfoeeoeehik/scripts/app-init.js
                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                   deterministic for unpacked extension at this path
```

### 4. LavaMoat blocks `page.evaluate()` on MetaMask pages

MetaMask uses [LavaMoat](https://github.com/LavaMoat/LavaMoat) to "scuttle" global
objects (`Int8Array`, `Function`, etc.) on its extension pages. Calling
`page.evaluate()` on MetaMask's `home.html` or `notification.html` throws:

```
LavaMoat - property "Int8Array" of globalThis is inaccessible under scuttling mode.
```

**Mitigation:** Use Playwright locator-based selectors (`page.locator(...)`,
`page.click(...)`, `page.fill(...)`) exclusively on MetaMask pages. Do not call
`page.evaluate()` on any `chrome-extension://` origin.

### 5. Notification popup renders asynchronously

MetaMask's connection and transaction confirmation popups open at
`chrome-extension://<extId>/notification.html`. The page loads a shell HTML
immediately, then the React + LavaMoat bundle initialises asynchronously.

**Cold start (first popup after launch):** the service worker has not yet
processed any requests, so bundle initialisation takes **15–25 seconds**.

**Warm loads (subsequent popups):** the service worker is already running, so
the bundle renders in **~1–2 seconds**.

Use a 45 s `waitFor` timeout on the first popup, and a shorter 10 s timeout on
subsequent popups in the same session.

### 6. MetaMask reuses notification windows across sequential requests

When a page calls `wallet_addEthereumChain` followed immediately by
`eth_requestAccounts`, MetaMask uses **two** notification windows in a
non-obvious way:

1. **Popup #1** opens at `notification.html` → navigates to `#confirmation`
   (the addChain approval UI).
2. After the user approves, popup #1 navigates to `#connect/...` **and closes
   in ~100 ms** — too fast to interact with.
3. **Popup #2** opens as a new page at `notification.html`, navigates to the
   same `#connect/...` route, and **stays open** for the user to approve
   `eth_requestAccounts`.
4. After the user approves connection in popup #2, the **same popup #2** navigates
   to `#confirm-transaction/...` when `eth_sendTransaction` is called.

**Consequence for test automation:** a simple `waitForEvent('page', ...)` per
request fails because the `#connect/...` state in popup #1 closes before it can
be clicked. The correct pattern is a persistent notification-popup queue that
buffers all popup pages as they open, then processes them in order.

**Pattern used in the test:**

```ts
// Register a queue that captures all notification pages as they open.
// This prevents missing any popup regardless of timing.
const popupQueue = createNotificationQueue(context);

// Click #setup — triggers wallet_addEthereumChain then eth_requestAccounts
await testPage.click("#setup");

// Popup #1: approve wallet_addEthereumChain
const addChainPopup = await popupQueue.dequeue();
await approvePopup(addChainPopup, "confirmation-submit-button");

// Popup #2: approve eth_requestAccounts (new page, warm service worker)
const connectPopup = await popupQueue.dequeue(15_000);
await approvePopup(connectPopup, "confirm-btn");

// Popup #2 (same page, now at #confirm-transaction): approve eth_sendTransaction
await testPage.click("#sign-tx");
const txPopup = connectPopup.isClosed()
  ? await popupQueue.dequeue(15_000)
  : connectPopup;
await approvePopup(txPopup, "confirm-footer-button");
```

### 7. Test page must be served over HTTP

MetaMask only injects `window.ethereum` into `http://` and `https://` origins.
Opening a test page via `file://` URL results in `window.ethereum` being `undefined`.
The test script includes a minimal `http.createServer` to serve the test page.

---

## window.ethereum API Calls — Atomica App vs. Standard EIP-1193

The table below maps every `window.ethereum` method call found in the Atomica
codebase to its standard vs. MetaMask-specific status.

| Method | File | EIP-1193 standard? | Notes |
|--------|------|--------------------|-------|
| `eth_requestAccounts` | `src/lib/ethereum/config.ts` | Yes (EIP-1102) | Triggers connection popup |
| `wallet_switchEthereumChain` | `src/lib/ethereum/config.ts` | Yes (EIP-3326) | Triggers switch network popup; MetaMask may pop an "add network" prompt instead if the chain is unknown |
| `wallet_addEthereumChain` | `src/lib/ethereum/config.ts` | Yes (EIP-3085) | MetaMask shows "Add network" popup |
| `eth_sendTransaction` | `FakeEthMint.test.tsx`, `EthereumMintMock.ts` | Yes (EIP-1193) | Triggers transaction confirmation popup |
| `eth_accounts` | `EthereumMintMock.ts` | Yes (EIP-1193) | No popup; returns [] if not connected |
| `eth_chainId` | `EthereumMintMock.ts` | Yes (EIP-695) | No popup |
| `net_version` | `EthereumMintMock.ts` | Legacy (not in EIP-1193) | MetaMask supports it; prefer `eth_chainId` |

**Finding:** The Atomica app makes no MetaMask-specific calls beyond the three methods
listed above (`eth_requestAccounts`, `wallet_switchEthereumChain`,
`wallet_addEthereumChain`). All three are defined in published EIPs and supported by
any EIP-1193 compliant wallet.

---

## MetaMask Popup Automation — Selector Reference

Verified against MetaMask 12.9.3.

### Onboarding wizard (home.html#onboarding/...)

| Step | Selector | Action |
|------|----------|--------|
| Accept terms | `[data-testid="onboarding-terms-checkbox"]` | click (enables buttons) |
| Import wallet | `[data-testid="onboarding-import-wallet"]` | click |
| Opt out of metrics | `[data-testid="metametrics-no-thanks"]` | click |
| Seed word N | `[data-testid="import-srp__srp-word-N"]` | fill (N = 0–11) |
| Confirm seed | `[data-testid="import-srp-confirm"]` | click |
| New password | `[data-testid="create-password-new"]` | fill |
| Confirm password | `[data-testid="create-password-confirm"]` | fill |
| Password terms | `[data-testid="create-password-terms"]` | click (if visible) |
| Submit import | `[data-testid="create-password-import"]` | click |
| Finish onboarding | `[data-testid="onboarding-complete-done"]` | click |
| Pin extension next | `[data-testid="pin-extension-next"]` | click (if visible) |
| Pin extension done | `[data-testid="pin-extension-done"]` | click (if visible) |

### Connection popup (notification.html — eth_requestAccounts)

| Action | Selector |
|--------|----------|
| Cancel | `[data-testid="cancel-btn"]` |
| Connect | `[data-testid="confirm-btn"]` |

### Add network popup (notification.html — wallet_addEthereumChain)

| Action | Selector |
|--------|----------|
| Approve | `[data-testid="confirmation-submit-button"]` |

### Transaction confirmation popup (notification.html — eth_sendTransaction)

| Action | Selector |
|--------|----------|
| Cancel | `[data-testid="confirm-footer-cancel-button"]` |
| Confirm | `[data-testid="confirm-footer-button"]` |

---

## Recommendations for the window.ethereum Mock in Issue #40

The existing `EthereumMintMock.ts` is already well-designed. The following
additions and notes apply based on this spike:

### 1. The mock does not need to be MetaMask-specific

The Atomica app only uses standard EIP-1193 methods plus the two `wallet_*`
EIP-defined methods. Setting `isMetaMask: true` in the mock is unnecessary (and
slightly misleading). However, some third-party libraries use `isMetaMask` as a
feature-detection shortcut (e.g. the older `@web3-react` library). Keep
`isMetaMask: true` for maximum compatibility unless there is a specific reason to
remove it.

### 2. Add `wallet_addEthereumChain` + `wallet_switchEthereumChain` support

`EthereumMintMock.ts` already handles both. The mock should:
- Accept `wallet_addEthereumChain` silently when the chainId matches the test node.
- Reject with error code `4902` if an unknown `chainId` is passed to
  `wallet_switchEthereumChain` — this mirrors real MetaMask behaviour and will
  cause the app to fall back to `wallet_addEthereumChain`.

### 3. No popup automation is needed for the mock

The mock bypasses all popups by auto-approving everything. The real MetaMask
tests (this file) are the only place popup automation is needed.

### 4. Use event listeners for chainChanged / accountsChanged

Real MetaMask emits `chainChanged` and `accountsChanged` events. The mock's
stub `on: () => {}` silently drops all event listeners. For Issue #40 this is
acceptable, but more complete integration tests should emit these events when
the mock switches chain or account.

### 5. Vitest browser mode cannot be used for real extension tests

Any test that needs the real MetaMask extension must use the standalone
Playwright pattern described in this document and in
`tests/browser-extension/metamask-compat.test.ts`. The Vitest `commands` RPC
bridge is not available to standalone Playwright tests; they must manage the
testnet lifecycle themselves (start + stop anvil or Docker testnet).

---

## How to Re-run the Spike Tests

```bash
# 1. From the repo root, navigate to the package:
cd source/atomica-web-ui

# 2. Download MetaMask (one-time — creates tests/browser-extension/metamask-extension/):
bun run test:metamask:download-ext

# 3. Run the full test (starts anvil automatically, requires xvfb-run on Linux):
bun run test:metamask
```

### CI integration

Add to your CI pipeline:

```yaml
- name: Install xvfb
  run: sudo apt-get install -y xvfb

- name: Download MetaMask extension
  working-directory: source/atomica-web-ui
  run: bun run test:metamask:download-ext

- name: Run MetaMask extension compat test
  working-directory: source/atomica-web-ui
  run: bun run test:metamask
```

---

## Alternative Extension Evaluation

**Coinbase Wallet** was identified as a potential alternative (see issue #48 scope).
It was not evaluated in this spike because:

1. Coinbase Wallet also supports all three EIP-defined methods the app uses.
2. Its Playwright automation selectors would differ from MetaMask but the
   architectural approach (persistent context + xvfb-run) is identical.
3. The mock design for Issue #40 should be extension-agnostic; testing one
   extension is sufficient to validate the mock interface.

If Coinbase Wallet compatibility is required, follow the same pattern:
download the unpacked extension, discover selectors via locator inspection,
and update `metamask-compat.test.ts` with a parallel test suite.
