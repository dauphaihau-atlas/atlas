import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BackendMcpConfig } from '../config.js';

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const err  = (m: string) => ({ content: [{ type: 'text' as const, text: m }], isError: true as const });

function safePath(backendPath: string, relativePath: string): string | null {
  const resolved = path.resolve(backendPath, relativePath);
  if (!resolved.startsWith(backendPath + path.sep) && resolved !== backendPath) return null;
  return resolved;
}

export function registerCodeTools(server: McpServer, config: BackendMcpConfig): void {
  server.registerTool('read_file', {
    title: 'Read Backend File',
    description: 'Read any file from the Laravel backend by relative path (e.g. "app/Core/Application/UseCases/User/CreateUser/CreateUserUseCase.php").',
    inputSchema: {
      path: z.string().min(1).describe('Relative path from backend root (e.g. "app/Models/User.php")'),
    },
  }, async ({ path: relPath }) => {
    const abs = safePath(config.backendPath, relPath);
    if (!abs) return err('Path traversal detected — path must stay within the backend root.');
    try {
      const content = fs.readFileSync(abs, 'utf8');
      return text(content);
    } catch (e: unknown) {
      return err(`Cannot read file: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  server.registerTool('search_code', {
    title: 'Search Backend Code',
    description: 'Search across the backend codebase using a grep pattern. Returns matching lines with file path, line number, and optional context.',
    inputSchema: {
      pattern:   z.string().min(1).describe('Search pattern (grep-compatible, case-insensitive by default)'),
      directory: z.string().optional().describe('Relative directory to limit search scope (e.g. "app/Core", "app/Presentation"). Defaults to entire backend.'),
      context:   z.number().int().min(0).max(10).optional().describe('Lines of context before and after each match (default: 2)'),
      case_sensitive: z.boolean().optional().describe('Use case-sensitive matching (default: false)'),
    },
  }, async ({ pattern, directory, context, case_sensitive }) => {
    // Sanitize pattern — allow common regex metacharacters
    const safe = pattern.replace(/[`$\\]/g, '');
    if (!safe) return err('Pattern contains unsafe characters.');

    const searchRoot = directory
      ? (safePath(config.backendPath, directory) ?? config.backendPath)
      : config.backendPath;

    const ctxLines = Math.min(context ?? 2, 10);
    const caseFlag = case_sensitive ? '' : '-i';
    const cmd = `grep -rn ${caseFlag} -C ${ctxLines} --include="*.php" "${safe}" "${searchRoot}" 2>/dev/null | head -200`;

    try {
      const output = execSync(cmd, {
        encoding: 'utf8',
        timeout: 15_000,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: '/bin/sh',
      });
      if (!output.trim()) return text(`No matches for "${pattern}".`);
      // Strip the absolute backend path prefix for readability
      const cleaned = output.replace(new RegExp(config.backendPath + '/', 'g'), '');
      return text(cleaned.trim());
    } catch (e: unknown) {
      const ex = e as { status?: number; stdout?: string };
      if (ex.status === 1 || (ex.stdout !== undefined && ex.stdout === '')) {
        return text(`No matches for "${pattern}".`);
      }
      return err(`Search failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  server.registerTool('list_directory', {
    title: 'List Directory',
    description: 'List files and subdirectories at a given path within the backend.',
    inputSchema: {
      path: z.string().optional().describe('Relative path from backend root (default: root). E.g. "app/Core/Application/UseCases"'),
    },
  }, async ({ path: relPath }) => {
    const abs = relPath
      ? (safePath(config.backendPath, relPath) ?? config.backendPath)
      : config.backendPath;

    try {
      const entries = fs.readdirSync(abs, { withFileTypes: true });
      const dirs  = entries.filter((e) => e.isDirectory()).map((e) => `  [dir]  ${e.name}/`);
      const files = entries.filter((e) => e.isFile()).map((e) => `  [file] ${e.name}`);
      const displayPath = relPath ?? '/';
      return text(`Contents of ${displayPath} (${entries.length} entries):\n${[...dirs, ...files].join('\n')}`);
    } catch (e: unknown) {
      return err(`Cannot list directory: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  server.registerTool('find_file', {
    title: 'Find File',
    description: 'Find files by name pattern within the backend (e.g. "*UseCase.php", "UserController.php").',
    inputSchema: {
      name: z.string().min(1).describe('Filename pattern to search for (e.g. "*UseCase.php", "User*.php")'),
      directory: z.string().optional().describe('Relative directory to search within (default: entire backend)'),
    },
  }, async ({ name, directory }) => {
    const searchRoot = directory
      ? (safePath(config.backendPath, directory) ?? config.backendPath)
      : config.backendPath;

    // Sanitize name to prevent shell injection
    const safeName = name.replace(/[`$\\;|&<>]/g, '');
    if (!safeName) return err('Invalid filename pattern.');

    try {
      const output = execSync(`find "${searchRoot}" -name "${safeName}" -type f 2>/dev/null`, {
        encoding: 'utf8',
        timeout: 10_000,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: '/bin/sh',
      });
      if (!output.trim()) return text(`No files found matching "${name}".`);
      const lines = output.trim().split('\n')
        .map((f) => f.replace(config.backendPath + '/', ''))
        .sort();
      return text(`Files matching "${name}" (${lines.length}):\n${lines.map((l) => `  ${l}`).join('\n')}`);
    } catch (e: unknown) {
      return err(`Find failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
}
