import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DashboardMcpConfig } from '../config.js';
import type { IndexCache, QueryEntry, RouteEntry } from '../index-cache.js';

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const err = (m: string) => ({ content: [{ type: 'text' as const, text: m }], isError: true as const });

const DASHBOARD_OVERVIEW = `
# Atlas Dashboard Overview

## Structure
  src/App.tsx                 React Router entry point
  src/pages/                  Route pages
  src/features/               Feature-owned UI and workflow components
  src/widgets/                Shared page-level layout and wrappers
  src/shared/api/             HTTP client modules by domain
  src/shared/queries/         React Query hooks and mutations
  src/shared/store/           Zustand client state
  src/components/ui/          Reusable UI primitives

## What This MCP Is Good At
  - find which page or component owns a UI
  - trace page -> feature -> query -> API client
  - locate where a table, dialog, mutation, or route is wired
  - inspect React Router structure, Zustand stores, React Query usage, and shared UI patterns
  - answer "where should this dashboard change go?" without broad grep
`.trim();

export function registerInsightTools(
  server: McpServer,
  cache: IndexCache,
  config: DashboardMcpConfig,
): void {
  server.registerTool('overview', {
    title: 'Dashboard Overview',
    description: 'Summarize dashboard structure, routes, pages, features, queries, and stores.',
    inputSchema: {},
  }, async () => {
    const lines = [
      DASHBOARD_OVERVIEW,
      '',
      '## Live Counts',
      `  Routes:   ${cache.routes.length}`,
      `  Pages:    ${cache.pages.length}`,
      `  Features: ${cache.features.length}`,
      `  Queries:  ${cache.queries.length}`,
      `  Stores:   ${cache.stores.length}`,
    ];

    if (cache.features.length > 0) {
      lines.push('', '## Feature Modules');
      for (const feature of cache.features) {
        lines.push(`  ${feature.name}: ${feature.componentFiles.length} component files`);
      }
    }

    return text(lines.join('\n'));
  });

  server.registerTool('list_routes', {
    title: 'List Dashboard Routes',
    description: 'List React Router routes with the page component and layout owner.',
    inputSchema: {
      filter: z.string().optional().describe('Case-insensitive filter applied to path or component name'),
    },
  }, async ({ filter }) => {
    let routes = cache.routes;
    if (filter) {
      const needle = filter.toLowerCase();
      routes = routes.filter((route) =>
        route.path.toLowerCase().includes(needle) ||
        route.pageComponent.toLowerCase().includes(needle) ||
        (route.layoutComponent ?? '').toLowerCase().includes(needle)
      );
    }

    if (routes.length === 0) {
      return text(filter ? `No routes match "${filter}".` : 'No routes found.');
    }

    return text([
      `Routes (${routes.length}):`,
      ...routes.map((route) => {
        const layout = route.layoutComponent ? ` layout=${route.layoutComponent}` : '';
        const source = route.pageImportPath ? ` source=${route.pageImportPath}` : '';
        return `  ${route.path.padEnd(16)} ${route.pageComponent}${layout}${source}`;
      }),
    ].join('\n'));
  });

  server.registerTool('trace_route', {
    title: 'Trace Dashboard Route',
    description: 'Trace a route to the page file, imported features, widgets, queries, and stores.',
    inputSchema: {
      path: z.string().min(1).describe('Route path such as "/", "/users", or "/activity-logs"'),
    },
  }, async ({ path: routePath }) => {
    const route = findRoute(cache.routes, routePath);
    if (!route) {
      return err(`No route found for "${routePath}".`);
    }

    const page = cache.pages.find((entry) => entry.componentName === route.pageComponent);
    const lines = [
      `Route:  ${route.path}`,
      `Page:   ${route.pageComponent}`,
      `Layout: ${route.layoutComponent ?? '(none)'}`,
      `Import: ${route.pageImportPath ?? '(unknown)'}`,
    ];

    if (!page) {
      return text(lines.join('\n'));
    }

    lines.push(`File:   ${relative(config, page.filePath)}`);
    lines.push('');
    lines.push(`Features: ${formatList(page.importedFeatures)}`);
    lines.push(`Widgets:  ${formatList(page.importedWidgets)}`);
    lines.push(`Queries:  ${formatList(page.importedQueries)}`);
    lines.push(`Stores:   ${formatList(page.importedStores)}`);

    return text(lines.join('\n'));
  });

  server.registerTool('list_features', {
    title: 'List Dashboard Features',
    description: 'List feature folders and their component files.',
    inputSchema: {
      filter: z.string().optional().describe('Filter by feature name'),
    },
  }, async ({ filter }) => {
    let features = cache.features;
    if (filter) {
      const needle = filter.toLowerCase();
      features = features.filter((feature) => feature.name.toLowerCase().includes(needle));
    }

    if (features.length === 0) {
      return text(filter ? `No features match "${filter}".` : 'No features found.');
    }

    const lines: string[] = [`Features (${features.length}):`];
    for (const feature of features) {
      lines.push(`${feature.name}/`);
      for (const componentFile of feature.componentFiles) {
        lines.push(`  ${componentFile}`);
      }
    }

    return text(lines.join('\n'));
  });

  server.registerTool('trace_query', {
    title: 'Trace Dashboard Query',
    description: 'Trace a React Query hook or mutation to its file, API module imports, and likely endpoint usage.',
    inputSchema: {
      query: z.string().min(1).describe('Query or mutation name, such as "useUsersQuery" or "login"'),
    },
  }, async ({ query }) => {
    const entry = findQuery(cache.queries, query);
    if (!entry) {
      return err(`No query or mutation found matching "${query}".`);
    }

    const lines = [
      `Name:      ${entry.name}`,
      `Kind:      ${entry.kind}`,
      `File:      ${relative(config, entry.filePath)}`,
      `API:       ${formatList(entry.importedApiModules)}`,
      `API calls: ${formatList(entry.apiCalls)}`,
    ];

    const endpointHints = readApiEndpointHints(config, entry);
    if (endpointHints.length > 0) {
      lines.push(`Endpoints: ${formatList(endpointHints)}`);
    }

    return text(lines.join('\n'));
  });

  server.registerTool('list_stores', {
    title: 'List Dashboard Stores',
    description: 'List Zustand stores exported from src/shared/store.',
    inputSchema: {},
  }, async () => {
    if (cache.stores.length === 0) {
      return text('No stores found.');
    }

    return text([
      `Stores (${cache.stores.length}):`,
      ...cache.stores.map((store) => `  ${relative(config, store.filePath)} -> ${formatList(store.exports)}`),
    ].join('\n'));
  });

  server.registerTool('find_component', {
    title: 'Find Dashboard Component',
    description: 'Find likely component owners by component name, file name, or UI term such as table or dialog.',
    inputSchema: {
      query: z.string().min(1).describe('Component or UI term to search for'),
    },
  }, async ({ query }) => {
    const needle = query.toLowerCase();
    const sourceRoot = path.join(config.dashboardPath, 'src');
    const matches: string[] = [];

    walkTsx(sourceRoot, (filePath) => {
      const content = fs.readFileSync(filePath, 'utf8');
      const basename = path.basename(filePath).toLowerCase();
      if (basename.includes(needle) || content.toLowerCase().includes(needle)) {
        matches.push(relative(config, filePath));
      }
    });

    if (matches.length === 0) {
      return text(`No component matches "${query}".`);
    }

    return text([
      `Component matches for "${query}" (${matches.length}):`,
      ...matches.slice(0, 50).map((match) => `  ${match}`),
    ].join('\n'));
  });
}

function findRoute(routes: RouteEntry[], routePath: string): RouteEntry | undefined {
  const normalized = normalizeRoute(routePath);
  return routes.find((route) => normalizeRoute(route.path) === normalized);
}

function findQuery(queries: QueryEntry[], query: string): QueryEntry | undefined {
  const needle = query.toLowerCase();
  return queries.find((entry) =>
    entry.name.toLowerCase() === needle ||
    entry.name.toLowerCase().includes(needle) ||
    path.basename(entry.filePath).toLowerCase().includes(needle)
  );
}

function readApiEndpointHints(config: DashboardMcpConfig, entry: QueryEntry): string[] {
  const hints: string[] = [];

  for (const apiImport of entry.importedApiModules) {
    const importBasePath = path.join(
      config.dashboardPath,
      apiImport.replace(/^@\//, 'src/')
    );
    const candidates = [`${importBasePath}.ts`, path.join(importBasePath, 'index.ts')];
    const absolutePath = candidates.find((candidate) => fs.existsSync(candidate));
    if (!absolutePath) {
      continue;
    }

    const content = fs.readFileSync(absolutePath, 'utf8');
    for (const match of content.matchAll(/["'`](\/api\/v\d\/[^"'`]+)["'`]/g)) {
      hints.push(match[1]);
    }
  }

  return hints.filter(onlyUnique).sort();
}

function walkTsx(root: string, visit: (filePath: string) => void): void {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walkTsx(absolutePath, visit);
      continue;
    }
    if (entry.isFile() && absolutePath.endsWith('.tsx')) {
      visit(absolutePath);
    }
  }
}

function relative(config: DashboardMcpConfig, filePath: string): string {
  return filePath.replace(config.dashboardPath + path.sep, '');
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(', ') : '(none)';
}

function normalizeRoute(routePath: string): string {
  if (routePath === '') {
    return '/';
  }
  return routePath.startsWith('/') ? routePath : `/${routePath}`;
}

function onlyUnique(value: string, index: number, values: string[]): boolean {
  return values.indexOf(value) === index;
}
