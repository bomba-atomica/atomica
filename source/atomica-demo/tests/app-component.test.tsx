import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "../src/App";

describe("App Component Test", () => {
  it("should render App component", () => {
    render(<App />);
    // App should render the header
    expect(screen.getByText("Atomica Auction")).toBeDefined();
  });

  it.todo(
    "SCOUT(#236) the rendered app contains the sell flow, the bidder, the open step, the settle action and the release action when a wallet is connected",
  );
  it.todo(
    "SCOUT(#236) the vite dev proxy table has the /aptos-api and /eth-api keys",
  );
});
