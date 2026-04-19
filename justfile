PHP := "docker compose -f infra/docker-compose.yml exec php"
DC  := "docker compose -f infra/docker-compose.yml"

BACKEND_REPO   := env("BACKEND_REPO",   "https://github.com/dauphaihau/atlas-be.git")
DASHBOARD_REPO := env("DASHBOARD_REPO", "https://github.com/dauphaihau/atlas-web.git")
MINIO_BUCKET   := env("MINIO_BUCKET",   "local")

# List all available recipes
default:
    @just --list

# ──────────────────────────────────────────────
# Clone
# ──────────────────────────────────────────────

# Clone both backend and dashboard repos
clone: clone-backend clone-dashboard

# Clone backend repo  (override: BACKEND_REPO=<url> just clone-backend)
clone-backend:
    @if [ -d apps/api/.git ]; then \
        echo "apps/api/ already cloned, skipping."; \
    else \
        mkdir -p apps && git clone {{BACKEND_REPO}} apps/api; \
    fi

# Clone dashboard repo  (override: DASHBOARD_REPO=<url> just clone-dashboard)
clone-dashboard:
    @if [ -d apps/dashboard/.git ]; then \
        echo "apps/dashboard/ already cloned, skipping."; \
    else \
        mkdir -p apps && git clone {{DASHBOARD_REPO}} apps/dashboard; \
    fi

# Remove cloned backend/ and dashboard/ directories
clone-clean:
    rm -rf apps/api apps/dashboard

# ──────────────────────────────────────────────
# Setup
# ──────────────────────────────────────────────

# First-time launch: clone repos, copy .env files, generate app key, add /etc/hosts entries, generate certs, start containers, create MinIO bucket, install deps, run migrations, seed DB, generate API docs
launch: clone env key-generate hosts certs colima-setup up minio-setup composer-install migrate-fresh-seed docs

# If Colima is the Docker runtime, ensure the project volume is mounted (restarts Colima if config changed)
colima-setup:
    @if ! command -v colima > /dev/null 2>&1; then \
        exit 0; \
    fi; \
    COLIMA_CONFIG="$HOME/.colima/default/colima.yaml"; \
    MOUNT_POINT="$(df -P . | tail -1 | awk '{print $NF}')"; \
    if [ "$MOUNT_POINT" = "/" ]; then \
        echo "Project is on root filesystem, no extra Colima mount needed."; \
        exit 0; \
    fi; \
    if grep -q "location: $MOUNT_POINT" "$COLIMA_CONFIG" 2>/dev/null; then \
        echo "Colima mount for $MOUNT_POINT already configured, skipping."; \
        exit 0; \
    fi; \
    echo "Adding $MOUNT_POINT to Colima mounts and restarting..."; \
    python3 -c "import re; cfg=open('$HOME/.colima/default/colima.yaml').read(); e='  - location: $MOUNT_POINT\n    writable: true\n'; cfg=re.sub(r'^mounts: \[\]','mounts:\n'+e,cfg,flags=re.M) if 'mounts: []' in cfg else re.sub(r'^(mounts:)',r'\1\n'+e,cfg,flags=re.M); open('$HOME/.colima/default/colima.yaml','w').write(cfg)"; \
    colima stop && colima start

# Copy Docker-ready .env templates to backend/ and dashboard/ (skips if already exists)
env:
    @[ -f apps/api/.env ]       || cp infra/env-examples/backend.env   apps/api/.env
    @[ -f apps/dashboard/.env ] || cp infra/env-examples/dashboard.env apps/dashboard/.env

# Remove backend/.env and dashboard/.env
env-clean:
    rm -f apps/api/.env apps/dashboard/.env

# Generate Laravel APP_KEY and write it to backend/.env (runs on host, no container needed)
key-generate:
    @if grep -q "^APP_KEY=base64:" apps/api/.env; then \
        echo "APP_KEY already set, skipping."; \
    else \
        KEY=$(openssl rand -base64 32) && \
        sed -i '' "s|^APP_KEY=.*|APP_KEY=base64:$KEY|" apps/api/.env && \
        echo "APP_KEY generated."; \
    fi

# Add admin.atlas.local and api.atlas.local to /etc/hosts (requires sudo)
hosts:
    @if grep -q "admin.atlas.local" /etc/hosts; then \
        echo "/etc/hosts already configured, skipping."; \
    else \
        echo "sudo required to add '127.0.0.1 admin.atlas.local' and '127.0.0.1 api.atlas.local' to /etc/hosts"; \
        sudo sh -c 'echo "127.0.0.1  admin.atlas.local\n127.0.0.1  api.atlas.local" >> /etc/hosts'; \
    fi

# Remove atlas.local entries from /etc/hosts (requires sudo)
hosts-clean:
    @echo "sudo required to remove atlas.local entries from /etc/hosts"
    @sudo sed -i '' '/atlas\.local/d' /etc/hosts

# Generate local TLS certificates via mkcert
certs:
    bash infra/setup-certs.sh

# Remove generated TLS certificates from nginx/certs/
certs-clean:
    rm -f infra/nginx/certs/*.crt infra/nginx/certs/*.key

# ──────────────────────────────────────────────
# Docker
# ──────────────────────────────────────────────

# Start all containers in the background
up:
    {{DC}} up -d

# Stop and remove containers
down:
    {{DC}} down

# Stop and remove containers and volumes (deletes DB data)
down-volumes:
    {{DC}} down -v

# Restart all containers
restart: down up

# Restart a specific service/container
restart-service service:
    {{DC}} restart {{service}}

# Rebuild all images
build:
    {{DC}} build

# Rebuild a specific service/container image
build-service service:
    {{DC}} build {{service}}

# Create the MinIO bucket (MINIO_BUCKET, default: local)
minio-setup:
    @echo "Waiting for MinIO to be ready..."
    @until {{DC}} exec -T minio mc alias set local http://localhost:9000 minioadmin minioadmin > /dev/null 2>&1; do sleep 1; done
    @{{DC}} exec -T minio mc mb --ignore-existing local/{{MINIO_BUCKET}}
    @echo "MinIO bucket '{{MINIO_BUCKET}}' ready."

# Show running containers
ps:
    {{DC}} ps

# Tail logs for all containers
logs:
    {{DC}} logs -f

# Tail logs for the PHP container
logs-php:
    {{DC}} logs -f php

# Tail logs for Horizon
logs-horizon:
    {{DC}} logs -f horizon

# Tail logs for Reverb
logs-reverb:
    {{DC}} logs -f reverb

# ──────────────────────────────────────────────
# Laravel / Artisan
# ──────────────────────────────────────────────

# Run an artisan command  (e.g. just artisan route:list)
artisan cmd:
    {{PHP}} php artisan {{cmd}}

# Run database migrations
migrate:
    {{PHP}} php artisan migrate

# Drop all tables and re-run migrations
migrate-fresh:
    {{PHP}} php artisan migrate:fresh

# Drop all tables, re-run migrations, and seed
migrate-fresh-seed:
    {{PHP}} php artisan migrate:fresh --seed

# Seed the database
seed:
    {{PHP}} php artisan db:seed

# Open Laravel Tinker REPL
tinker:
    {{PHP}} php artisan tinker

# ──────────────────────────────────────────────
# Testing & Quality
# ──────────────────────────────────────────────

# Run the full PHPUnit test suite
test:
    {{PHP}} php artisan config:clear --ansi
    {{PHP}} php artisan test

# Run tests matching a filter  (e.g. just test-filter UserImportApiTest)
test-filter f:
    {{PHP}} php artisan test --filter={{f}}

# Run Laravel Pint code formatter
pint:
    {{PHP}} vendor/bin/pint

# Check formatting without making changes
pint-test:
    {{PHP}} vendor/bin/pint --test

# Delete imported test users (user%@example.com) from the database
delete-test-users:
    {{PHP}} php -r "\
        require '/var/www/html/vendor/autoload.php';\
        \$app = require '/var/www/html/bootstrap/app.php';\
        \$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();\
        \$count = DB::table('users')->where('email', 'like', 'user%@example.com')->delete();\
        echo \"Deleted: \$count\n\";"

# Generate a test users CSV for import  (override: just gen-csv 500 data-test/my.csv)
gen-users-csv rows="100" out="data-test/users.csv":
    @mkdir -p $(dirname {{out}})
    @echo "name,email,password" > {{out}}
    @for i in $(seq 1 {{rows}}); do \
        printf "User %d,user%d@example.com,Password1!\n" $i $i; \
    done >> {{out}}
    @echo "Generated {{rows}} rows → {{out}}"

# ──────────────────────────────────────────────
# Composer
# ──────────────────────────────────────────────

# Run a composer command  (e.g. just composer "require package/name")
composer cmd:
    {{PHP}} composer {{cmd}}

# Install PHP dependencies
composer-install:
    {{PHP}} composer install

# ──────────────────────────────────────────────
# Docs
# ──────────────────────────────────────────────

# Generate API documentation via Scribe
docs:
    {{PHP}} php artisan scribe:generate

# ──────────────────────────────────────────────
# Shell access
# ──────────────────────────────────────────────

# Open a shell inside the PHP container
shell:
    {{PHP}} bash

# Run a command inside a specific service/container
exec service +command:
    {{DC}} exec {{service}} {{command}}

# Open a psql session
shell-postgres:
    {{DC}} exec postgres psql -U laravel -d atlas

# ──────────────────────────────────────────────
# Teardown
# ──────────────────────────────────────────────

# Stop containers and remove hosts, certs, and .env files (keeps cloned repos)
teardown: down hosts-clean certs-clean env-clean

# Full wipe: teardown + remove cloned repos
teardown-all: teardown clone-clean
