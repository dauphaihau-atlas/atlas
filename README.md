# Atlas

Full-stack local development environment for Atlas, orchestrating the backend (Laravel) and dashboard (React) via Docker Compose.

## Repositories

- [atlas-be](https://github.com/dauphaihau/atlas-be) — Laravel backend
- [atlas-web](https://github.com/dauphaihau/atlas-web) — React dashboard

## Prerequisites

- **`make`** — comes with Xcode CLI tools on macOS (`xcode-select --install`)
- **Docker** — choose one:
  - [Docker Desktop](https://www.docker.com/products/docker-desktop/) (easiest)

    **If your project is outside your home directory** (e.g. on an external volume like `/Volumes/...`), add the path via Settings → Resources → File Sharing, then click **Apply & Restart**.

  - [Colima](https://github.com/abiosoft/colima) (free, open-source alternative):
    ```bash
    brew install colima docker docker-compose
    colima start
    ```
    > Colima must be running (`colima start`) before `make launch` and on each machine restart.

    **If your project is outside your home directory** (e.g. on an external volume like `/Volumes/...`), you must explicitly mount that path in Colima's config, otherwise containers will see an empty directory.

    Add the path to `~/.colima/default/colima.yaml`:
    ```yaml
    mounts:
      - location: /Volumes/Local/dev/pj-personal  # adjust to your path
        writable: true
    ```
    Then apply with `colima restart`.

## Getting Started

```bash
git clone https://github.com/dauphaihau/atlas.git
cd atlas
make launch
```

`make launch` handles everything in one step:

| Step | What it does |
|---|---|
| `clone` | Clones `atlas-be` → `apps/api/` and `atlas-web` → `apps/dashboard/` |
| `env` | Copies `.env` templates for backend and dashboard |
| `hosts` | Adds `admin.atlas.local` and `api.atlas.local` to `/etc/hosts` *(prompts for sudo)* |
| `certs` | Installs `mkcert` (via Homebrew if needed) and generates local TLS certificates |
| `up` | Starts all Docker containers |
| `composer-install` | Installs PHP dependencies |
| `key-generate` | Generates Laravel `APP_KEY` |
| `migrate-fresh-seed` | Runs migrations and seeds the database |
| `docs` | Generates API documentation via Scribe |

> `apps/api/` and `apps/dashboard/` are independent git repositories cloned into this monorepo shell. Run git commands for each from their own directory.

Once complete, the app is available at:

- `https://admin.atlas.local` — dashboard
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
| `atlas-dashboard` | React (Vite) dashboard |
| `atlas-postgres` | PostgreSQL 16 |
| `atlas-redis` | Redis 7 |
| `atlas-minio` | MinIO (S3-compatible object storage) |
| `atlas-mailpit` | Mailpit (local SMTP + web UI) |

## Common Commands

```bash
make up                  # Start containers
make down                # Stop containers
make down-volumes        # Stop containers and delete volumes (DB data)
make restart             # Restart containers
make logs                # Tail all container logs
make logs-php            # Tail PHP logs
make test                # Run PHPUnit test suite
make test-filter f=Foo   # Run tests matching a name
make migrate             # Run pending migrations
make migrate-fresh-seed  # Fresh migrations + seed
make artisan cmd="..."   # Run any artisan command
make shell               # Shell into PHP container
make shell-postgres      # Open psql session
make pint                # Run Laravel Pint formatter
make docs                # Regenerate API docs
```

## Teardown

```bash
make teardown      # Stop containers; remove /etc/hosts entries, certs, and .env files (keeps cloned repos)
make teardown-all  # Everything above + remove apps/api/ and apps/dashboard/
```

Individual cleanup targets are also available if you only need to undo a specific step:

```bash
make hosts-clean   # Remove admin.atlas.local entries from /etc/hosts
make certs-clean   # Remove generated TLS certificates
make env-clean     # Remove apps/api/.env and apps/dashboard/.env
make clone-clean   # Remove apps/api/ and apps/dashboard/ directories
```
