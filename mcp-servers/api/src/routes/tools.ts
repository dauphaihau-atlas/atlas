import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BackendMcpConfig } from '../config.js';
import type { IndexCache, RouteEntry } from '../index-cache.js';

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const err  = (m: string) => ({ content: [{ type: 'text' as const, text: m }], isError: true as const });

/** Convert PHP fully-qualified class name to absolute file path. */
function classToFile(backendPath: string, fqcn: string): string {
  const relative = fqcn
    .replace(/^App\\/, 'app/')
    .replace(/\\/g, '/') + '.php';
  return path.join(backendPath, relative);
}

/** Extract a method body from PHP source using brace-counting. */
function extractMethod(content: string, methodName: string): string | null {
  // Match `function methodName(...)  {`
  const sig = new RegExp(
    `((?:public|protected|private|static|\\s)*function\\s+${methodName}\\s*\\([^)]*\\)[^{]*)\\{`,
    's'
  );
  const sigMatch = content.match(sig);
  if (!sigMatch) return null;

  const sigStart = content.indexOf(sigMatch[0]);
  const braceOpen = content.indexOf('{', sigStart + sigMatch[0].length - 1);
  if (braceOpen === -1) return null;

  let depth = 1;
  let i = braceOpen + 1;
  while (i < content.length && depth > 0) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') depth--;
    i++;
  }

  const full = content.substring(sigStart, i);
  const lines = full.split('\n');
  // Truncate very long methods
  return lines.length > 50 ? lines.slice(0, 50).join('\n') + '\n    // ... (truncated)' : full;
}

/** Format a route for one-line display. */
function fmtRoute(r: RouteEntry): string {
  const name = r.name ? ` [${r.name}]` : '';
  const mw = r.middleware.length > 0 ? `  (${r.middleware.join(', ')})` : '';
  return `${r.method.padEnd(12)} /${r.uri.padEnd(55)} ${r.action}${name}${mw}`;
}

export function registerRouteTools(
  server: McpServer,
  cache: IndexCache,
  config: BackendMcpConfig,
): void {
  server.registerTool('list_routes', {
    title: 'List API Routes',
    description: 'List all registered API routes with method, URI, controller action, and middleware. Optionally filter by URI, action, or route name.',
    inputSchema: {
      filter: z.string().optional().describe('Case-insensitive filter applied to URI, action, or route name'),
    },
  }, async ({ filter }) => {
    if (cache.routes.length === 0) {
      return err('Route index is empty. Ensure the PHP container is running (docker compose ps) and artisan works.');
    }
    let routes = cache.routes;
    if (filter) {
      const q = filter.toLowerCase();
      routes = routes.filter((r) =>
        r.uri.toLowerCase().includes(q) ||
        r.action.toLowerCase().includes(q) ||
        (r.name ?? '').toLowerCase().includes(q)
      );
    }
    if (routes.length === 0) return text(`No routes match "${filter}".`);
    return text(`Routes (${routes.length}):\n${routes.map(fmtRoute).join('\n')}`);
  });

  server.registerTool('find_route', {
    title: 'Find Route',
    description: 'Find a specific route by URI, route name, or controller action. Returns full details for all matching routes.',
    inputSchema: {
      query: z.string().min(1).describe('Route URI, name, or controller@method to search for (case-insensitive)'),
    },
  }, async ({ query }) => {
    const q = query.toLowerCase();
    const matches = cache.routes.filter((r) =>
      r.uri.toLowerCase().includes(q) ||
      r.action.toLowerCase().includes(q) ||
      (r.name ?? '').toLowerCase().includes(q)
    );
    if (matches.length === 0) return err(`No route found matching "${query}".`);
    const lines = matches.map((r) => [
      `Method:     ${r.method}`,
      `URI:        /${r.uri}`,
      `Name:       ${r.name ?? '(none)'}`,
      `Action:     ${r.action}`,
      `Middleware: ${r.middleware.join(', ') || '(none)'}`,
      '---',
    ].join('\n'));
    return text(lines.join('\n'));
  });

  server.registerTool('trace_route', {
    title: 'Trace Route',
    description: [
      'Trace the full request flow for a route through all Clean Architecture layers:',
      'FormRequest validation → Controller method → UseCase (with Request/Response DTOs)',
      '→ Repository interface → Eloquent implementation.',
      'Provides file paths and key code snippets at each layer.',
    ].join(' '),
    inputSchema: {
      uri:    z.string().min(1).describe('Route URI to trace (e.g. "api/v1/users" or just "users")'),
      method: z.string().optional().describe('HTTP method (GET, POST, PUT, DELETE…). Picks first match if omitted.'),
    },
  }, async ({ uri, method }) => {
    const uriNorm   = uri.replace(/^\//, '').toLowerCase();
    const methodNorm = method?.toUpperCase();

    const route = cache.routes.find((r) => {
      const uriMatch    = r.uri.toLowerCase() === uriNorm || r.uri.toLowerCase().includes(uriNorm);
      const methodMatch = !methodNorm || r.method.toUpperCase().includes(methodNorm);
      return uriMatch && methodMatch;
    });
    if (!route) return err(`No route found for "${method ?? 'ANY'} /${uri}".`);

    const sections: string[] = [
      `═══ Route Trace: ${route.method} /${route.uri} ═══`,
      `Name:       ${route.name ?? '(none)'}`,
      `Middleware: ${route.middleware.join(', ') || '(none)'}`,
      '',
    ];

    // Parse "ControllerClass@method"
    const atIdx = route.action.lastIndexOf('@');
    if (atIdx === -1) {
      sections.push('Not a controller action — cannot trace further.');
      return text(sections.join('\n'));
    }
    const controllerClass = route.action.substring(0, atIdx);
    const methodName      = route.action.substring(atIdx + 1);
    const controllerFile  = classToFile(config.backendPath, controllerClass);

    let controllerContent = '';
    try {
      controllerContent = fs.readFileSync(controllerFile, 'utf8');
    } catch {
      sections.push(`[Controller] File not found:\n  ${controllerFile}`);
      return text(sections.join('\n'));
    }

    // ── Layer 1: Controller ──────────────────────────────────────────────────
    sections.push(`─── [1] Presentation / Controller ───`);
    sections.push(`File: ${controllerFile.replace(config.backendPath + '/', '')}`);
    sections.push(`Class: ${controllerClass}`);
    sections.push(`Method: ${methodName}()\n`);

    const methodBody = extractMethod(controllerContent, methodName);
    if (methodBody) sections.push(methodBody);

    // ── Layer 2: FormRequest ─────────────────────────────────────────────────
    // Find the first type-hinted parameter that is a Request subclass
    const formRequestAlias = methodBody?.match(/function\s+\w+\s*\(\s*([\w]+Request)\s+/)?.[1];
    if (formRequestAlias) {
      // Find the use statement for this alias
      const usePattern = new RegExp(`use ([\\w\\\\]+)(?:\\s+as\\s+${formRequestAlias})?;`);
      const useMatches = [...controllerContent.matchAll(new RegExp(`use ([\\w\\\\]+)(?:\\s+as\\s+${formRequestAlias})?;`, 'g'))];
      const formRequestUse = useMatches.find(
        (m) => m[0].includes(formRequestAlias) || m[1].endsWith(formRequestAlias)
      );
      const formRequestClass = formRequestUse?.[1]?.trim();

      if (formRequestClass) {
        const frFile = classToFile(config.backendPath, formRequestClass);
        sections.push(`\n─── [2] Presentation / FormRequest ───`);
        sections.push(`File: ${frFile.replace(config.backendPath + '/', '')}`);
        sections.push(`Class: ${formRequestClass}\n`);
        try {
          const frContent = fs.readFileSync(frFile, 'utf8');
          const rulesBody = extractMethod(frContent, 'rules');
          if (rulesBody) sections.push(rulesBody);
        } catch {
          sections.push('(File not found)');
        }
      }
    }

    // ── Layer 3: UseCase ─────────────────────────────────────────────────────
    // Find UseCase called in method: $this->createUserUseCase->execute(
    const useCasePropMatch = methodBody?.match(/\$this->(\w+UseCase)->execute/);
    if (useCasePropMatch) {
      const prop = useCasePropMatch[1]; // e.g. createUserUseCase

      // Find the constructor type hint: CreateUserUseCase $createUserUseCase
      const ctorTypeMatch = controllerContent.match(
        new RegExp(`(\\w+UseCase)\\s+\\$${prop}`)
      );
      const useCaseShortName = ctorTypeMatch?.[1];

      // Find its full class via use statement
      let useCaseClass = '';
      if (useCaseShortName) {
        const ucUse = controllerContent.match(new RegExp(`use ([\\w\\\\]+\\b${useCaseShortName}\\b)[^;]*;`));
        useCaseClass = ucUse?.[1]?.trim() ?? useCaseShortName;
      }

      if (useCaseClass) {
        const ucFile = classToFile(config.backendPath, useCaseClass);
        sections.push(`\n─── [3] Application / UseCase ───`);
        sections.push(`File: ${ucFile.replace(config.backendPath + '/', '')}`);
        sections.push(`Class: ${useCaseClass}\n`);

        let ucContent = '';
        try {
          ucContent = fs.readFileSync(ucFile, 'utf8');
          const ctor = extractMethod(ucContent, '__construct');
          if (ctor) sections.push(ctor + '\n');
          const exec = extractMethod(ucContent, 'execute');
          if (exec) sections.push(exec);
        } catch {
          sections.push('(File not found)');
        }

        // ── DTOs in same directory ─────────────────────────────────────────
        const ucDir = path.dirname(ucFile);
        try {
          const dtoFiles = fs.readdirSync(ucDir).filter((f) => f.endsWith('.php') && !f.endsWith('UseCase.php'));
          if (dtoFiles.length > 0) {
            sections.push(`\n─── [3b] Application / DTOs (${ucDir.replace(config.backendPath + '/', '')}) ───`);
            for (const dtoFile of dtoFiles.sort()) {
              const dtoPath = path.join(ucDir, dtoFile);
              try {
                const dtoContent = fs.readFileSync(dtoPath, 'utf8');
                sections.push(`\n-- ${dtoFile} --`);
                sections.push(dtoContent.trim());
              } catch {
                sections.push(`-- ${dtoFile} (unreadable) --`);
              }
            }
          }
        } catch {
          // non-fatal
        }

        // ── Layer 4: Repository Interface(s) ─────────────────────────────────
        if (ucContent) {
          const repoRefs = [...ucContent.matchAll(/(\w+RepositoryInterface)\s+\$\w+/g)];
          if (repoRefs.length > 0) {
            sections.push(`\n─── [4] Application / Repository Interfaces ───`);
            for (const ref of repoRefs) {
              const iface = ref[1];
              sections.push(`Interface: ${iface}`);

              // Guess Eloquent implementation name
              const implName = 'Eloquent' + iface.replace('Interface', '');
              const implRelPath = `app/Infrastructure/Persistence/Eloquent/Repositories/${implName}.php`;
              const implFile = path.join(config.backendPath, implRelPath);

              sections.push(`Implementation: ${implRelPath}`);

              // ── Layer 5: Eloquent Repository + Model ───────────────────────
              if (fs.existsSync(implFile)) {
                try {
                  const implContent = fs.readFileSync(implFile, 'utf8');
                  // Find Eloquent model used (ModelName::query / new ModelName / ModelName::find)
                  const modelMatch = implContent.match(/\b(\w+Model)\b(?:::|[ \t]*-)/);
                  if (modelMatch) {
                    const modelName = modelMatch[1];
                    const modelRelPath = `app/Infrastructure/Persistence/Eloquent/Models/${modelName}.php`;
                    sections.push(`\n─── [5] Infrastructure / Eloquent Model ───`);
                    sections.push(`File: ${modelRelPath}`);
                    const modelFile = path.join(config.backendPath, modelRelPath);
                    try {
                      const modelContent = fs.readFileSync(modelFile, 'utf8');
                      // Extract table, fillable, casts, relationships
                      const tableMatch    = modelContent.match(/protected \$table\s*=\s*'([^']+)'/);
                      const fillableMatch = modelContent.match(/protected \$fillable\s*=\s*\[([^\]]+)\]/s);
                      const castsMatch    = modelContent.match(/protected \$casts\s*=\s*\[([^\]]+)\]/s);
                      const relationships = [...modelContent.matchAll(/public function (\w+)\(\).*?(?:HasMany|HasOne|BelongsTo|BelongsToMany|MorphTo|MorphMany)/gs)]
                        .map((m) => m[1]);
                      if (tableMatch)    sections.push(`Table:         ${tableMatch[1]}`);
                      if (fillableMatch) sections.push(`Fillable:      [${fillableMatch[1].trim()}]`);
                      if (castsMatch)    sections.push(`Casts:         [${castsMatch[1].trim()}]`);
                      if (relationships.length > 0) sections.push(`Relationships: ${relationships.join(', ')}`);
                    } catch {
                      // non-fatal
                    }
                  }
                } catch {
                  sections.push('(Implementation file unreadable)');
                }
              } else {
                sections.push('(Implementation file not found — check Repositories/ folder)');
              }
            }
          }
        }
      }
    }

    return text(sections.join('\n'));
  });
}
