import '@testing-library/jest-dom';

// Newer Node versions define a global `localStorage` accessor that is unusable
// without `--localstorage-file` and shadows jsdom's Storage. Install an
// in-memory Storage when the global is missing or broken.
if (typeof globalThis.localStorage?.clear !== "function") {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k) => (store.has(k) ? (store.get(k) as string) : null),
    key: (i) => Array.from(store.keys())[i] ?? null,
    removeItem: (k) => void store.delete(k),
    setItem: (k, v) => void store.set(k, String(v)),
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: memoryStorage,
    configurable: true,
  });
}
