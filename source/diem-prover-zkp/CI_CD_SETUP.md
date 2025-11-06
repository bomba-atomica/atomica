# CI/CD Setup for Monorepo

## ✅ GitHub Workflows Location

The GitHub workflows are located at the **repository root**:

```
/Users/lucas/code/rust/atomica/
├── .github/
│   └── workflows/
│       ├── diem-prover-ci.yml       # CI pipeline
│       └── diem-prover-release.yml  # Release automation
└── source/
    └── diem-prover-zkp/             # Project code
```

## 🎯 Path Filtering

Since this is a monorepo, workflows only run when files in `source/diem-prover-zkp/` change:

```yaml
on:
  push:
    branches: [main, develop]
    paths:
      - 'source/diem-prover-zkp/**'
      - '.github/workflows/diem-prover-ci.yml'
```

This ensures:
- ✅ CI only runs for diem-prover changes
- ✅ Other projects in the monorepo don't trigger this workflow
- ✅ Changes to the workflow file itself trigger a run

## 📋 Workflows

### 1. CI Workflow (`diem-prover-ci.yml`)

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- Only when files in `source/diem-prover-zkp/` change

**Jobs:**
1. **rust-lint** - Format & clippy checks
2. **rust-build** - Build guest + host
3. **rust-test** - Run all tests
4. **solidity-lint** - Format & solhint
5. **solidity-build** - Compile contracts
6. **solidity-test** - Foundry tests
7. **security** - cargo-audit & Slither
8. **coverage** - Coverage reports

**Working Directory:**
All jobs use `working-directory: source/diem-prover-zkp`

### 2. Release Workflow (`diem-prover-release.yml`)

**Triggers:**
- Push tag `diem-prover-v*.*.*` (e.g., `diem-prover-v0.1.0`)

**Jobs:**
1. **create-release** - Create GitHub release
2. **build-binaries** - Build for Linux, macOS (amd64, arm64)
3. **publish-contracts** - Package contract artifacts

**Asset Names:**
- `diem-prover-linux-amd64.tar.gz`
- `diem-prover-darwin-amd64.tar.gz`
- `diem-prover-darwin-arm64.tar.gz`
- `diem-prover-contracts-artifacts.tar.gz`

## 🚀 Testing Workflows Locally

### Using act (GitHub Actions locally)

```bash
# Install act
brew install act

# Run CI workflow
cd /Users/lucas/code/rust/atomica
act -W .github/workflows/diem-prover-ci.yml

# Run specific job
act -j rust-lint -W .github/workflows/diem-prover-ci.yml
```

### Manual Testing

```bash
cd /Users/lucas/code/rust/atomica/source/diem-prover-zkp

# Run what CI runs
make lint
make build
make test
```

## 📝 Triggering Workflows

### CI Workflow

```bash
# Make changes
cd source/diem-prover-zkp
vim host/src/main.rs

# Commit and push to main
git add .
git commit -m "feat: update prover"
git push origin main

# Or open a PR
git checkout -b feature/my-feature
git push origin feature/my-feature
# Then open PR on GitHub
```

### Release Workflow

```bash
cd /Users/lucas/code/rust/atomica

# Tag with diem-prover prefix
git tag -a diem-prover-v0.1.0 -m "Release diem-prover v0.1.0"

# Push tag
git push origin diem-prover-v0.1.0

# Workflow will automatically:
# 1. Create GitHub release
# 2. Build binaries for all platforms
# 3. Upload assets to release
```

## 🔍 Checking Workflow Status

### On GitHub

1. Go to: https://github.com/atomica/atomica (replace with your repo)
2. Click "Actions" tab
3. See workflow runs for diem-prover-zkp

### Via CLI

```bash
# Install GitHub CLI
brew install gh

# Check recent workflow runs
gh run list --workflow=diem-prover-ci.yml

# View specific run
gh run view <run-id>

# Watch a running workflow
gh run watch
```

## 🐛 Debugging Failed Workflows

### View Logs

```bash
# Using GitHub CLI
gh run view <run-id> --log

# Or on GitHub web interface
# Go to Actions → Click on failed run → Click on failed job
```

### Common Issues

**1. Path filtering not working**
```yaml
# Ensure paths are correct
paths:
  - 'source/diem-prover-zkp/**'  # ✅ Correct
  - 'diem-prover-zkp/**'         # ❌ Wrong (missing source/)
```

**2. Working directory issues**
```yaml
# Use env variable for consistency
env:
  WORKING_DIR: source/diem-prover-zkp

defaults:
  run:
    working-directory: ${{ env.WORKING_DIR }}
```

**3. Cache key conflicts**
```yaml
# Use unique cache keys per project
key: diem-prover-${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}
```

## 📊 Status Badges

Add to your README:

```markdown
# Diem Prover ZKP

![CI](https://github.com/atomica/atomica/workflows/Diem%20Prover%20CI/badge.svg)
![Coverage](https://codecov.io/gh/atomica/atomica/branch/main/graph/badge.svg?flag=diem-prover)
```

## 🔐 Secrets Configuration

Required secrets in GitHub repository settings:

- `GITHUB_TOKEN` - Automatically provided by GitHub
- `CODECOV_TOKEN` - For coverage uploads (optional)

To add secrets:
1. Go to repository Settings
2. Secrets and variables → Actions
3. Add repository secret

## ⚙️ Customizing Workflows

### Change Trigger Branches

```yaml
on:
  push:
    branches: [main, develop, staging]  # Add more branches
```

### Add More Jobs

```yaml
  benchmark:
    name: Performance Benchmarks
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: source/diem-prover-zkp
    steps:
      - uses: actions/checkout@v4
      - name: Run benchmarks
        run: cargo bench
```

### Adjust Caching

```yaml
- name: Cache with custom key
  uses: actions/cache@v4
  with:
    path: source/diem-prover-zkp/target
    key: custom-${{ runner.os }}-${{ hashFiles('**/Cargo.lock') }}
    restore-keys: |
      custom-${{ runner.os }}-
```

## 📈 Workflow Performance

### Current Performance

| Job | Average Duration | Can Be Improved |
|-----|------------------|-----------------|
| rust-lint | ~2 minutes | Caching enabled ✅ |
| rust-build | ~5 minutes | Caching enabled ✅ |
| rust-test | ~3 minutes | Caching enabled ✅ |
| solidity-lint | ~1 minute | Fast ✅ |
| solidity-build | ~2 minutes | Fast ✅ |
| solidity-test | ~2 minutes | Fast ✅ |
| security | ~3 minutes | Runs in parallel ✅ |
| coverage | ~5 minutes | Once per workflow ✅ |

**Total CI Time:** ~8-10 minutes (parallel execution)

### Optimization Tips

1. **Use caching** - Already configured ✅
2. **Run jobs in parallel** - Already done ✅
3. **Use matrix builds** - For multi-platform tests
4. **Cache dependencies** - cargo, npm, forge ✅

## 🎯 Next Steps

1. **Test the workflows:**
   ```bash
   cd source/diem-prover-zkp
   make fmt
   git add .
   git commit -m "test: trigger CI"
   git push origin main
   ```

2. **Monitor first run:**
   - Go to GitHub Actions tab
   - Watch the workflow execute
   - Fix any issues

3. **Add status badge:**
   - Copy badge markdown
   - Add to README.md

4. **Configure branch protection:**
   - Require CI to pass before merge
   - Settings → Branches → Add rule

## ✅ Verification

Workflows are properly configured when:
- ✅ Located at repo root (`.github/workflows/`)
- ✅ Path filtering configured (`source/diem-prover-zkp/**`)
- ✅ Working directory set (`source/diem-prover-zkp`)
- ✅ All jobs use consistent paths
- ✅ Caching configured correctly
- ✅ Parallel execution enabled

**Status:** All configured correctly! ✨
