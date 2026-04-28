# atlas-dashboard-mcp

An MCP server that gives Codex or Claude a code-aware view of the Atlas React dashboard — routes, pages, features, queries, stores, and UI wiring.

## When To Use It

A dashboard MCP is worth it if you want tasks like:

- find which page or component owns a UI
- trace page -> feature -> query -> API client
- locate where a table, dialog, mutation, or route is wired
- inspect React Router structure, Zustand stores, React Query usage, and shared UI patterns
- answer "where should this dashboard change go?" without broad grep

## Example: "Implement User CSV Template Download"

For "implement user CSV template download", it helps Codex quickly find:

- which page owns the user import/export UI
- which feature contains the import dialog or export button
- which query or mutation should be extended
- which API client file is responsible for the user download endpoint
- which route or page should show the action

In this repo, that trace typically looks like:

- `/users` route
- `UsersPage`
- `src/features/user/...`
- `src/shared/queries/user/...`
- `src/shared/api/user/user.api.ts`

Typical flow with the MCP:

1. Run `trace_route` for `/users` to find the page component and layout.
2. Read the page file to see which feature components it composes.
3. Use `find_component` or `list_features` to locate the import/export UI owner.
4. Use `trace_query` to find the React Query hook or mutation that should change.
5. Follow the API module to the request implementation in `src/shared/api/user/user.api.ts`.

This does not replace the backend MCP. For a full feature implementation, use:

- `atlas-dashboard` to find the frontend wiring
- `atlas-backend` to confirm or implement the backend endpoint
- `atlas-project` if you want to exercise the running API behavior

## Prerequisites

- Node 20 (via nvm)

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
    "atlas-dashboard": {
      "command": "node",
      "args": ["<atlas-root>/tools/mcp-servers/dashboard/dist/index.js"],
      "env": {
        "ATLAS_DASHBOARD_PATH": "<atlas-root>/apps/dashboard"
      }
    }
  }
}
```

| Variable | Required | Default | Description |
|---|---|---|---|
| `ATLAS_DASHBOARD_PATH` | yes | — | Absolute path to the `apps/dashboard/` directory |

If your MCP client does not resolve `node` from `PATH`, replace `"command": "node"` with the absolute binary path from:

```bash
source ~/.nvm/nvm.sh && nvm use 20 && which node
```

## Available Tools

### Dashboard Structure
| Tool | Description |
|---|---|
| `overview` | Summarize dashboard architecture, routes, pages, features, queries, and stores |
| `list_routes` | List React Router routes and the page/layout component wired to each path |
| `trace_route` | Trace a route to its page file, imported features, widgets, queries, and stores |
| `list_features` | List feature folders and their component files |
| `trace_query` | Trace a React Query hook/mutation to its API client and likely endpoint usage |
| `list_stores` | List Zustand stores in `src/shared/store` |

### Code Navigation
| Tool | Description |
|---|---|
| `find_component` | Find likely owners of a component, table, dialog, or page by name |
| `read_file` | Read any dashboard file by relative path |
| `search_code` | Search dashboard source with context lines |
| `list_directory` | List files and folders at a path within the dashboard |
| `find_file` | Find files by name pattern |
