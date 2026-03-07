# atlas-backend-mcp

An MCP server that gives Claude deep understanding of the Atlas Laravel backend — routes, use cases, code, and database schema.

## Prerequisites

- Node 20 (via nvm)
- Atlas Docker stack running (`make up`)

## Build

```bash
source ~/.nvm/nvm.sh && nvm use 20
npm install
npm run build
```

The compiled output lands in `dist/index.js`.

## MCP Configuration

Add the following to your project-level `.mcp.json`:

```json
{
  "mcpServers": {
    "atlas-backend": {
      "command": "/Users/<you>/.nvm/versions/node/v20.x.x/bin/node",
      "args": ["<atlas-root>/backend-mcp/dist/index.js"],
      "env": {
        "ATLAS_BACKEND_PATH": "<atlas-root>/backend",
        "ATLAS_PHP_CONTAINER": "atlas-php",
        "POSTGRES_HOST": "localhost",
        "POSTGRES_PORT": "5432",
        "POSTGRES_DB": "atlas",
        "POSTGRES_USER": "laravel",
        "POSTGRES_PASSWORD": "secret"
      }
    }
  }
}
```

| Variable | Required | Default | Description |
|---|---|---|---|
| `ATLAS_BACKEND_PATH` | yes | — | Absolute path to the `backend/` directory |
| `POSTGRES_PASSWORD` | yes | — | PostgreSQL password |
| `ATLAS_PHP_CONTAINER` | no | `atlas-php-1` | Docker container name for running artisan |
| `POSTGRES_HOST` | no | `localhost` | PostgreSQL host |
| `POSTGRES_PORT` | no | `5432` | PostgreSQL port |
| `POSTGRES_DB` | no | `atlas` | Database name |
| `POSTGRES_USER` | no | `laravel` | Database user |

> Get the exact `node` binary path: `source ~/.nvm/nvm.sh && nvm use 20 && which node`

## Available Tools

### Routes
| Tool | Description |
|---|---|
| `list_routes` | List all registered API routes with optional filter |
| `find_route` | Find a route by URI, name, or controller action |
| `trace_route` | Trace a route through all Clean Architecture layers (FormRequest → Controller → UseCase → Repository → Model) |

### Architecture
| Tool | Description |
|---|---|
| `overview` | Full backend architecture overview: layers, naming conventions, request flow, DI bindings |
| `list_use_cases` | List all use cases grouped by domain, with optional domain filter |
| `get_use_case` | Read a complete use case (Request DTO, Response DTO, UseCase class) by domain and feature name |

### Code Navigation
| Tool | Description |
|---|---|
| `read_file` | Read any backend file by relative path |
| `search_code` | Grep across the backend codebase with context lines |
| `list_directory` | List files and folders at a path within the backend |
| `find_file` | Find files by name pattern (e.g. `*UseCase.php`) |

### Database
| Tool | Description |
|---|---|
| `list_tables` | List all tables in the public schema with approximate row counts |
| `describe_table` | Show columns, types, nullability, and defaults for a table |
| `run_query` | Execute a read-only SQL query (SELECT, EXPLAIN, WITH only) |
