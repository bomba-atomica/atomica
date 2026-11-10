# GitHub Actions Workflows

This directory contains CI/CD workflows for the Atomica project.

## Workflows

### `test-web.yaml` (Gating Workflow)

Holds every merge-gating job. The `required-checks` job aggregates them.
Ruleset 11921934 requires "Web Tests (integration)", "Web Tests (meta)" and
"Web Tests (unit)".

**Gate:** `required-checks` is a two-leg matrix. Both legs run the same check
and report it as "Required Checks" and as "Web Tests (unit)". The second name
is a transitional alias for the ruleset, to drop in issue 173. On a draft PR
each name gets a " (draft)" suffix.

The gate needs only `changes`, so its check runs appear within a minute or two
of the run's start. It then polls this run's jobs through the Actions API
(`actions: read`) every 30 seconds until every gated job has finished. A
`needs:` on the gated jobs would create its check runs only after the slowest
job ends. Until then an older run's green check would stand on the same head
SHA, for example after a base retarget.

The gate holds an explicit list of gated job names, with each matrix leg
expanded. A whole matrix skipped by a job-level `if` shows up under its
unexpanded name, which the list also holds. The gate fails closed when:
- a gated job fails, is cancelled, or times out;
- a gated job is skipped, except the docker tier on a draft PR or any job on a
  docs-only PR;
- a listed job is still missing after about two minutes;
- the run has a job the list does not name (update the list with the job);
- the jobs API fails five times in a row;
- gated jobs are still unfinished after 150 minutes.

A newer run for the same PR cancels the older one. Push and dispatch runs are
never cancelled.

**Docs-only PRs:** the `pull_request` trigger has no `paths-ignore`, because a
workflow skipped by a path filter never reports its checks. Instead the
`changes` job ("Detect docs-only change") outputs `code=false` when every
changed file ends in `.md`, or ends in `.txt` outside `source/` and `lib/`.
A `.txt` under `source/` or `lib/` counts as code, because some are build
inputs (`source/evm-contracts/remappings.txt` is read by `forge build`). A
rename checks both its old and new path. The job outputs `code=true` instead
when:
- the listed file count differs from the event's `changed_files`, or reaches
  the files API cap of 3000;
- the PR's live head SHA differs from the head SHA the run was started for.

The job counts code rows with `grep -c` on a here-string, never with a pipe
into `grep -q`. Under `pipefail` such a pipe can fail with SIGPIPE on a long
file list.

The `pull_request` trigger includes `edited`, so retargeting a PR's base
reruns the classification. The job prints the file list between
`::stop-commands::` markers, so a file name cannot act as a workflow command.

When the PR is docs-only:
- most test jobs skip at job level;
- `test-web` runs but skips every step, so it reports its expanded matrix
  names ("Web Tests (integration)", "Web Tests (meta)") as success;
- `required-checks` accepts `skipped` for every gated job, so "Required
  Checks" and "Web Tests (unit)" pass.

Detection fails open: if `changes` fails, its output is empty, which is not
`false`, so every test runs and must succeed. Pushes to `main` keep
`paths-ignore`.

### `build-aptos-binary.yaml` (Reusable Workflow)

A reusable workflow that builds and caches the `aptos` binary from the `source/atomica-aptos` submodule.

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
cd source/atomica-aptos
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
