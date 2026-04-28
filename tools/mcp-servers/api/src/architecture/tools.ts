import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BackendMcpConfig } from '../config.js';
import type { IndexCache } from '../index-cache.js';

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const err  = (m: string) => ({ content: [{ type: 'text' as const, text: m }], isError: true as const });

const ARCHITECTURE_OVERVIEW = `
# Atlas Backend — Clean Architecture Overview

## Dependency Flow (strict: inner layers never import outer)
  Presentation  →  Application (Use Cases)  →  Domain
  Infrastructure →  Application (implements contracts)

## Layer 1: Domain  (app/Core/Domain/)
  Pure PHP — no framework dependencies.
  - Entities/         Pure domain objects with getters/setters (User, Tenant, Role…)
  - ValueObjects/     Immutable typed values with validation (Email)
  - Exceptions/       Domain-level exceptions

## Layer 2: Application  (app/Core/Application/)
  Use Cases, DTOs, and contracts (interfaces).
  - UseCases/{Domain}/{Feature}/
      {Feature}Request.php   — Input DTO (typed constructor params)
      {Feature}Response.php  — Output DTO
      {Feature}UseCase.php   — Single public execute(Request): Response method
  - Contracts/        Repository and service interfaces (UserRepositoryInterface…)
  - DTOs/             Shared data objects (UserFilters, pagination params)
  - Services/         Application-level orchestration services

## Layer 3: Infrastructure  (app/Infrastructure/)
  External systems — database, auth, email, broadcasting.
  - Persistence/Eloquent/
      Models/         Eloquent ORM models (UserModel — separate from domain entities)
      Repositories/   Interface implementations (EloquentUserRepository)
      Observers/      Model event listeners
  - Auth/             Sanctum-based auth service
  - Broadcasting/     WebSocket events (Laravel Reverb)
  - External/Email/   Email services
  - Tenant/           Multi-tenancy context (TenantContext injectable)

## Layer 4: Presentation  (app/Presentation/Http/)
  HTTP API — controllers, validation, serialization.
  - Controllers/Api/V1/   Thin controllers — inject use cases, call execute()
  - Requests/             FormRequest validation (rules(), bodyParameters())
  - Resources/            JSON serialization of domain entities
  - Responses/ApiResponse Helper for consistent JSON envelopes {data, message, meta}
  - Policies/             Laravel authorization policies
  - Middleware/           HTTP middleware

## Naming Conventions
  Use Cases:       {Action}{Entity}UseCase    (CreateUserUseCase)
  Request DTOs:    {Action}{Entity}Request    (CreateUserRequest)
  Response DTOs:   {Action}{Entity}Response   (CreateUserResponse)
  FormRequests:    {Action}{Entity}Request    (CreateUserRequest — same name but in Requests/)
                   Aliased in controllers as Http{Action}{Entity}Request to disambiguate
  Repositories:    Eloquent{Entity}Repository (EloquentUserRepository)
  Eloquent Models: {Entity}Model              (UserModel — avoids naming conflict with domain User)
  Resources:       {Entity}Resource           (UserResource)
  Exceptions:      {Type}Exception            (ValidationException, NotFoundException…)

## Request Flow (POST /api/v1/users example)
  1. nginx → Laravel Router → FormRequest validation (CreateUserRequest)
  2. UserController@store → new CreateUserRequest DTO → CreateUserUseCase->execute()
  3. UseCase → UserRepositoryInterface::findByEmail() + save()
  4. EloquentUserRepository → UserModel (Eloquent) ↔ PostgreSQL
  5. UseCase → UserCreatedNotifierInterface (send welcome email)
  6. UseCase → returns CreateUserResponse DTO
  7. Controller → new UserResource($response) → ApiResponse::created()

## Multi-tenancy
  - TenantContext injectable service carries current tenant ID
  - Repositories auto-scope queries via TenantContext
  - Middleware sets TenantContext from request headers/token

## Key Bindings (Dependency Injection)
  RepositoryServiceProvider:  UserRepositoryInterface → EloquentUserRepository
  UseCaseServiceProvider:     AuthServiceInterface → SanctumAuthService
                               EmailServiceInterface → LogEmailService (dev)
                               UserCreatedNotifierInterface → LaravelUserCreatedNotifier

## Tech Stack
  Laravel 12, Sanctum (auth), Horizon (queues), Reverb (WebSockets),
  PostgreSQL, Redis, MinIO (S3), PHPUnit 11, Laravel Pint (formatting)
`.trim();

export function registerArchitectureTools(
  server: McpServer,
  cache: IndexCache,
  config: BackendMcpConfig,
): void {
  server.registerTool('overview', {
    title: 'Architecture Overview',
    description: 'Return a comprehensive description of the Atlas backend architecture: layers, naming conventions, request flow, DI bindings, and tech stack.',
    inputSchema: {},
  }, async () => {
    const useCasesRoot = path.join(config.backendPath, 'app', 'Core', 'Application', 'UseCases');
    let domainStats = '';
    try {
      const domains = fs.readdirSync(useCasesRoot, { withFileTypes: true })
        .filter((d) => d.isDirectory());
      const domainCounts = domains.map((d) => {
        const features = fs.readdirSync(path.join(useCasesRoot, d.name), { withFileTypes: true })
          .filter((f) => f.isDirectory()).length;
        return `  ${d.name}: ${features} use cases`;
      });
      domainStats = `\n\n## Use Case Domains (live)\n${domainCounts.join('\n')}`;
    } catch {
      // non-fatal
    }

    return text(ARCHITECTURE_OVERVIEW + domainStats);
  });

  server.registerTool('list_use_cases', {
    title: 'List Use Cases',
    description: 'List all use cases grouped by domain. Each use case is a folder containing Request DTO, Response DTO, and UseCase class.',
    inputSchema: {
      domain: z.string().optional().describe('Filter by domain name (e.g. "User", "Auth", "Tenant", "ActivityLog")'),
    },
  }, async ({ domain }) => {
    let entries = cache.useCases;
    if (domain) {
      const q = domain.toLowerCase();
      entries = entries.filter((e) => e.domain.toLowerCase().includes(q));
    }
    if (entries.length === 0) {
      return cache.useCases.length === 0
        ? err('Use case index is empty. Check that ATLAS_BACKEND_PATH is correct.')
        : text(`No use cases found${domain ? ` for domain "${domain}"` : ''}.`);
    }

    // Group by domain
    const grouped = new Map<string, typeof entries>();
    for (const e of entries) {
      if (!grouped.has(e.domain)) grouped.set(e.domain, []);
      grouped.get(e.domain)!.push(e);
    }

    const lines: string[] = [`Use Cases (${entries.length} total):\n`];
    for (const [domainName, features] of grouped) {
      lines.push(`${domainName}/`);
      for (const f of features) {
        const rel = f.dirPath.replace(config.backendPath + '/', '');
        lines.push(`  ${f.feature.padEnd(30)} ${rel}`);
      }
      lines.push('');
    }
    return text(lines.join('\n').trim());
  });

  server.registerTool('get_use_case', {
    title: 'Get Use Case',
    description: 'Read a complete use case by domain and feature name. Returns the Request DTO, Response DTO, and UseCase class assembled together.',
    inputSchema: {
      domain:  z.string().min(1).describe('Domain name (e.g. "User", "Auth", "Tenant")'),
      feature: z.string().min(1).describe('Feature name (e.g. "CreateUser", "ListUsers", "DeleteTenant")'),
    },
  }, async ({ domain, feature }) => {
    const entry = cache.useCases.find(
      (e) =>
        e.domain.toLowerCase() === domain.toLowerCase() &&
        e.feature.toLowerCase() === feature.toLowerCase()
    );
    if (!entry) {
      const available = cache.useCases
        .filter((e) => e.domain.toLowerCase() === domain.toLowerCase())
        .map((e) => e.feature)
        .join(', ');
      return err(
        `Use case "${domain}/${feature}" not found.` +
        (available ? `\nAvailable in ${domain}: ${available}` : '')
      );
    }

    const sections: string[] = [`=== Use Case: ${entry.domain}/${entry.feature} ===\n`];

    let files: string[] = [];
    try {
      files = fs.readdirSync(entry.dirPath).filter((f) => f.endsWith('.php')).sort();
    } catch (e) {
      return err(`Cannot read use case directory: ${e instanceof Error ? e.message : String(e)}`);
    }

    for (const file of files) {
      const filePath = path.join(entry.dirPath, file);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const rel = filePath.replace(config.backendPath + '/', '');
        sections.push(`--- ${file} (${rel}) ---`);
        sections.push(content.trim());
        sections.push('');
      } catch {
        sections.push(`--- ${file} (unreadable) ---\n`);
      }
    }

    return text(sections.join('\n'));
  });
}
