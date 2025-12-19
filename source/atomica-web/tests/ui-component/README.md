# UI Component Tests

## Overview

This directory contains **UI component tests** for React components in the Atomica web application. These tests verify that components render correctly, handle user interactions, and integrate properly with state management and wallet providers.

## Important: Testing Library Configuration

**We use standard vitest matchers, NOT `@testing-library/jest-dom`.**

- ✅ DO use `screen.getByText()` for positive assertions (throws if not found)
- ✅ DO use `expect(screen.queryByText()).toBeNull()` for negative assertions
- ❌ DON'T import or use `@testing-library/jest-dom`
- ❌ DON'T use `.toBeInTheDocument()`, `.toBeVisible()`, etc.

This simplifies our testing setup and works seamlessly with Vitest's browser mode.

## What Belongs Here

UI component tests are appropriate for:

- **React component rendering** - Components display correctly with various props
- **User interactions** - Click, input, form submission events
- **State updates** - Component state changes trigger UI updates
- **Conditional rendering** - Components show/hide based on conditions
- **Wallet integration** - Components interact with wallet providers
- **Form validation** - Input validation and error messages
- **Event handling** - Buttons, links, and other interactive elements

## What Doesn't Belong Here

- Pure logic without UI → `tests/unit/`
- Full end-to-end flows → `tests/integration/`
- Infrastructure validation → `tests/meta/`
- Non-React utilities → `tests/unit/`

## Test Environment

**Environment**: Browser (Chromium via Playwright)
**Config**: `vitest.config.ts`
**Run**: `npm test -- tests/ui-component/`

UI component tests run in a real browser environment to ensure accurate rendering and event handling. React Testing Library is used for component testing following best practices.

## Current Test Files

### 1. `AccountConnection.test.tsx`

**Purpose**: Account connection UI component

**What it tests**:

- Component renders with wallet providers
- Connect button appears and is clickable
- Connected state displays correctly
- Disconnect functionality works
- Wallet address display

**Use cases**:

- Wallet connection interface
- Account status display
- User authentication flow

### 2. `AccountStatus.integration.test.tsx`

**Purpose**: Account status component with blockchain integration

**What it tests**:

- **Unfunded account warning** - Shows "Account not found on chain" message
- **Balance display after funding** - Tests complete flow from unfunded → funded
- Account balance updates via polling (5 second intervals)
- Loading states
- Error handling
- Localnet integration

**Test scenarios**:

1. **Without funded account** - Verifies warning message for 0 APT balance
2. **With funded account** - Funds via faucet, waits for hook to poll, verifies balance display

**Use cases**:

- Account dashboard
- Balance monitoring
- Faucet integration
- Transaction confirmations

**Note**: This is an integration test (requires localnet) but tests a UI component, hence the `.integration.test.tsx` naming.

### 3. `TxButton.simulate-submit.test.tsx`

**Purpose**: Transaction button with simulated submission

**What it tests**:

- Transaction button rendering
- Submit action triggers transaction
- Loading states during submission
- Success/error feedback
- Button disabled states

**Use cases**:

- Transaction submission UI
- Form actions
- User feedback during transactions

### 4. `TxButton.skip-submit.test.tsx`

**Purpose**: Transaction button without actual submission

**What it tests**:

- Button component rendering
- Props handling
- Click events
- Disabled states
- Visual states (loading, success, error)

**Use cases**:

- Component API testing
- Visual regression testing
- State machine verification

### 5. `SimpleTransfer.browser.test.ts`

**Purpose**: Simple transfer flow in browser

**What it tests**:

- Complete transfer UI flow
- Form input handling
- Transaction submission
- Success/error messages
- Browser environment integration

**Use cases**:

- Transfer interface
- End-to-end browser flow
- Real browser API usage

## Running Tests

### Run all UI component tests

```bash
npm test -- tests/ui-component/
```

### Run specific test file

```bash
npm test -- tests/ui-component/AccountConnection.test.tsx
npm test -- tests/ui-component/TxButton.simulate-submit.test.tsx
```

### Run with verbose output

```bash
npm test -- tests/ui-component/ --reporter=verbose
```

### Watch mode

```bash
npm test -- tests/ui-component/ --watch
```

## Writing UI Component Tests

### Test Structure with React Testing Library

**Important**: We use standard vitest matchers, **NOT** `@testing-library/jest-dom`. Do not import or use jest-dom.

```typescript
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MyComponent } from "../../src/components/MyComponent";

describe("MyComponent", () => {
  it("should render with correct text", () => {
    render(<MyComponent text="Hello World" />);
    // getByText throws if not found, so this is an implicit assertion
    screen.getByText("Hello World");
  });

  it("should handle button click", async () => {
    const user = userEvent.setup();
    const onClickMock = vi.fn();

    render(<MyComponent onClick={onClickMock} />);

    await user.click(screen.getByRole("button"));

    expect(onClickMock).toHaveBeenCalledTimes(1);
  });

  it("should not show element when hidden", () => {
    render(<MyComponent hidden={true} />);
    // Use queryBy* (returns null) for negative assertions
    expect(screen.queryByText("Hidden Content")).toBeNull();
  });
});
```

### Testing with Wallet Providers

```typescript
import { MockWallet } from "../browser-utils/MockWallet";

describe("Component with wallet", () => {
  it("should connect to wallet", async () => {
    const user = userEvent.setup();
    const mockWallet = new MockWallet("0x1234...");

    // Inject mock wallet before rendering
    window.ethereum = mockWallet.getProvider();

    render(<MyWalletComponent />);

    // Test wallet connection
    await user.click(screen.getByText("Connect"));
    // getByText with regex throws if not found
    screen.getByText(/0x1234/);
  });
});
```

### Testing with Localnet (Integration Tests)

```typescript
import { commands } from "vitest/browser";

describe.sequential("Component with blockchain", () => {
  beforeAll(async () => {
    await commands.setupLocalnet();
    await commands.deployContracts();
  }, 120000);

  it("should fetch and display balance", async () => {
    const address = "0xabc...";
    await commands.fundAccount(address, 1_000_000_000);

    render(<BalanceDisplay address={address} />);

    await waitFor(() => {
      screen.getByText("10.0000"); // Formatted balance
    });
  });
});
```

## Best Practices

### 1. Query by Accessibility

Prefer queries in this order (most accessible to least):

```typescript
// ✅ BEST - Accessible to everyone
screen.getByRole("button", { name: "Submit" });
screen.getByLabelText("Email");
screen.getByPlaceholderText("Enter email");

// ✅ GOOD - Semantic content
screen.getByText("Welcome");

// ❌ AVOID - Implementation details
screen.getByTestId("submit-button");
screen.getByClassName("btn-primary");
```

### 2. Wait for Asynchronous Updates

```typescript
// ✅ CORRECT - Wait for element to appear
await waitFor(() => {
  screen.getByText("Success");
});

// ❌ WRONG - May fail due to timing
screen.getByText("Success"); // Throws immediately if not present
```

### 3. User-Centric Testing

```typescript
// ✅ CORRECT - Simulate real user interactions
const user = userEvent.setup();
await user.type(screen.getByLabelText("Email"), "user@example.com");
await user.click(screen.getByRole("button", { name: "Submit" }));

// ❌ WRONG - Direct DOM manipulation
fireEvent.change(input, { target: { value: "user@example.com" } });
fireEvent.click(button);
```

### 4. Test Component API, Not Implementation

```typescript
// ✅ CORRECT - Test behavior
it("should display error message on invalid input", async () => {
  const user = userEvent.setup();
  render(<LoginForm />);
  await user.click(screen.getByRole("button", { name: "Login" }));
  screen.getByText("Email is required");
});

// ❌ WRONG - Test implementation details
it("should set error state", () => {
  const { container } = render(<LoginForm />);
  expect(container.querySelector(".error-state")).toBe(true);
});
```

### 5. Coding Standards

**CRITICAL**: All test code must meet the Definition of Done before being considered complete.

#### Preflight Checklist

Before marking any test work as done, verify:

- [ ] Tests written FIRST (Test-Driven Development)
- [ ] All tests pass (`npm test`)
- [ ] Zero linting errors (`npm run lint`)
- [ ] Code formatted (`npm run format`)
- [ ] Type check passes (`npx tsc --noEmit`)
- [ ] No type suppressions (`@ts-ignore`, `any`) in src/
- [ ] Accessible queries used (getByRole, getByLabelText)
- [ ] User interactions via userEvent.setup()
- [ ] Async updates use waitFor()
- [ ] JSDoc comments on complex test helpers

**See**: `/Users/lucas/code/rust/atomica/docs/development/typescript-coding-guidelines.md` for complete standards.

## Common Patterns

### Testing Forms

```typescript
describe("ContactForm", () => {
  it("should submit with valid data", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<ContactForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Name"), "John Doe");
    await user.type(screen.getByLabelText("Email"), "john@example.com");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "John Doe",
      email: "john@example.com",
    });
  });
});
```

### Testing Loading States

```typescript
describe("DataComponent", () => {
  it("should show loading state", () => {
    render(<DataComponent loading={true} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Loading...");
  });

  it("should show data when loaded", async () => {
    const { rerender } = render(<DataComponent loading={true} />);

    rerender(<DataComponent loading={false} data={mockData} />);

    expect(screen.queryByRole("status")).toBeNull();
    screen.getByText(mockData.title);
  });
});
```

### Testing Error States

```typescript
describe("ErrorBoundary", () => {
  it("should display error message", () => {
    render(<ErrorBoundary error="Something went wrong" />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/Something went wrong/);
  });
});
```

### Testing Conditional Rendering

```typescript
describe("AuthButton", () => {
  it("should show login when not authenticated", () => {
    render(<AuthButton isAuthenticated={false} />);
    screen.getByRole("button", { name: "Login" });
  });

  it("should show logout when authenticated", () => {
    render(<AuthButton isAuthenticated={true} />);
    screen.getByRole("button", { name: "Logout" });
  });

  it("should not show login when authenticated", () => {
    render(<AuthButton isAuthenticated={true} />);
    expect(screen.queryByRole("button", { name: "Login" })).toBeNull();
  });
});
```

## Test Utilities

### Browser Utilities

Located in `tests/browser-utils/`:

- **`MockWallet.ts`** - Mock Ethereum wallet provider
- **`wallet-mock.ts`** - Browser-compatible wallet mock setup
- **`faucet.ts`** - Browser-compatible faucet client

See [browser-utils/README.md](../browser-utils/README.md) for details.

### React Testing Library Utilities

Commonly used utilities:

- `render()` - Render a React component
- `screen` - Query rendered elements
- `waitFor()` - Wait for async updates
- `userEvent.setup()` - Simulate user interactions
- `within()` - Scope queries to a container

## Integration with Localnet

Some UI component tests require localnet for blockchain integration. These tests:

- Use `describe.sequential()` for sequential execution
- Call `commands.setupLocalnet()` in `beforeAll()`
- Use `commands.fundAccount()` to set up test accounts
- Wait for transactions with proper delays

**See**: [Integration Tests README](../integration/README.md) for localnet patterns.

## Troubleshooting

### Element not found

```typescript
// Problem: Element not appearing immediately
screen.getByText("Submit"); // Throws error

// Solution: Wait for element to appear
await waitFor(() => {
  screen.getByText("Submit");
});

// Or check if element doesn't exist (negative assertion)
expect(screen.queryByText("Submit")).toBeNull();
```

### Assertion Patterns

**DO NOT** use `@testing-library/jest-dom` matchers like `.toBeInTheDocument()`. Use these instead:

```typescript
// ✅ POSITIVE ASSERTIONS - Element should exist
screen.getByText("Text"); // Throws if not found - implicit assertion
expect(screen.queryByText("Text")).toBeTruthy(); // Explicit check

// ✅ NEGATIVE ASSERTIONS - Element should not exist
expect(screen.queryByText("Text")).toBeNull();
expect(screen.queryByText("Text")).toBeFalsy();

// ✅ ASYNC ASSERTIONS - Wait for element
await waitFor(() => {
  screen.getByText("Text");
});

// ❌ AVOID - Don't use jest-dom matchers
expect(screen.getByText("Text")).toBeInTheDocument(); // DON'T USE
expect(screen.queryByText("Text")).not.toBeInTheDocument(); // DON'T USE
```

### User events not working

```typescript
// Problem: Click not registering
fireEvent.click(button); // Unreliable

// Solution: Use userEvent
const user = userEvent.setup();
await user.click(button); // More reliable
```

### Provider errors

```typescript
// Problem: Component needs context
render(<MyComponent />); // Error: useWallet() requires WalletProvider

// Solution: Wrap with providers
render(
  <WalletProvider>
    <MyComponent />
  </WalletProvider>
);
```

### Async state updates

```typescript
// Problem: State updates after test completes
it("should update", () => {
  render(<AsyncComponent />);
  screen.getByText("Loaded"); // Throws - element not yet rendered
});

// Solution: Wait for updates
it("should update", async () => {
  render(<AsyncComponent />);
  await waitFor(() => {
    screen.getByText("Loaded");
  });
});
```

## Performance Considerations

UI component tests should be relatively fast:

- Target: <500ms per test
- Use shallow rendering when possible
- Mock expensive operations (API calls, crypto)
- Avoid unnecessary waits
- Clean up after tests (timers, listeners)

If a test takes >5 seconds, consider:

- Mocking async operations
- Reducing test scope
- Moving to integration tests if testing full flows

## Contributing

When adding new UI component tests:

1. **Follow TDD** - Write tests before implementing components
2. **Test user behavior** - Not implementation details
3. **Use accessible queries** - getByRole, getByLabelText
4. **Simulate real interactions** - Use userEvent.setup()
5. **Wait for async updates** - Use waitFor()
6. **Mock dependencies** - Wallet providers, API calls
7. **Update this README** - Add your test to "Current Test Files"
8. **Run all tests** - Ensure new tests don't break existing tests
9. **Check coding standards** - Follow the preflight checklist

## See Also

- [Main Test Documentation](../README.md)
- [Unit Tests](../unit/README.md)
- [Integration Tests](../integration/README.md)
- [Browser Utilities](../browser-utils/README.md)
- [TypeScript Coding Guidelines](/Users/lucas/code/rust/atomica/docs/development/typescript-coding-guidelines.md)
- [React Testing Library Documentation](https://testing-library.com/docs/react-testing-library/intro/)
- [Vitest Documentation](https://vitest.dev/)
