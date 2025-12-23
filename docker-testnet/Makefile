.PHONY: help build start stop restart logs clean status info extract-genesis test-api

help: ## Show this help message
	@echo "Zapatos Local Testnet - Available Commands"
	@echo "=========================================="
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

build: ## Build docker images from zapatos source (required first time)
	@echo "🔨 Building zapatos docker images from source..."
	@echo "This will take 10-20 minutes on first build"
	@./build.sh

start: ## Start the validator testnet
	@echo "🚀 Starting zapatos validator testnet..."
	@docker compose up -d
	@echo ""
	@echo "⏳ Waiting for validators to start..."
	@sleep 10
	@$(MAKE) status

start-with-faucet: ## Start testnet with faucet service
	@echo "🚀 Starting zapatos validator testnet with faucet..."
	@docker compose --profile with-faucet up -d
	@echo ""
	@echo "⏳ Waiting for services to start..."
	@sleep 10
	@$(MAKE) status

stop: ## Stop the testnet (preserves data)
	@echo "🛑 Stopping testnet..."
	@docker compose stop

restart: ## Restart the testnet
	@echo "🔄 Restarting testnet..."
	@docker compose restart
	@sleep 5
	@$(MAKE) status

logs: ## Show logs from all validators (CTRL+C to exit)
	@docker compose logs -f

logs-0: ## Show logs from validator-0
	@docker compose logs -f validator-0

logs-1: ## Show logs from validator-1
	@docker compose logs -f validator-1

logs-2: ## Show logs from validator-2
	@docker compose logs -f validator-2

logs-3: ## Show logs from validator-3
	@docker compose logs -f validator-3

clean: ## Stop and remove all containers and volumes (fresh start)
	@echo "🧹 Cleaning up testnet..."
	@docker compose down --volumes --remove-orphans
	@echo "✓ Testnet cleaned. Run 'make build' and 'make start' for fresh deployment."

status: ## Check validator status
	@echo "📊 Validator Status"
	@echo "──────────────────"
	@docker compose ps

info: ## Show connection information
	@echo "🔌 Zapatos Testnet Connection Info"
	@echo "==================================="
	@echo ""
	@echo "REST API Endpoints:"
	@echo "  Validator 0: http://localhost:8080"
	@echo "  Validator 1: http://localhost:8081"
	@echo "  Validator 2: http://localhost:8082"
	@echo "  Validator 3: http://localhost:8083"
	@echo ""
	@echo "Metrics Endpoints:"
	@echo "  Validator 0: http://localhost:9101"
	@echo "  Validator 1: http://localhost:9102"
	@echo "  Validator 2: http://localhost:9103"
	@echo "  Validator 3: http://localhost:9104"
	@echo ""
	@echo "Network:"
	@echo "  Chain ID: TESTING (4)"
	@echo "  Network: zapatos-testnet"
	@echo ""
	@if docker compose ps | grep -q "with-faucet"; then \
		echo "Faucet: http://localhost:8000"; \
		echo ""; \
	fi

test-api: ## Test REST API endpoints
	@echo "🔌 Testing validator REST APIs..."
	@echo ""
	@echo "Validator 0:"
	@curl -s http://localhost:8080/v1 2>/dev/null | head -3 || echo "  ✗ Not reachable"
	@echo ""
	@echo "Validator 1:"
	@curl -s http://localhost:8081/v1 2>/dev/null | head -3 || echo "  ✗ Not reachable"
	@echo ""
	@echo "Validator 2:"
	@curl -s http://localhost:8082/v1 2>/dev/null | head -3 || echo "  ✗ Not reachable"
	@echo ""
	@echo "Validator 3:"
	@curl -s http://localhost:8083/v1 2>/dev/null | head -3 || echo "  ✗ Not reachable"
	@echo ""

extract-genesis: ## Extract genesis files to current directory
	@echo "📦 Extracting genesis files..."
	@docker cp zapatos-validator-0:/opt/aptos/var/genesis.blob ./genesis.blob 2>/dev/null || echo "Genesis not found. Is validator-0 running?"
	@docker exec zapatos-validator-0 cat /opt/aptos/var/waypoint.txt > waypoint.txt 2>/dev/null || echo "Waypoint not found."
	@if [ -f genesis.blob ]; then \
		echo "✓ Extracted:"; \
		echo "  - genesis.blob"; \
		echo "  - waypoint.txt"; \
	fi

shell-0: ## Open shell in validator-0 container
	@docker exec -it zapatos-validator-0 /bin/bash

shell-1: ## Open shell in validator-1 container
	@docker exec -it zapatos-validator-1 /bin/bash

shell-2: ## Open shell in validator-2 container
	@docker exec -it zapatos-validator-2 /bin/bash

shell-3: ## Open shell in validator-3 container
	@docker exec -it zapatos-validator-3 /bin/bash

quick-test: ## Quick test: build, start, and show info
	@$(MAKE) build
	@$(MAKE) start
	@sleep 15
	@$(MAKE) test-api
	@$(MAKE) info
