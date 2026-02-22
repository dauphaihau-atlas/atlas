PHP = docker compose exec php
DC  = docker compose

BACKEND_REPO  ?= https://github.com/dauphaihau/atlas-be.git
FRONTEND_REPO ?= https://github.com/dauphaihau/atlas-web.git
MINIO_BUCKET  ?= local

.DEFAULT_GOAL := help

# ──────────────────────────────────────────────
# Help
# ──────────────────────────────────────────────
.PHONY: help
help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ──────────────────────────────────────────────
# Clone
# ──────────────────────────────────────────────
.PHONY: clone
clone: clone-backend clone-frontend ## Clone both backend and frontend repos

.PHONY: clone-backend
clone-backend: ## Clone backend repo  (override: make clone-backend BACKEND_REPO=<url>)
	@if [ -d backend/.git ]; then \
		echo "backend/ already cloned, skipping."; \
	else \
		git clone $(BACKEND_REPO) backend; \
	fi

.PHONY: clone-frontend
clone-frontend: ## Clone frontend repo  (override: make clone-frontend FRONTEND_REPO=<url>)
	@if [ -d frontend/.git ]; then \
		echo "frontend/ already cloned, skipping."; \
	else \
		git clone $(FRONTEND_REPO) frontend; \
	fi

.PHONY: clone-clean
clone-clean: ## Remove cloned backend/ and frontend/ directories
	rm -rf backend frontend

# ──────────────────────────────────────────────
# Setup
# ──────────────────────────────────────────────
.PHONY: launch
launch: clone env hosts certs up minio-setup composer-install key-generate migrate-fresh-seed docs ## First-time launch: clone repos, copy .env files, add /etc/hosts entries, generate certs, start containers, create MinIO bucket, install deps, generate app key, run migrations, seed DB, generate API docs

.PHONY: env
env: ## Copy Docker-ready .env templates to backend/ and frontend/ (skips if already exists)
	@[ -f backend/.env ]  || cp templates/backend.env  backend/.env
	@[ -f frontend/.env ] || cp templates/frontend.env frontend/.env

.PHONY: env-clean
env-clean: ## Remove backend/.env and frontend/.env
	rm -f backend/.env frontend/.env

.PHONY: key-generate
key-generate: ## Generate Laravel APP_KEY and write it to backend/.env
	$(PHP) php artisan key:generate --force

.PHONY: hosts
hosts: ## Add atlas.local and api.atlas.local to /etc/hosts (requires sudo)
	@if grep -q "atlas.local" /etc/hosts; then \
		echo "/etc/hosts already configured, skipping."; \
	else \
		echo "sudo required to add '127.0.0.1 atlas.local' and '127.0.0.1 api.atlas.local' to /etc/hosts"; \
		sudo sh -c 'echo "127.0.0.1  atlas.local\n127.0.0.1  api.atlas.local" >> /etc/hosts'; \
	fi

.PHONY: hosts-clean
hosts-clean: ## Remove atlas.local entries from /etc/hosts (requires sudo)
	@echo "sudo required to remove atlas.local entries from /etc/hosts"
	@sudo sed -i '' '/atlas\.local/d' /etc/hosts

.PHONY: certs
certs: ## Generate local TLS certificates via mkcert
	bash setup-certs.sh

.PHONY: certs-clean
certs-clean: ## Remove generated TLS certificates from nginx/certs/
	rm -f nginx/certs/*.crt nginx/certs/*.key

# ──────────────────────────────────────────────
# Docker
# ──────────────────────────────────────────────
.PHONY: up
up: ## Start all containers in the background
	$(DC) up -d

.PHONY: down
down: ## Stop and remove containers
	$(DC) down

.PHONY: down-volumes
down-volumes: ## Stop and remove containers and volumes (deletes DB data)
	$(DC) down -v

.PHONY: restart
restart: down up ## Restart all containers

.PHONY: build
build: ## Rebuild all images
	$(DC) build

.PHONY: minio-setup
minio-setup: ## Create the MinIO bucket (MINIO_BUCKET, default: local)
	@echo "Waiting for MinIO to be ready..."
	@until $(DC) exec -T minio mc alias set local http://localhost:9000 minioadmin minioadmin > /dev/null 2>&1; do sleep 1; done
	@$(DC) exec -T minio mc mb --ignore-existing local/$(MINIO_BUCKET)
	@echo "MinIO bucket '$(MINIO_BUCKET)' ready."

.PHONY: ps
ps: ## Show running containers
	$(DC) ps

.PHONY: logs
logs: ## Tail logs for all containers
	$(DC) logs -f

.PHONY: logs-php
logs-php: ## Tail logs for the PHP container
	$(DC) logs -f php

.PHONY: logs-horizon
logs-horizon: ## Tail logs for Horizon
	$(DC) logs -f horizon

.PHONY: logs-reverb
logs-reverb: ## Tail logs for Reverb
	$(DC) logs -f reverb

# ──────────────────────────────────────────────
# Laravel / Artisan
# ──────────────────────────────────────────────
.PHONY: artisan
artisan: ## Run an artisan command  (e.g. make artisan cmd="route:list")
	$(PHP) php artisan $(cmd)

.PHONY: migrate
migrate: ## Run database migrations
	$(PHP) php artisan migrate

.PHONY: migrate-fresh
migrate-fresh: ## Drop all tables and re-run migrations
	$(PHP) php artisan migrate:fresh

.PHONY: migrate-fresh-seed
migrate-fresh-seed: ## Drop all tables, re-run migrations, and seed
	$(PHP) php artisan migrate:fresh --seed

.PHONY: seed
seed: ## Seed the database
	$(PHP) php artisan db:seed

.PHONY: tinker
tinker: ## Open Laravel Tinker REPL
	$(PHP) php artisan tinker

# ──────────────────────────────────────────────
# Testing & Quality
# ──────────────────────────────────────────────
.PHONY: test
test: ## Run the full PHPUnit test suite
	$(PHP) php artisan config:clear --ansi
	$(PHP) php artisan test

.PHONY: test-filter
test-filter: ## Run tests matching a filter  (e.g. make test-filter f=UserImportApiTest)
	$(PHP) php artisan test --filter=$(f)

.PHONY: pint
pint: ## Run Laravel Pint code formatter
	$(PHP) vendor/bin/pint

.PHONY: pint-test
pint-test: ## Check formatting without making changes
	$(PHP) vendor/bin/pint --test

# ──────────────────────────────────────────────
# Composer
# ──────────────────────────────────────────────
.PHONY: composer
composer: ## Run a composer command  (e.g. make composer cmd="require package/name")
	$(PHP) composer $(cmd)

.PHONY: composer-install
composer-install: ## Install PHP dependencies
	$(PHP) composer install

# ──────────────────────────────────────────────
# Docs
# ──────────────────────────────────────────────
.PHONY: docs
docs: ## Generate API documentation via Scribe
	$(PHP) php artisan scribe:generate

# ──────────────────────────────────────────────
# Shell access
# ──────────────────────────────────────────────
.PHONY: shell
shell: ## Open a shell inside the PHP container
	$(PHP) bash

.PHONY: shell-postgres
shell-postgres: ## Open a psql session
	$(DC) exec postgres psql -U laravel -d atlas

# ──────────────────────────────────────────────
# Teardown
# ──────────────────────────────────────────────
.PHONY: teardown
teardown: down hosts-clean certs-clean env-clean ## Stop containers and remove hosts, certs, and .env files (keeps cloned repos)

.PHONY: teardown-all
teardown-all: teardown clone-clean ## Full wipe: teardown + remove cloned repos
