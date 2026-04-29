# Atlas

Full-stack local development environment for Atlas, orchestrating the backend (Laravel) and frontends (React) via Docker Compose.

## Repositories

- [api](https://github.com/dauphaihau-atlas/api) — Laravel backend (`apps/api/`)
- [dashboard](https://github.com/dauphaihau-atlas/dashboard) — React dashboard (`apps/dashboard/`)
- [worker-go](https://github.com/dauphaihau-atlas/worker-go) — Go worker (`apps/worker-go/`)

## Prerequisites

- **`just`** — task runner (`brew install just`)
- **Docker** — choose one:
  - [Docker Desktop](https://www.docker.com/products/docker-desktop/) (easiest)

    **If your project is outside your home directory** (e.g. on an external volume like `/Volumes/...`), add the path via Settings → Resources → File Sharing, then click **Apply & Restart**.

  - [Colima](https://github.com/abiosoft/colima) (free, open-source alternative):
    ```bash
    brew install colima docker docker-compose
    colima start
    ```
    > Colima must be running (`colima start`) before `just launch` and on each machine restart.

    `just launch` automatically detects Colima and configures the required volume mount if the project is outside your home directory.

## Getting Started

```bash
git clone https://github.com/dauphaihau/atlas.git
cd atlas
just launch
```

`just launch` handles everything in one step:

| Step | What it does |
|---|---|
| `clone` | Clones `api` → `apps/api/`, `dashboard` → `apps/dashboard/`, `worker-go` → `apps/worker-go/` |
| `env` | Copies app-owned `.env.example` files to `apps/api/.env` and `apps/dashboard/.env` |
| `key-generate` | Generates Laravel `APP_KEY` |
| `hosts` | Adds `app.atlas.local` and `api.atlas.local` to `/etc/hosts` *(prompts for sudo)* |
| `certs` | Installs `mkcert` (via Homebrew if needed) and generates local TLS certificates |
| `colima-setup` | Configures Colima volume mount if needed (skipped for Docker Desktop) |
| `up` | Starts all Docker containers |
| `minio-setup` | Creates the MinIO bucket |
| `composer-install` | Installs PHP dependencies |
| `migrate-fresh-seed` | Runs migrations and seeds the database |
| `docs` | Generates API documentation via Scribe |

> `apps/api/`, `apps/dashboard/`, and `apps/worker-go/` are independent git repositories. Run git commands for each from their own directory.

Once complete, the app is available at:

- `https://app.atlas.local` — dashboard
- `https://api.atlas.local` — backend API
- `http://localhost:8025` — Mailpit (email)
- `http://localhost:9001` — MinIO console (storage)

## Services

| Container | Description |
|---|---|
| `atlas-nginx` | Reverse proxy (HTTP/HTTPS) |
| `atlas-php` | Laravel application (PHP-FPM) |
| `atlas-horizon` | Laravel Horizon (queue worker) |
| `atlas-reverb` | Laravel Reverb (WebSockets) |
| `atlas-worker-go` | Go worker (bulk import, async tasks) |
| `atlas-dashboard` | React (Vite) dashboard |
| `atlas-postgres` | PostgreSQL 16 |
| `atlas-redis` | Redis 7 |
| `atlas-minio` | MinIO (S3-compatible object storage) |
| `atlas-mailpit` | Mailpit (local SMTP + web UI) |

## Common Commands

```bash
just up                  # Start containers
just down                # Stop containers
just down-volumes        # Stop containers and delete volumes (DB data)
just restart             # Restart containers
just logs                # Tail all container logs
just logs-php            # Tail PHP logs
just test                # Run PHPUnit test suite
just test-filter Foo     # Run tests matching a name
just migrate             # Run pending migrations
just migrate-fresh-seed  # Fresh migrations + seed
just artisan route:list  # Run any artisan command
just shell-php           # Shell into PHP container
just shell-postgres      # Open psql session
just pint                # Run Laravel Pint formatter
just docs                # Regenerate API docs
```

## Teardown

```bash
just teardown      # Stop containers; remove /etc/hosts entries, certs, and .env files (keeps cloned repos)
just teardown-all  # Everything above + remove apps/api/ and apps/dashboard/
```

Individual cleanup targets are also available if you only need to undo a specific step:

```bash
just hosts-clean   # Remove atlas.local entries from /etc/hosts
just certs-clean   # Remove generated TLS certificates
just env-clean     # Remove apps/api/.env and apps/dashboard/.env
just clone-clean   # Remove apps/api/ and apps/dashboard/ directories
```
