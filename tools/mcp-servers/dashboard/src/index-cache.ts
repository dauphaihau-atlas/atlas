import * as fs from 'fs';
import * as path from 'path';
import type { DashboardMcpConfig } from './config.js';

export interface RouteEntry {
  path: string;
  pageComponent: string;
  pageImportPath: string | null;
  layoutComponent: string | null;
}

export interface PageEntry {
  componentName: string;
  filePath: string;
  importedFeatures: string[];
  importedWidgets: string[];
  importedQueries: string[];
  importedStores: string[];
}

export interface FeatureEntry {
  name: string;
  componentFiles: string[];
}

export interface QueryEntry {
  name: string;
  filePath: string;
  kind: 'query' | 'mutation';
  importedApiModules: string[];
  apiCalls: string[];
}

export interface StoreEntry {
  name: string;
  filePath: string;
  exports: string[];
}

export interface IndexCache {
  routes: RouteEntry[];
  pages: PageEntry[];
  features: FeatureEntry[];
  queries: QueryEntry[];
  stores: StoreEntry[];
}

export function buildCache(config: DashboardMcpConfig): IndexCache {
  const pages = loadPages(config);
  const routes = loadRoutes(config);
  const features = loadFeatures(config);
  const queries = loadQueries(config);
  const stores = loadStores(config);

  process.stderr.write(
    `[dashboard-mcp] Index built: ${routes.length} routes, ${pages.length} pages, ${features.length} features, ${queries.length} queries, ${stores.length} stores\n`
  );

  return { routes, pages, features, queries, stores };
}

function listFiles(root: string, predicate: (filePath: string) => boolean): string[] {
  const result: string[] = [];

  function walk(currentPath: string): void {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      if (entry.isFile() && predicate(absolutePath)) {
        result.push(absolutePath);
      }
    }
  }

  if (fs.existsSync(root)) {
    walk(root);
  }

  return result.sort();
}

function toRelative(config: DashboardMcpConfig, absolutePath: string): string {
  return absolutePath.replace(config.dashboardPath + path.sep, '');
}

function parseImports(content: string, importPrefix: string): string[] {
  const pattern = new RegExp(`from ['"]${escapeRegExp(importPrefix)}([^'"]+)['"]`, 'g');
  return [...content.matchAll(pattern)]
    .map((match) => `${importPrefix}${match[1]}`)
    .filter(onlyUnique)
    .sort();
}

function parseExportedFunctions(content: string): string[] {
  const matches = [
    ...content.matchAll(/export function (\w+)/g),
    ...content.matchAll(/export const (\w+)\s*=/g),
  ];
  return matches.map((match) => match[1]).filter(onlyUnique).sort();
}

function parseApiCalls(content: string): string[] {
  return [...content.matchAll(/(\w+Api)\.(\w+)\(/g)]
    .map((match) => `${match[1]}.${match[2]}`)
    .filter(onlyUnique)
    .sort();
}

function loadPages(config: DashboardMcpConfig): PageEntry[] {
  const pagesRoot = path.join(config.dashboardPath, 'src', 'pages');
  const pageFiles = listFiles(pagesRoot, (filePath) => filePath.endsWith('/page.tsx'));

  return pageFiles.map((filePath) => {
    const content = fs.readFileSync(filePath, 'utf8');
    const componentName = parseExportedFunctions(content)[0] ?? path.basename(path.dirname(filePath));

    return {
      componentName,
      filePath,
      importedFeatures: parseImports(content, '@/features/'),
      importedWidgets: parseImports(content, '@/widgets/'),
      importedQueries: parseImports(content, '@/shared/queries/'),
      importedStores: parseImports(content, '@/shared/store/'),
    };
  });
}

function loadRoutes(config: DashboardMcpConfig): RouteEntry[] {
  const appPath = path.join(config.dashboardPath, 'src', 'App.tsx');
  if (!fs.existsSync(appPath)) {
    return [];
  }

  const content = fs.readFileSync(appPath, 'utf8');
  const importMap = new Map<string, string>();

  for (const match of content.matchAll(/import\s+\{\s*([^}]+)\s*\}\s+from\s+['"]([^'"]+)['"]/g)) {
    const names = match[1].split(',').map((name) => name.trim()).filter(Boolean);
    for (const name of names) {
      importMap.set(name, match[2]);
    }
  }

  let layoutComponent: string | null = null;
  const layoutMatch = content.match(/<Route\s+element={<(\w+)\s*\/?>}>/);
  if (layoutMatch) {
    layoutComponent = layoutMatch[1];
  }

  const routes: RouteEntry[] = [];
  for (const match of content.matchAll(/<Route\s+([^>]*?)\/>/g)) {
    const attrs = match[1];
    const componentMatch = attrs.match(/element={<(\w+)/);
    if (!componentMatch) {
      continue;
    }

    const pageComponent = componentMatch[1];
    const isIndex = /\bindex\b/.test(attrs);
    const pathMatch = attrs.match(/path="([^"]+)"/);

    let routePath = pathMatch?.[1] ?? '';
    if (isIndex) {
      routePath = '/';
    } else if (routePath !== '' && !routePath.startsWith('/')) {
      routePath = `/${routePath}`;
    }

    routes.push({
      path: routePath || '/',
      pageComponent,
      pageImportPath: importMap.get(pageComponent) ?? null,
      layoutComponent: routePath === '/login' || routePath === '/register' ? null : layoutComponent,
    });
  }

  return routes;
}

function loadFeatures(config: DashboardMcpConfig): FeatureEntry[] {
  const featuresRoot = path.join(config.dashboardPath, 'src', 'features');
  if (!fs.existsSync(featuresRoot)) {
    return [];
  }

  return fs.readdirSync(featuresRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const featureRoot = path.join(featuresRoot, entry.name);
      const componentFiles = listFiles(featureRoot, (filePath) => filePath.endsWith('.tsx'))
        .map((filePath) => toRelative(config, filePath));

      return {
        name: entry.name,
        componentFiles,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function loadQueries(config: DashboardMcpConfig): QueryEntry[] {
  const queriesRoot = path.join(config.dashboardPath, 'src', 'shared', 'queries');
  const queryFiles = listFiles(
    queriesRoot,
    (filePath) =>
      filePath.endsWith('.query.ts') ||
      filePath.endsWith('.mutation.ts') ||
      filePath.endsWith('.mutations.ts')
  );

  return queryFiles.flatMap((filePath) => {
    const content = fs.readFileSync(filePath, 'utf8');
    const names = parseExportedFunctions(content);
    const kind = filePath.includes('.query.') ? 'query' : 'mutation';
    const importedApiModules = parseImports(content, '@/shared/api/');
    const apiCalls = parseApiCalls(content);

    if (names.length === 0) {
      return [{
        name: path.basename(filePath),
        filePath,
        kind,
        importedApiModules,
        apiCalls,
      }];
    }

    return names.map((name) => ({
      name,
      filePath,
      kind,
      importedApiModules,
      apiCalls,
    }));
  });
}

function loadStores(config: DashboardMcpConfig): StoreEntry[] {
  const storesRoot = path.join(config.dashboardPath, 'src', 'shared', 'store');
  const storeFiles = listFiles(storesRoot, (filePath) => filePath.endsWith('.ts'));

  return storeFiles
    .map((filePath) => {
      const content = fs.readFileSync(filePath, 'utf8');
      return {
        name: path.basename(filePath, path.extname(filePath)),
        filePath,
        exports: parseExportedFunctions(content),
      };
    })
    .filter((entry) => entry.exports.length > 0 || fs.readFileSync(entry.filePath, 'utf8').includes('create('));
}

function onlyUnique(value: string, index: number, values: string[]): boolean {
  return values.indexOf(value) === index;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
