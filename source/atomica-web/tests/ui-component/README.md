# UI Component Tests

## Overview

This directory contains **UI component tests** for React components in the Atomica web application. These tests verify that components render correctly, handle user interactions, and integrate properly with state management and wallet providers.

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

- Account balance display
- Balance updates after transactions
- Loading states
- Error handling
- Localnet integration

**Use cases**:

- Account dashboard
- Balance monitoring
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

```typescript
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MyComponent } from "../../src/components/MyComponent";

describe("MyComponent", () => {
  it("should render with correct text", () => {
    render(<MyComponent text="Hello World" />);
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("should handle button click", async () => {
    const user = userEvent.setup();
    const onClickMock = vi.fn();

    render(<MyComponent onClick={onClickMock} />);

    await user.click(screen.getByRole("button"));

    expect(onClickMock).toHaveBeenCalledTimes(1);
  });
});
```

### Testing with Wallet Providers

```typescript
import { WalletProvider } from "@aptos-labs/wallet-adapter-react";
import { MockWallet } from "../browser-utils/MockWallet";

describe("Component with wallet", () => {
  it("should connect to wallet", async () => {
    const mockWallet = new MockWallet("0x1234...");

    render(
      <WalletProvider>
        <MyWalletComponent />
      </WalletProvider>
    );

    // Inject mock wallet
    window.ethereum = mockWallet.getProvider();

    // Test wallet connection
    await user.click(screen.getByText("Connect"));
    expect(screen.getByText(/0x1234/)).toBeInTheDocument();
  });
});
```

### Testing with Localnet (Integration Tests)

```typescript
import { commands } from "vitest/browser";

describe.sequential("Component with blockchain", () => {
  beforeAll(async () => {
    await commands.setupLocalnet();
  }, 120000);

  it("should fetch and display balance", async () => {
    const address = "0xabc...";
    await commands.fundAccount(address, 1_000_000_000);

    render(<BalanceDisplay address={address} />);

    await waitFor(() => {
      expect(screen.getByText("10 APT")).toBeInTheDocument();
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
  expect(screen.getByText("Success")).toBeInTheDocument();
});

// ❌ WRONG - May fail due to timing
expect(screen.getByText("Success")).toBeInTheDocument();
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
  render(<LoginForm />);
  await user.click(screen.getByRole("button", { name: "Login" }));
  expect(screen.getByText("Email is required")).toBeInTheDocument();
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
    expect(screen.getByRole("status")).toHaveTextContent("Loading...");
  });

  it("should show data when loaded", async () => {
    const { rerender } = render(<DataComponent loading={true} />);

    rerender(<DataComponent loading={false} data={mockData} />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText(mockData.title)).toBeInTheDocument();
  });
});
```

### Testing Error States

```typescript
describe("ErrorBoundary", () => {
  it("should display error message", () => {
    render(<ErrorBoundary error="Something went wrong" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
  });
});
```

### Testing Conditional Rendering

```typescript
describe("AuthButton", () => {
  it("should show login when not authenticated", () => {
    render(<AuthButton isAuthenticated={false} />);
    expect(screen.getByRole("button", { name: "Login" })).toBeInTheDocument();
  });

  it("should show logout when authenticated", () => {
    render(<AuthButton isAuthenticated={true} />);
    expect(screen.getByRole("button", { name: "Logout" })).toBeInTheDocument();
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
// Problem: Element not appearing
screen.getByText("Submit"); // Throws error

// Solution: Wait for element
await waitFor(() => {
  expect(screen.getByText("Submit")).toBeInTheDocument();
});

// Or check if element exists
expect(screen.queryByText("Submit")).toBeInTheDocument();
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
  expect(screen.getByText("Loaded")).toBeInTheDocument(); // Fails
});

// Solution: Wait for updates
it("should update", async () => {
  render(<AsyncComponent />);
  await waitFor(() => {
    expect(screen.getByText("Loaded")).toBeInTheDocument();
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
