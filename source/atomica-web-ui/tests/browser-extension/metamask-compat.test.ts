/**
 * @file metamask-compat.test.ts
 * @description Research spike: MetaMask browser extension compatibility test.
 *
 * IMPORTANT — STANDALONE PLAYWRIGHT (NOT VITEST BROWSER MODE)
 * ============================================================
 * Vitest browser mode cannot load unpacked Chrome extensions because it uses
 * Playwright's `launch()` API, which starts an isolated non-persistent context.
 * Chrome/Chromium only allows extensions in persistent contexts started via
 * `launchPersistentContext()`. This file is therefore a standalone Playwright
 * test script that MUST be run via `bun run test:metamask` (or directly with
 * `node`), not via `vitest run`.
 *
 * HOW TO RUN
 * ----------
 *   # 1. Download MetaMask extension (one-time):
 *   ./tests/browser-extension/download-metamask.sh
 *
 *   # 2. Run this test (starts anvil automatically):
 *   cd source/atomica-web-ui
 *   bun run test:metamask
 *
 *   # Or with custom RPC:
 *   ETH_RPC_URL=http://127.0.0.1:8545 \
 *   ETH_CHAIN_ID=32382 \
 *   bun tests/browser-extension/metamask-compat.test.ts
 *
 * REQUIRES
 * --------
 *   - xvfb-run (for headless mode on Linux: `apt-get install xvfb`)
 *   - metamask-extension/ directory (run download-metamask.sh first)
 *   - A running Ethereum JSON-RPC node (anvil/geth) on ETH_RPC_URL
 *
 * VERIFIED FINDINGS (MetaMask 12.9.3 + Playwright 1.58 + Chromium)
 * -----------------------------------------------------------------
 * - MetaMask uses Manifest V3 with a service worker (not a background page).
 * - window.ethereum is injected into all http:// and https:// origins.
 *   It is NOT injected into file:// origins — tests must serve pages over HTTP.
 * - LavaMoat security prevents page.evaluate() from accessing MetaMask's
 *   extension page globals. Use locator-based selectors only on MM pages.
 * - Onboarding UI data-testid selectors (MetaMask 12.x):
 *     onboarding-terms-checkbox   — accept terms
 *     onboarding-import-wallet    — choose import flow
 *     metametrics-no-thanks       — opt out of analytics
 *     import-srp__srp-word-N      — seed phrase word inputs (N = 0..11)
 *     import-srp-confirm          — confirm seed phrase
 *     create-password-new         — new password field
 *     create-password-confirm     — password confirm field
 *     create-password-terms       — password page terms checkbox
 *     create-password-import      — submit import
 *     onboarding-complete-done    — finish onboarding
 *     pin-extension-next          — pin extension step next
 *     pin-extension-done          — pin extension step done
 * - Connection popup (notification.html) data-testid selectors:
 *     cancel-btn    — cancel connection
 *     confirm-btn   — approve connection
 * - wallet_addEthereumChain popup selectors:
 *     confirmation-submit-button  — approve adding network
 * - Transaction confirmation popup selectors:
 *     confirm-footer-cancel-button — reject
 *     confirm-footer-button        — confirm
 * - wallet_addEthereumChain + eth_requestAccounts + eth_sendTransaction all
 *   work correctly with a local Anvil node (chain ID 32382).
 * - The notification popup takes up to ~25 s on first load to render the
 *   React + LavaMoat app (service worker cold start). On warm loads it takes
 *   ~1-2 s. Use waitFor([data-testid]:visible) with a 45 s timeout.
 * - MetaMask notification popup reuse: After approving wallet_addEthereumChain,
 *   popup #1 navigates to #connect/... then closes in ~100 ms (too fast to
 *   click). MetaMask opens a NEW popup #2 for eth_requestAccounts. After
 *   approving eth_requestAccounts in popup #2, the same popup navigates to
 *   #confirm-transaction/... for eth_sendTransaction. All three approvals use
 *   at most two popup windows (popup #1 for addChain, popup #2 for connect and
 *   tx confirm). The notification queue pattern handles this correctly.
 *
 * See docs/development/browser-extension-compatibility.md for full findings.
 */

import { chromium, BrowserContext, Page } from "playwright";
import * as path from "path";
import * as fs from "fs";
import * as http from "http";
import * as assert from "assert";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const EXTENSION_DIR = path.join(__dirname, "metamask-extension");

const ETH_RPC_URL = process.env.ETH_RPC_URL ?? "http://127.0.0.1:8545";
const ETH_CHAIN_ID = parseInt(process.env.ETH_CHAIN_ID ?? "32382", 10);

/** Standard Hardhat/Anvil test mnemonic (first account = 0xf39Fd...) */
const TEST_MNEMONIC =
  process.env.SIGNER_MNEMONIC ??
  "test test test test test test test test test test test junk";

// ---------------------------------------------------------------------------
// Minimal HTTP server for the test page
// MetaMask only injects window.ethereum on http:// origins, not file://.
// ---------------------------------------------------------------------------

function startTestServer(
  chainId: number,
  rpcUrl: string,
): Promise<{ url: string; close: () => void }> {
  const chainIdHex = `0x${chainId.toString(16)}`;
  const html = `<!DOCTYPE html>
<html>
<head><title>MetaMask Extension Compat Test</title></head>
<body>
  <div id="status">ready</div>
  <div id="address"></div>
  <div id="txHash"></div>
  <div id="error"></div>
  <!-- Single click: add chain + connect in sequence -->
  <button id="setup">Setup + Connect</button>
  <!-- Send transaction after connection is established -->
  <button id="sign-tx" disabled>Sign TX</button>
  <script>
    const CHAIN_ID_HEX = '${chainIdHex}';
    const RPC_URL = '${rpcUrl}';

    document.getElementById('setup').addEventListener('click', async function() {
      try {
        document.getElementById('status').textContent = 'adding-network';
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: CHAIN_ID_HEX,
              chainName: 'Atomica Local Testnet',
              rpcUrls: [RPC_URL],
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
            }]
          });
        } catch (e) {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: CHAIN_ID_HEX }]
          });
        }
        document.getElementById('status').textContent = 'connecting';
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        document.getElementById('address').textContent = accounts[0] || '';
        document.getElementById('status').textContent = 'connected';
        document.getElementById('sign-tx').disabled = false;
      } catch (e) {
        document.getElementById('error').textContent = e.message;
        document.getElementById('status').textContent = 'setup-error';
      }
    });

    document.getElementById('sign-tx').addEventListener('click', async function() {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        document.getElementById('status').textContent = 'signing';
        const hash = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{ from: accounts[0], to: accounts[0], value: '0x0', gas: '0x5208' }]
        });
        document.getElementById('txHash').textContent = hash;
        document.getElementById('status').textContent = 'tx-submitted';
      } catch (e) {
        document.getElementById('error').textContent = e.message;
        document.getElementById('status').textContent = 'tx-error';
      }
    });
  </script>
</body>
</html>`;

  return new Promise((resolve, reject) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => server.close(),
      });
    });
    server.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// MetaMask onboarding automation
// ---------------------------------------------------------------------------

/**
 * Automate the MetaMask onboarding wizard for a fresh install.
 * Imports the test mnemonic and creates a test password.
 *
 * UI selectors verified against MetaMask 12.9.3.
 */
async function doOnboarding(mm: Page, mnemonic: string): Promise<void> {
  await mm.waitForLoadState("domcontentloaded");
  await mm.waitForTimeout(2000);

  // Step 1: Accept terms of use
  await mm
    .locator('[data-testid="onboarding-terms-checkbox"]')
    .waitFor({ state: "visible", timeout: 10_000 });
  await mm.locator('[data-testid="onboarding-terms-checkbox"]').click();

  // Step 2: Choose "Import an existing wallet"
  await mm.locator('[data-testid="onboarding-import-wallet"]').click();
  await mm.waitForTimeout(2000);

  // Step 3: Opt out of anonymous analytics
  const noThanks = mm.locator('[data-testid="metametrics-no-thanks"]');
  if (await noThanks.isVisible({ timeout: 3000 }).catch(() => false)) {
    await noThanks.click();
    await mm.waitForTimeout(2000);
  }

  // Step 4: Fill the 12-word seed phrase
  const words = mnemonic.split(" ");
  for (let i = 0; i < 12; i++) {
    const input = mm.locator(`[data-testid="import-srp__srp-word-${i}"]`);
    if (await input.isVisible({ timeout: 500 }).catch(() => false)) {
      await input.fill(words[i]);
    }
  }
  await mm.waitForTimeout(500);
  await mm.locator('[data-testid="import-srp-confirm"]').click();
  await mm.waitForTimeout(2000);

  // Step 5: Create a password
  await mm.locator('[data-testid="create-password-new"]').fill("TestPassword123!");
  await mm.locator('[data-testid="create-password-confirm"]').fill("TestPassword123!");

  const pwTerms = mm.locator('[data-testid="create-password-terms"]');
  if (await pwTerms.isVisible({ timeout: 1000 }).catch(() => false)) {
    await pwTerms.click();
  }

  await mm.locator('[data-testid="create-password-import"]').click();
  await mm.waitForTimeout(3000);

  // Step 6: Complete the wizard
  await mm.locator('[data-testid="onboarding-complete-done"]').click();
  await mm.waitForTimeout(1500);

  // Step 7: Pin extension (optional step that appears after onboarding)
  const pinNext = mm.locator('[data-testid="pin-extension-next"]');
  if (await pinNext.isVisible({ timeout: 2000 }).catch(() => false)) {
    await pinNext.click();
    await mm.waitForTimeout(1000);
    const pinDone = mm.locator('[data-testid="pin-extension-done"]');
    if (await pinDone.isVisible({ timeout: 2000 }).catch(() => false)) {
      await pinDone.click();
    }
    await mm.waitForTimeout(1500);
  }
}

/**
 * Create a notification popup queue that collects MetaMask notification pages
 * as they open. Call dequeue() to get the next popup in order.
 *
 * This avoids the race condition where MetaMask opens popup #2 before the
 * caller has set up a waitForEvent listener for it. By registering a single
 * persistent listener that queues all notification pages, we guarantee that
 * no popup is missed regardless of timing.
 */
function createNotificationQueue(ctx: BrowserContext): {
  dequeue: (timeoutMs?: number) => Promise<Page>;
  dispose: () => void;
} {
  const queue: Page[] = [];
  const waiters: Array<(p: Page) => void> = [];

  const handler = (p: Page) => {
    if (!p.url().includes("notification")) return;
    const waiter = waiters.shift();
    if (waiter) {
      waiter(p);
    } else {
      queue.push(p);
    }
  };

  ctx.on("page", handler);

  return {
    dequeue: (timeoutMs = 30_000) =>
      new Promise<Page>((resolve, reject) => {
        const next = queue.shift();
        if (next) {
          resolve(next);
          return;
        }
        const timer = setTimeout(() => {
          const idx = waiters.indexOf(resolve);
          if (idx >= 0) waiters.splice(idx, 1);
          reject(new Error("Timed out waiting for notification popup"));
        }, timeoutMs);
        waiters.push((p) => {
          clearTimeout(timer);
          resolve(p);
        });
      }),
    dispose: () => ctx.off("page", handler),
  };
}

/**
 * Click the specified button in a MetaMask notification popup page.
 *
 * MetaMask notification popups often navigate through multiple URL fragments
 * before reaching the target confirmation state. For example, after approving
 * wallet_addEthereumChain, the same popup page navigates to the
 * eth_requestAccounts confirmation (`#connect/...`).
 *
 * This function polls for the button becoming visible across navigations,
 * tolerating intermediate states where the button may not be present yet.
 *
 * LavaMoat note: page.evaluate() is blocked on extension pages. Use locators.
 */
async function approvePopup(popup: Page, buttonTestId: string): Promise<void> {
  // Wait for the LavaMoat + React bundle to render at least one testid element.
  // On first load the bundle may take 15-25 s (service worker cold start).
  // On subsequent loads (warm service worker) it takes ~1-2 s.
  await popup
    .locator("[data-testid]")
    .first()
    .waitFor({ state: "visible", timeout: 45_000 });

  // Now poll for the specific button. Allow 10 s for the target button to
  // appear after the React bundle has rendered.
  const deadline = Date.now() + 10_000;
  let clicked = false;
  while (!clicked && !popup.isClosed() && Date.now() < deadline) {
    const btn = popup.locator(`[data-testid="${buttonTestId}"]`);
    const visible = await btn.isVisible({ timeout: 500 }).catch(() => false);
    if (visible) {
      try {
        await btn.click();
        clicked = true;
      } catch {
        // Page may have navigated away mid-click; retry
      }
    } else {
      await popup.waitForTimeout(200).catch(() => undefined);
    }
  }
}

// ---------------------------------------------------------------------------
// Main test
// ---------------------------------------------------------------------------

async function runTest(): Promise<void> {
  // Precondition: MetaMask extension must be present
  if (!fs.existsSync(EXTENSION_DIR)) {
    throw new Error(
      `MetaMask extension not found at ${EXTENSION_DIR}.\n` +
        "Run: ./tests/browser-extension/download-metamask.sh",
    );
  }

  const { url: pageUrl, close: closeServer } = await startTestServer(
    ETH_CHAIN_ID,
    ETH_RPC_URL,
  );
  const userDataDir = fs.mkdtempSync("/tmp/mm-playwright-");

  console.log(`[MetaMask Compat] Test page: ${pageUrl}`);
  console.log(`[MetaMask Compat] Extension: ${EXTENSION_DIR}`);
  console.log(`[MetaMask Compat] RPC: ${ETH_RPC_URL} (chain ${ETH_CHAIN_ID})`);

  let context: BrowserContext | undefined;

  try {
    // --- 1. Launch Chromium with MetaMask extension ---
    // Extensions require launchPersistentContext (non-persistent launch ignores
    // --load-extension). The browser must NOT be headless (Chrome blocks
    // extensions in headless mode). Use xvfb-run on Linux CI.
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_DIR}`,
        `--load-extension=${EXTENSION_DIR}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--password-store=basic",
      ],
    });

    // --- 2. Discover MetaMask extension ID from service worker ---
    // MetaMask 12+ (Manifest V3) uses a service worker. The extension ID is
    // deterministic for an unpacked extension based on its directory path, but
    // easiest to read from the service worker URL after launch.
    const extId: string = await new Promise((resolve) => {
      const check = (url: string) => {
        const m = url.match(/chrome-extension:\/\/([a-z]{32})/);
        if (m) resolve(m[1]);
      };
      for (const w of context!.serviceWorkers()) check(w.url());
      context!.on("serviceworker", (w) => check(w.url()));
    });
    console.log(`[MetaMask Compat] Extension ID: ${extId}`);

    // --- 3. Complete MetaMask onboarding ---
    // MetaMask auto-opens the onboarding page in a new tab on first launch.
    const mmPage = await context.waitForEvent("page", {
      predicate: (p) => p.url().includes("chrome-extension://"),
      timeout: 15_000,
    });

    await doOnboarding(mmPage, TEST_MNEMONIC);

    // After onboarding, navigate to the MetaMask home page and wait for the
    // service worker + LavaMoat bundle to fully initialize. If this warm-up is
    // skipped, the notification popup may get stuck on MetaMask's loading
    // spinner because the service worker is still booting when the first popup
    // is triggered.
    await mmPage.goto(
      `chrome-extension://${extId}/home.html`,
      { waitUntil: "load" },
    );
    // Wait for the home page header to appear — this confirms the background
    // service worker has fully processed the state and is ready to handle
    // incoming RPC requests from web pages.
    await mmPage
      .locator('[data-testid="account-menu-icon"]')
      .waitFor({ state: "visible", timeout: 20_000 });

    console.log(
      "[MetaMask Compat] Onboarding complete. Account: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    );

    // --- 4. Open test page ---
    const testPage = await context.newPage();
    await testPage.goto(pageUrl, { waitUntil: "domcontentloaded" });

    // --- 5. Trigger wallet_addEthereumChain + eth_requestAccounts ---
    //
    // Sequence MetaMask follows when the page calls wallet_addEthereumChain
    // followed by eth_requestAccounts in the same JS function:
    //
    //   Popup #1  (notification.html#confirmation) — approve adding the chain
    //   → Popup #1 closes
    //   Popup #2  (notification.html#connect/...)  — approve eth_requestAccounts
    //   → Popup #2 closes
    //
    // Both popups open as NEW pages (separate "page" events on the context).
    // We use a notification queue (a persistent page listener that buffers
    // popups as they arrive) so that no popup can be missed even if it opens
    // before we call dequeue().

    // Start the notification queue BEFORE clicking so no popup is missed.
    const popupQueue = createNotificationQueue(context);

    // Trigger wallet_addEthereumChain + eth_requestAccounts
    await testPage.click("#setup");
    console.log("[MetaMask Compat] Triggered wallet_addEthereumChain");

    // MetaMask popup flow for wallet_addEthereumChain + eth_requestAccounts:
    //
    // 1. Popup #1 opens at notification.html (blank)
    // 2. Popup #1 navigates to #confirmation (addChain approval UI)
    //    Note: the React + LavaMoat bundle may take 15-25 s to render on first
    //    load, until the service worker is fully warmed up.
    // 3. We click confirmation-submit-button
    // 4. Popup #1 navigates to #connect/... then CLOSES in ~100 ms — too fast
    //    to interact with.
    // 5. Popup #2 opens at notification.html as a NEW page with the same
    //    #connect/... route. It renders in ~1-2 s (service worker is now warm).
    // 6. We click confirm-btn in Popup #2.
    //
    // The notification queue ensures Popup #2 is captured even if it opens
    // before we call dequeue().

    const addChainPopup = await popupQueue.dequeue();
    await approvePopup(addChainPopup, "confirmation-submit-button");
    console.log("[MetaMask Compat] Approved wallet_addEthereumChain");

    // After approving addChain, MetaMask opens a NEW notification window for
    // eth_requestAccounts (popup #1 closes within ~100 ms). Dequeue popup #2
    // with a generous timeout to handle cases where popup #2 is delayed.
    const connectPopup = await popupQueue.dequeue(15_000);
    await approvePopup(connectPopup, "confirm-btn");
    console.log("[MetaMask Compat] Approved eth_requestAccounts");

    // --- 6. Assert the Ethereum address is returned ---
    await testPage.waitForFunction(
      () => {
        const el = document.getElementById("address");
        return el?.textContent?.startsWith("0x");
      },
      { timeout: 15_000 },
    );

    const address = (await testPage.locator("#address").textContent()) ?? "";
    assert.match(
      address,
      /^0x[0-9a-fA-F]{40}$/,
      `Expected Ethereum address, got: ${address}`,
    );
    console.log(`[MetaMask Compat] PASS 1: eth_requestAccounts → ${address}`);

    // --- 7. Trigger eth_sendTransaction ---
    //
    // MetaMask may reuse the existing notification window (connectPopup) for
    // the transaction confirmation rather than opening a new one. After
    // approving the connection (confirm-btn), the same popup navigates to
    // #confirm-transaction/... for the tx confirmation.
    //
    // Strategy: try connectPopup first (it navigates to #confirm-transaction).
    // If it's already closed, fall back to a new popup from the queue.
    await testPage.click("#sign-tx");
    console.log("[MetaMask Compat] Triggered eth_sendTransaction");

    const txPopup = connectPopup.isClosed()
      ? await popupQueue.dequeue(15_000)
      : connectPopup;
    await approvePopup(txPopup, "confirm-footer-button");
    console.log("[MetaMask Compat] Approved eth_sendTransaction");

    // --- 8. Assert a tx hash is returned ---
    await testPage.waitForFunction(
      () => {
        const el = document.getElementById("txHash");
        return el?.textContent?.match(/^0x[0-9a-f]{64}$/i) !== null;
      },
      { timeout: 60_000 },
    );

    const txHash =
      (await testPage.locator("#txHash").textContent()) ?? "";
    assert.match(
      txHash,
      /^0x[0-9a-f]{64}$/i,
      `Expected tx hash, got: ${txHash}`,
    );
    console.log(`[MetaMask Compat] PASS 2: eth_sendTransaction → ${txHash}`);

    console.log("\n[MetaMask Compat] ALL ASSERTIONS PASSED");
  } finally {
    closeServer();
    if (context) {
      // popupQueue may be undefined if we failed before creating it
      // (TypeScript will narrow this but we guard defensively)
      await context.close();
    }
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

runTest().catch((err) => {
  console.error("[MetaMask Compat] FAILED:", err.message);
  process.exit(1);
});
