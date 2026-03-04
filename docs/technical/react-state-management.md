# React Client State Management — Best Practices (No Third-Party Libraries)

React 19+ provides everything needed for clean, scalable state management without external dependencies. This document describes the patterns we use and why.

## Principles

1. **Separate server state from client state.** Data fetched from the network (balances, contract status, block heights) has different lifecycle concerns than purely local UI state (current view, form inputs, modal open/closed). Mixing them leads to unnecessary re-renders and stale data bugs.

2. **Co-locate state with its domain.** State should live as close to where it's used as possible. Only lift state up when two sibling components genuinely need to share it.

3. **Split contexts by update frequency.** A context that updates every second (balances) will cause every consumer to re-render every second. Keep fast-changing state isolated so components that only need slow-changing state (account, network config) are not affected.

4. **Contexts are black boxes.** Components call the hook — they never reach into a parent's props to get state that logically belongs to a different domain.

## State Categories

### Client state
Pure UI state that never leaves the browser. Examples: current view/page, modal visibility, form input values, optimistic transaction state.

**Tool:** `useState`, `useReducer`, or a shared Context when multiple components need the same piece.

### Server / async state
Data fetched from the network that needs to be kept fresh. Examples: ETH/APT balances, contract deployment status, block heights.

**Tool:** Custom hooks with polling or event-driven refresh, optionally shared via Context so multiple components read from one fetch rather than each issuing their own.

### Global config state
Rarely-changing configuration shared across the whole app. Examples: network host, wallet account address.

**Tool:** React Context — wrap the app once, consume anywhere via a hook.

## Context Pattern

Each domain gets its own file that exports a provider and a hook:

```tsx
// context/WalletContext.tsx
import { createContext, useContext, useState, useEffect } from "react"

interface WalletContextValue {
  account: string | null
  connect: () => Promise<void>
}

const WalletContext = createContext<WalletContextValue | null>(null)

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<string | null>(null)

  const connect = async () => {
    // wallet connection logic
  }

  useEffect(() => {
    // auto-connect if already authorised
  }, [])

  return (
    <WalletContext.Provider value={{ account, connect }}>
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet() {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error("useWallet must be used within WalletProvider")
  return ctx
}
```

Providers compose at the app root:

```tsx
// main.tsx
<NetworkConfigProvider>
  <WalletProvider>
    <BalancesProvider>
      <App />
    </BalancesProvider>
  </WalletProvider>
</NetworkConfigProvider>
```

`App.tsx` renders views. Views call hooks. No prop drilling.

## Async State Pattern

Server state lives in a custom hook that owns the fetch lifecycle — loading state, error handling, polling interval, and cancellation on unmount. When the same data is needed by multiple components, wrap the hook in a context so there is one fetch, many readers.

```tsx
// context/BalancesContext.tsx
import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { useWallet } from "./WalletContext"

interface Balances {
  eth: bigint
  fakeETH: bigint
  fakeUSD: bigint
  loading: boolean
}

interface BalancesContextValue extends Balances {
  refresh: () => Promise<void>
}

const BalancesContext = createContext<BalancesContextValue | null>(null)

export function BalancesProvider({ children }: { children: React.ReactNode }) {
  const { account } = useWallet()
  const [state, setState] = useState<Balances>({
    eth: 0n, fakeETH: 0n, fakeUSD: 0n, loading: true,
  })

  const load = useCallback(async () => {
    if (!account) {
      setState({ eth: 0n, fakeETH: 0n, fakeUSD: 0n, loading: false })
      return
    }
    // fetch balances...
  }, [account])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    const poll = async () => {
      await load()
      if (!cancelled) timer = setTimeout(poll, 5000)
    }

    void poll()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [load])

  return (
    <BalancesContext.Provider value={{ ...state, refresh: load }}>
      {children}
    </BalancesContext.Provider>
  )
}

export const useBalances = () => {
  const ctx = useContext(BalancesContext)
  if (!ctx) throw new Error("useBalances must be used within BalancesProvider")
  return ctx
}
```

## React 19 Additions

### `use()`
Consume a context or unwrap a promise inline, including inside conditionals:

```tsx
const { account } = use(WalletContext)
```

Useful for suspense-based data loading where the component declaratively waits for a promise to resolve.

### `useOptimistic`
For transaction flows where you want the UI to reflect the expected outcome immediately, before the chain confirms:

```tsx
const [optimisticBalance, updateOptimistic] = useOptimistic(
  balances.fakeUSD,
  (current, delta: bigint) => current - delta,
)

const bid = async (amount: bigint) => {
  updateOptimistic(amount)       // UI updates instantly
  await submitBidTransaction()   // chain catches up asynchronously
}
```

### `useActionState` (replaces `useFormState`)
Manages the pending/result state of an async action tied to a form or button, reducing boilerplate in transaction submission components:

```tsx
const [state, submitAction, isPending] = useActionState(async (prev, formData) => {
  const amount = BigInt(formData.get("amount") as string)
  await submitBid(amount)
  return { success: true }
}, null)
```

## Re-render Optimisation

Context causes every consumer to re-render when the value changes. For contexts that update frequently:

- **Split the context** into a static part (account address, which rarely changes) and a dynamic part (balances, which change every poll).
- **Memoize the context value** with `useMemo` so a new object reference isn't created on every render of the provider.

```tsx
const value = useMemo(() => ({ account, connect }), [account])
return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
```

## File Layout

```
src/
  context/
    WalletContext.tsx        — account, connect/disconnect
    NetworkConfigContext.tsx — host, setHost (already implemented)
    BalancesContext.tsx      — eth/aptos balances, refresh
    ContractStatusContext.tsx — evm/aptos deployment status
  hooks/
    useEthereumBalances.ts   — raw fetch logic (consumed by BalancesContext)
    useAptosBalances.ts
    useContractStatuses.ts
  views/
    MainView.tsx
    SettingsView.tsx
  components/
    ...
```

Custom hooks in `hooks/` contain the fetch/poll logic. Contexts in `context/` wrap those hooks to make their results globally accessible. Components and views only import from hooks and contexts — never from each other's internals.

## When This Is Not Enough

If the component tree becomes very deep, context re-renders become a performance problem, or you need fine-grained subscriptions (only re-render when a specific field changes), the next step without third-party libraries is the **`useSyncExternalStore`** hook. It lets you subscribe components directly to any external store — including a hand-rolled pub/sub or an observable — with React's concurrent-mode guarantees, and components only re-render when the slice of state they subscribed to actually changes.
