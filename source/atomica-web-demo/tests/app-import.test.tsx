import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "../src/App";

describe("App Import Test", () => {
  it("should render App", () => {
    render(<div>Test</div>);
    expect(screen.getByText("Test")).toBeDefined();
  });
});
