.PHONY: help install lint lint-fix test build clean fmt fmt-check

# Default target
help:
	@echo "Diem Prover ZKP - Development Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make install          Install all dependencies"
	@echo ""
	@echo "Linting:"
	@echo "  make lint             Run all linters"
	@echo "  make lint-fix         Auto-fix linting issues"
	@echo "  make fmt              Format all code"
	@echo "  make fmt-check        Check code formatting"
	@echo ""
	@echo "Building:"
	@echo "  make build            Build all components"
	@echo "  make build-guest      Build guest program only"
	@echo "  make build-host       Build host prover only"
	@echo "  make build-contracts  Build Solidity contracts"
	@echo ""
	@echo "Testing:"
	@echo "  make test             Run all tests"
	@echo "  make test-rust        Run Rust tests"
	@echo "  make test-contracts   Run Solidity tests"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean            Clean all build artifacts"

# Installation
install:
	@echo "📦 Installing dependencies..."
	@rustup target add riscv32im-unknown-none-elf
	@cargo install cargo-audit
	@cargo install cargo-tarpaulin || true
	@npm install -g solhint || true
	@cd contracts && forge install
	@echo "✅ Installation complete"

# Linting
lint: lint-rust lint-contracts
	@echo "✅ All linting checks passed"

lint-rust:
	@echo "🔍 Linting Rust code..."
	@cargo fmt --all -- --check
	@cargo clippy --all-targets --all-features -- -D warnings

lint-contracts:
	@echo "🔍 Linting Solidity code..."
	@cd contracts && forge fmt --check
	@cd contracts && solhint 'src/**/*.sol' || true

lint-fix: lint-fix-rust lint-fix-contracts
	@echo "✅ Auto-fix complete"

lint-fix-rust:
	@echo "🔧 Auto-fixing Rust code..."
	@cargo fmt --all
	@cargo clippy --all-targets --all-features --fix --allow-dirty --allow-staged

lint-fix-contracts:
	@echo "🔧 Auto-fixing Solidity code..."
	@cd contracts && forge fmt

# Formatting
fmt: lint-fix

fmt-check:
	@echo "🔍 Checking code formatting..."
	@cargo fmt --all -- --check
	@cd contracts && forge fmt --check

# Building
build: build-guest build-host build-contracts
	@echo "✅ Build complete"

build-guest:
	@echo "🔨 Building guest program (RISC-V)..."
	@cargo build --release --manifest-path guest/Cargo.toml --target riscv32im-unknown-none-elf

build-host:
	@echo "🔨 Building host prover..."
	@cargo build --release --manifest-path host/Cargo.toml

build-contracts:
	@echo "🔨 Building Solidity contracts..."
	@cd contracts && forge build

# Testing
test: test-rust test-contracts
	@echo "✅ All tests passed"

test-rust:
	@echo "🧪 Running Rust tests..."
	@cargo test --all --all-features

test-contracts:
	@echo "🧪 Running Solidity tests..."
	@cd contracts && forge test -vvv

# Coverage
coverage:
	@echo "📊 Generating code coverage..."
	@cargo tarpaulin --all-features --workspace --timeout 300 --out Html
	@echo "✅ Coverage report generated at target/tarpaulin/index.html"

# Security
audit:
	@echo "🔒 Running security audits..."
	@cargo audit
	@echo "✅ Security audit complete"

# Cleanup
clean:
	@echo "🧹 Cleaning build artifacts..."
	@cargo clean
	@cd contracts && forge clean
	@rm -rf target/
	@rm -rf contracts/out/
	@rm -rf contracts/cache/
	@echo "✅ Cleanup complete"

# Development
dev:
	@echo "🚀 Starting prover in development mode..."
	@RUST_LOG=debug cargo run --manifest-path host/Cargo.toml

# CI/CD
ci: lint test build
	@echo "✅ CI checks complete"
