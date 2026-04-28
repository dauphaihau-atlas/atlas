import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { BackendMcpConfig } from './config.js';

export interface RouteEntry {
  method: string;
  uri: string;
  name: string | null;
  action: string;
  middleware: string[];
}

export interface UseCaseEntry {
  domain: string;
  feature: string;
  dirPath: string;
}

export interface IndexCache {
  routes: RouteEntry[];
  useCases: UseCaseEntry[];
  modelNames: string[];
}

export function buildCache(config: BackendMcpConfig): IndexCache {
  const routes     = loadRoutes(config);
  const useCases   = loadUseCases(config);
  const modelNames = loadModels(config);

  process.stderr.write(
    `[backend-mcp] Index built: ${routes.length} routes, ${useCases.length} use cases, ${modelNames.length} models\n`
  );

  return { routes, useCases, modelNames };
}

function loadRoutes(config: BackendMcpConfig): RouteEntry[] {
  try {
    const raw = execSync(
      `docker exec ${config.phpContainer} php artisan route:list --json --no-ansi`,
      { encoding: 'utf8', timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const parsed = JSON.parse(raw) as Array<{
      method: string;
      uri: string;
      name?: string | null;
      action: string;
      middleware?: string | string[];
    }>;
    return parsed.map((r) => ({
      method: r.method,
      uri: r.uri,
      name: r.name ?? null,
      action: r.action,
      middleware: Array.isArray(r.middleware)
        ? r.middleware
        : typeof r.middleware === 'string'
        ? r.middleware.split(',').map((m) => m.trim()).filter(Boolean)
        : [],
    }));
  } catch (e) {
    process.stderr.write(`[backend-mcp] Route index failed: ${e instanceof Error ? e.message : String(e)}\n`);
    return [];
  }
}

function loadUseCases(config: BackendMcpConfig): UseCaseEntry[] {
  const useCasesRoot = path.join(config.backendPath, 'app', 'Core', 'Application', 'UseCases');
  const result: UseCaseEntry[] = [];
  try {
    const domains = fs.readdirSync(useCasesRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    for (const domain of domains) {
      const domainPath = path.join(useCasesRoot, domain);
      const features = fs.readdirSync(domainPath, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
      for (const feature of features) {
        result.push({ domain, feature, dirPath: path.join(domainPath, feature) });
      }
    }
  } catch (e) {
    process.stderr.write(`[backend-mcp] Use case index failed: ${e instanceof Error ? e.message : String(e)}\n`);
  }
  return result;
}

function loadModels(config: BackendMcpConfig): string[] {
  const modelsPath = path.join(
    config.backendPath, 'app', 'Infrastructure', 'Persistence', 'Eloquent', 'Models'
  );
  try {
    return fs.readdirSync(modelsPath)
      .filter((f) => f.endsWith('.php'))
      .map((f) => f.replace('.php', ''));
  } catch (e) {
    process.stderr.write(`[backend-mcp] Model index failed: ${e instanceof Error ? e.message : String(e)}\n`);
    return [];
  }
}
