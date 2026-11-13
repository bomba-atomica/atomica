/**
 * Unit tests for the extra Aptos endpoints of the chain configuration.
 *
 * - `VITE_APTOS_EXTRA_FULLNODE_URLS` parsing into `extraFullnodeUrls`
 *   (`parseExtraFullnodeUrls`, which `DEFAULT_CHAIN_CONFIG` calls on the
 *   variable).
 * - `buildExtraAptosFullnodeUrls`: in a browser, extra endpoint `n` maps to the
 *   same-origin proxy path `/aptos-api-<n>/v1`; outside a browser the URLs are
 *   returned unchanged. The suite runs in Chromium, so the Node branch is
 *   reached by passing a `null` origin.
 */
import { describe, it, expect } from "vitest";
import { parseExtraFullnodeUrls } from "../src/chain-config.js";
import { buildExtraAptosFullnodeUrls } from "../src/network-host.js";

const URL_A = "http://10.0.0.2:8080/v1";
const URL_B = "http://10.0.0.3:8080/v1";

describe("extra Aptos endpoints", () => {
  it("VITE_APTOS_EXTRA_FULLNODE_URLS with two comma-separated URLs gives two extraFullnodeUrls, and an empty value gives none", () => {
    expect(parseExtraFullnodeUrls(`${URL_A},${URL_B}`)).toEqual([URL_A, URL_B]);
    expect(parseExtraFullnodeUrls(` ${URL_A} , ,${URL_B} ,`)).toEqual([
      URL_A,
      URL_B,
    ]);
    expect(parseExtraFullnodeUrls("")).toEqual([]);
    expect(parseExtraFullnodeUrls(undefined)).toEqual([]);
  });

  it("in a browser, buildExtraAptosFullnodeUrls maps two extra URLs to /aptos-api-1/v1 and /aptos-api-2/v1 on the page origin; in Node it returns them unchanged", () => {
    const origin = window.location.origin;
    expect(buildExtraAptosFullnodeUrls([URL_A, URL_B])).toEqual([
      `${origin}/aptos-api-1/v1`,
      `${origin}/aptos-api-2/v1`,
    ]);
    expect(buildExtraAptosFullnodeUrls([URL_A, URL_B], null)).toEqual([
      URL_A,
      URL_B,
    ]);
    expect(buildExtraAptosFullnodeUrls([])).toEqual([]);
  });
});
