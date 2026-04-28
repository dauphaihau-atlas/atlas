import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DashboardMcpConfig } from '../config.js';

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const err = (m: string) => ({ content: [{ type: 'text' as const, text: m }], isError: true as const });

function safePath(dashboardPath: string, relativePath: string): string | null {
  const resolved = path.resolve(dashboardPath, relativePath);
  if (!resolved.startsWith(dashboardPath + path.sep) && resolved !== dashboardPath) {
    return null;
  }
  return resolved;
}

export function registerCodeTools(server: McpServer, config: DashboardMcpConfig): void {
  server.registerTool('read_file', {
    title: 'Read Dashboard File',
    description: 'Read any file from the dashboard by relative path.',
    inputSchema: {
      path: z.string().min(1).describe('Relative path from dashboard root (e.g. "src/pages/users/page.tsx")'),
    },
  }, async ({ path: relativePath }) => {
    const absolutePath = safePath(config.dashboardPath, relativePath);
    if (!absolutePath) {
      return err('Path traversal detected — path must stay within the dashboard root.');
    }

    try {
      return text(fs.readFileSync(absolutePath, 'utf8'));
    } catch (error: unknown) {
      return err(`Cannot read file: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  server.registerTool('search_code', {
    title: 'Search Dashboard Code',
    description: 'Search across the dashboard codebase with optional context lines.',
    inputSchema: {
      pattern: z.string().min(1).describe('Search pattern'),
      directory: z.string().optional().describe('Relative directory to search within (default: entire dashboard)'),
      context: z.number().int().min(0).max(10).optional().describe('Lines of context before and after each match (default: 2)'),
      case_sensitive: z.boolean().optional().describe('Use case-sensitive matching (default: false)'),
    },
  }, async ({ pattern, directory, context, case_sensitive }) => {
    const safePattern = pattern.replace(/[`$\\]/g, '');
    if (!safePattern) {
      return err('Pattern contains unsafe characters.');
    }

    const searchRoot = directory
      ? (safePath(config.dashboardPath, directory) ?? config.dashboardPath)
      : config.dashboardPath;

    const caseFlag = case_sensitive ? '' : '-i';
    const contextLines = Math.min(context ?? 2, 10);
    const command = `grep -rn ${caseFlag} -C ${contextLines} --include="*.ts" --include="*.tsx" --include="*.css" "${safePattern}" "${searchRoot}" 2>/dev/null | head -200`;

    try {
      const output = execSync(command, {
        encoding: 'utf8',
        timeout: 15_000,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: '/bin/sh',
      });
      if (!output.trim()) {
        return text(`No matches for "${pattern}".`);
      }

      const cleaned = output.replace(new RegExp(config.dashboardPath + '/', 'g'), '');
      return text(cleaned.trim());
    } catch (error: unknown) {
      const failure = error as { status?: number; stdout?: string };
      if (failure.status === 1 || (failure.stdout !== undefined && failure.stdout === '')) {
        return text(`No matches for "${pattern}".`);
      }
      return err(`Search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  server.registerTool('list_directory', {
    title: 'List Dashboard Directory',
    description: 'List files and subdirectories at a given path within the dashboard.',
    inputSchema: {
      path: z.string().optional().describe('Relative path from dashboard root (default: root)'),
    },
  }, async ({ path: relativePath }) => {
    const absolutePath = relativePath
      ? (safePath(config.dashboardPath, relativePath) ?? config.dashboardPath)
      : config.dashboardPath;

    try {
      const entries = fs.readdirSync(absolutePath, { withFileTypes: true });
      const lines = entries.map((entry) => `  [${entry.isDirectory() ? 'dir' : 'file'}] ${entry.name}${entry.isDirectory() ? '/' : ''}`);
      return text(`Contents of ${relativePath ?? '/'} (${entries.length} entries):\n${lines.join('\n')}`);
    } catch (error: unknown) {
      return err(`Cannot list directory: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  server.registerTool('find_file', {
    title: 'Find Dashboard File',
    description: 'Find files by name pattern within the dashboard.',
    inputSchema: {
      name: z.string().min(1).describe('Filename pattern to search for (e.g. "*Table.tsx", "page.tsx")'),
      directory: z.string().optional().describe('Relative directory to search within (default: entire dashboard)'),
    },
  }, async ({ name, directory }) => {
    const searchRoot = directory
      ? (safePath(config.dashboardPath, directory) ?? config.dashboardPath)
      : config.dashboardPath;

    const safeName = name.replace(/[`$\\;|&<>]/g, '');
    if (!safeName) {
      return err('Invalid filename pattern.');
    }

    try {
      const output = execSync(`find "${searchRoot}" -name "${safeName}" -type f 2>/dev/null`, {
        encoding: 'utf8',
        timeout: 10_000,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: '/bin/sh',
      });
      if (!output.trim()) {
        return text(`No files found matching "${name}".`);
      }

      const lines = output.trim().split('\n')
        .map((filePath) => filePath.replace(config.dashboardPath + '/', ''))
        .sort();
      return text(`Files matching "${name}" (${lines.length}):\n${lines.map((line) => `  ${line}`).join('\n')}`);
    } catch (error: unknown) {
      return err(`Find failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}
