# GitHub Actions Workflows

This directory contains CI/CD workflows for the Atomica project.

## Workflows

### `build-aptos-binary.yaml` (Reusable Workflow)

A reusable workflow that builds and caches the `aptos` binary from the `source/zapatos` submodule.

**Key Features:**
- Builds aptos binary with `--features testing` flag
- Caches the binary based on the zapatos commit hash
- Automatically rebuilds when zapatos submodule is updated
- Exports cache key and binary path for use by other jobs

**Cache Strategy:**
- Cache key format: `aptos-binary-{OS}-{zapatos-commit-hash}`
- Cache location: `$GITHUB_WORKSPACE/bin/aptos`
- Cache invalidation: Automatic when zapatos commit changes

**Build Command:**
```bash
cd source/zapatos
cargo build -p aptos --release --features testing
```

**Usage in other workflows:**
```yaml
jobs:
  setup-aptos:
    uses: ./.github/workflows/build-aptos-binary.yaml

  my-job:
    needs: setup-aptos
    steps:
      - name: Restore aptos binary
        uses: actions/cache/restore@v4
        with:
          path: ${{ needs.setup-aptos.outputs.binary-path }}
          key: ${{ needs.setup-aptos.outputs.cache-key }}
          fail-on-cache-miss: true

      - name: Add aptos to PATH
        run: |
          mkdir -p $HOME/.local/bin
          cp ${{ needs.setup-aptos.outputs.binary-path }} $HOME/.local/bin/aptos
          chmod +x $HOME/.local/bin/aptos
          echo "$HOME/.local/bin" >> $GITHUB_PATH
```

### `ci.yaml` (Main CI Workflow)

Main continuous integration workflow that runs on pull requests and pushes to main.

**Jobs:**

1. **setup-aptos**: Builds and caches the aptos binary
2. **lint**: Runs rustfmt and clippy checks
3. **test-rust**: Runs all Rust workspace tests
4. **test-move-contracts**: Runs Move contract tests with `aptos move test`
5. **test-web**: Runs web/TypeScript tests with Vitest via `npm install && npx vitest run`
6. **test-integration**: Runs integration tests for crosschain and transaction debugger

**Triggers:**
- Pull requests to `main` branch
- Pushes to `main` branch
- Manual workflow dispatch

**Environment Variables:**
- `CARGO_TERM_COLOR=always`: Colorized cargo output
- `RUST_BACKTRACE=1`: Show backtraces on panic

## Cache Management

### How Caching Works

1. The `setup-aptos` job checks if a cached binary exists for the current zapatos commit
2. If cache exists: Restores the binary (saves ~60-90 minutes)
3. If cache missing: Builds the binary and stores it in cache
4. Dependent jobs restore the cached binary and add it to PATH

### When Cache is Invalidated

- Zapatos submodule commit changes
- Manual cache deletion via GitHub UI
- Cache eviction (GitHub keeps ~10GB of caches)

### Manual Cache Management

To invalidate the cache manually:
1. Go to repository Settings → Actions → Caches
2. Delete caches matching pattern `aptos-binary-*`
3. Next workflow run will rebuild the binary

## Local Testing

To test workflows locally, use [act](https://github.com/nektos/act):

```bash
# Install act
brew install act  # macOS
# or
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash

# Run CI workflow
act pull_request -W .github/workflows/ci.yaml

# Run specific job
act pull_request -W .github/workflows/ci.yaml -j test-rust
```

## Troubleshooting

### Binary not found after cache restore

Check that the cache was successfully restored:
```yaml
- name: Restore aptos binary
  id: restore-cache
  uses: actions/cache/restore@v4
  with:
    path: ${{ needs.setup-aptos.outputs.binary-path }}
    key: ${{ needs.setup-aptos.outputs.cache-key }}
    fail-on-cache-miss: true

- name: Debug
  run: |
    echo "Cache hit: ${{ steps.restore-cache.outputs.cache-hit }}"
    ls -lah ${{ needs.setup-aptos.outputs.binary-path }}
```

### Build timeouts

The aptos binary build can take 60-90 minutes. If builds timeout:
1. Increase `timeout-minutes` in the workflow
2. Consider using GitHub's larger runners
3. Enable more aggressive caching of Rust dependencies

### Zapatos submodule issues

Ensure submodules are checked out:
```yaml
- uses: actions/checkout@v4
  with:
    submodules: recursive
```

## Performance Optimization

**Current:**
- First run (no cache): ~90 minutes for aptos build + tests
- Subsequent runs (cached): ~10-15 minutes for tests only

**Optimization Opportunities:**
1. Use GitHub's larger runners (8-core) for faster builds
2. Implement Rust dependency caching with `Swatinem/rust-cache`
3. Parallelize test execution
4. Use `cargo nextest` for faster test runs

## Adding New Jobs

When adding jobs that need the aptos binary:

1. Add `needs: setup-aptos` to job dependencies
2. Restore the cache using the pattern above
3. Add the binary to PATH
4. Verify with `aptos --version`

Example:
```yaml
my-new-job:
  runs-on: ubuntu-latest
  needs: setup-aptos
  steps:
    - uses: actions/checkout@v4

    - name: Restore aptos binary
      uses: actions/cache/restore@v4
      with:
        path: ${{ needs.setup-aptos.outputs.binary-path }}
        key: ${{ needs.setup-aptos.outputs.cache-key }}
        fail-on-cache-miss: true

    - name: Add to PATH
      run: |
        mkdir -p $HOME/.local/bin
        cp ${{ needs.setup-aptos.outputs.binary-path }} $HOME/.local/bin/aptos
        chmod +x $HOME/.local/bin/aptos
        echo "$HOME/.local/bin" >> $GITHUB_PATH

    - name: Use aptos
      run: aptos --version
```
