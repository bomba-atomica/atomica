import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "../src/App";

describe("App Component Test", () => {
  it("should render App component", () => {
    render(<App />);
    // App should render the header
    expect(screen.getByText("Atomica Auction")).toBeDefined();
  });
});
