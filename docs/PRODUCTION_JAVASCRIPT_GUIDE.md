# Production-Ready JavaScript & TypeScript: The Complete Guide

> A distilled guide for developers who can write JavaScript but want to write JavaScript at the level of the best teams in the world (Vercel, Stripe, Cloudflare, Meta, Infisical, Cal.com). Covers Node.js, TypeScript, and modern tooling as of 2026.

---

## Table of Contents

1. [Mindset Shift](#1-mindset-shift)
2. [Project Structure](#2-project-structure)
3. [Architecture](#3-architecture)
4. [TypeScript Discipline](#4-typescript-discipline)
5. [Modern JavaScript](#5-modern-javascript)
6. [Error Handling](#6-error-handling)
7. [Configuration](#7-configuration)
8. [Networking & APIs](#8-networking--apis)
9. [Data Access & ORM](#9-data-access--orm)
10. [Concurrency & Performance](#10-concurrency--performance)
11. [Logging & Observability](#11-logging--observability)
12. [Testing](#12-testing)
13. [Build Configuration & Tooling](#13-build-configuration--tooling)
14. [Code Quality & Hygiene](#14-code-quality--hygiene)
15. [Security](#15-security)
16. [Package Management & Supply Chain](#16-package-management--supply-chain)
17. [Common Anti-Patterns](#17-common-anti-patterns)
18. [Projects Studied](#18-projects-studied)

---

## 1. Mindset Shift

Amateur JavaScript _works_. Production JavaScript works **reliably, type-safely, testably, and maintainably at scale**.

| Amateur | Production |
| --- | --- |
| "It works on my machine" | "It passes strict TypeScript, Vitest, and deploys from CI with frozen lockfiles" |
| No TypeScript or `any` everywhere | `strict: true` with `noUncheckedIndexedAccess`, zero `any` |
| `catch (e) { console.log(e) }` | Custom error hierarchies with `cause` chains and structured logging |
| `npm install` into whatever | pnpm with lockfiles, `ignore-scripts=true`, provenance verification |
| Mutable state everywhere | `as const`, `readonly`, `Object.freeze`, immutable by default |
| `console.log` debugging | Pino with JSON output, OpenTelemetry traces, and correlation IDs |
| "I'll add tests later" | Tests are part of the definition of done (Vitest, behavior-focused) |
| `require()` and CommonJS | ESM-only (`"type": "module"`), top-level await, tree-shakeable |
| One giant `app.js` | Clean architecture with domain/application/infrastructure layers |
| `process.env.FOO` scattered everywhere | Centralized Zod-validated config, fail-fast at startup |
| Express 4 with no error handling | Fastify/Hono with schema validation, typed routes, encapsulated errors |

The production JavaScript mindset: **type everything, validate at boundaries, keep domain logic pure, and make impossible states unrepresentable.**

---

## 2. Project Structure

### The Monorepo Standard (Production Apps)

After studying Cal.com, Payload CMS, Documenso, tRPC, Prisma, and Drizzle ORM, the pattern is clear: production apps use monorepos with `apps/` + `packages/`. Turborepo orchestrates the build graph.

```
myproject/
├── apps/
│   ├── web/                   # Next.js or Vite frontend
│   │   ├── src/
│   │   ├── next.config.ts
│   │   └── tsconfig.json
│   ├── api/                   # Fastify/Hono API server
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   ├── middleware/
│   │   │   └── index.ts
│   │   └── tsconfig.json
│   └── docs/                  # Documentation site
├── packages/
│   ├── db/                    # Database schema + client (Drizzle/Prisma)
│   │   ├── src/
│   │   │   ├── schema.ts
│   │   │   ├── migrations/
│   │   │   └── client.ts
│   │   └── package.json
│   ├── config-typescript/     # Shared tsconfig
│   │   └── base.json
│   ├── config-eslint/         # Shared ESLint/Biome config
│   ├── ui/                    # Shared UI components
│   └── lib/                   # Shared utilities
│       ├── src/
│       │   ├── errors.ts      # Error class hierarchy
│       │   ├── validation.ts  # Shared Zod schemas
│       │   └── types.ts       # Shared type definitions
│       └── package.json
├── turbo.json                 # Build pipeline configuration
├── pnpm-workspace.yaml        # Workspace definition
├── package.json               # Root scripts
├── biome.json                 # Linting + formatting
├── .npmrc                     # ignore-scripts=true
├── .gitignore
└── .github/
    └── workflows/
        └── ci.yml
```

### Single-Package Libraries

For libraries (not apps), use a flat `src/` layout. Hono, Fastify, Zod, and BullMQ follow this pattern:

```
mylib/
├── src/
│   ├── index.ts           # Public API with explicit exports
│   ├── core.ts            # Core implementation
│   ├── errors.ts          # Error hierarchy
│   ├── types.ts           # Type definitions
│   └── utils.ts           # Internal utilities
├── test/
│   ├── core.test.ts
│   └── integration.test.ts
├── package.json
├── tsconfig.json
├── tsconfig.build.json    # Stricter config for production builds
└── vitest.config.ts
```

### Key Rules

1. **Monorepo for apps, flat `src/` for libraries.** Cal.com, Documenso, and Payload all use Turborepo monorepos. Hono, Zod, and Fastify use flat `src/`.

2. **Domain layer has zero external dependencies.** No framework imports, no database imports, no HTTP imports. Pure TypeScript.

3. **Dependencies point inward.** `routes → services → domain`. Never the reverse. Infrastructure implements domain interfaces.

4. **No barrel files.** Import directly from the module that defines what you need. Barrel files (`index.ts` re-exports) break tree-shaking and cause circular dependencies. Next.js explicitly warns against them.

5. **Multiple `tsconfig` files.** Base config for IDE, build config for production (stricter), spec config for tests. Hono, tRPC, and Payload all follow this pattern.

6. **Max 3-4 levels of nesting.** `src/services/user/user-service.ts` is fine. `src/features/users/services/impl/v2/user-service.ts` is not.

### Turbo Pipeline Configuration (Cal.com Pattern)

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {},
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

---

## 3. Architecture

### The Production Consensus: Clean Architecture + Factory DI

After studying Infisical, Cal.com, Fastify, Payload CMS, and Twenty CRM, the pattern is clear: **layered architecture with interface-based boundaries and factory/constructor injection.**

```
┌─────────────────────────────────────┐
│  Presentation Layer (Routes/API)    │  Fastify routes, tRPC procedures
├─────────────────────────────────────┤
│  Application Layer (Services)       │  Orchestrates domain operations
├─────────────────────────────────────┤
│  Domain Layer (Types, Logic)        │  Pure TypeScript, zero dependencies
├─────────────────────────────────────┤
│  Infrastructure Layer (Adapters)    │  Database, external APIs, queues
└─────────────────────────────────────┘
```

### The Dependency Rule

Dependencies point **inward** only. Domain knows nothing about infrastructure or presentation. Infrastructure implements domain interfaces.

```typescript
// domain/ports.ts — interfaces, no implementation details
export interface OrderRepository {
  getById(orderId: string): Promise<Order | null>;
  save(order: Order): Promise<Order>;
  listActive(): Promise<Order[]>;
}

export interface PaymentProcessor {
  charge(amount: number, currency: string, token: string): Promise<ChargeResult>;
}

// infrastructure/postgres-order-repo.ts — concrete, knows about DB
import { eq } from "drizzle-orm";
import type { OrderRepository } from "../domain/ports.js";

export class PostgresOrderRepository implements OrderRepository {
  constructor(private readonly db: DrizzleClient) {}

  async getById(orderId: string): Promise<Order | null> {
    const row = await this.db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });
    return row ? toDomain(row) : null;
  }

  async save(order: Order): Promise<Order> {
    const [row] = await this.db
      .insert(orders)
      .values(toRow(order))
      .onConflictDoUpdate({ target: orders.id, set: toRow(order) })
      .returning();
    return toDomain(row);
  }
}
```

### Factory-Based DI (Infisical Pattern)

Infisical demonstrates DI using pure factory functions — no decorators, no IoC containers:

```typescript
// services/secret/secret-service.ts
interface SecretServiceDeps {
  secretDAL: SecretDAL;
  permissionService: PermissionService;
  auditLogService: AuditLogService;
}

export const secretServiceFactory = ({
  secretDAL,
  permissionService,
  auditLogService,
}: SecretServiceDeps) => {
  const createSecret = async (input: CreateSecretInput): Promise<Secret> => {
    await permissionService.checkAccess(input.userId, "secrets", "write");
    const secret = await secretDAL.create(input);
    await auditLogService.log({ action: "secret.create", secretId: secret.id });
    return secret;
  };

  const getSecret = async (id: string, userId: string): Promise<Secret> => {
    await permissionService.checkAccess(userId, "secrets", "read");
    return secretDAL.getById(id);
  };

  return { createSecret, getSecret };
};

// composition-root.ts — wire everything together at startup
const db = createDatabaseClient(config.DATABASE_URL);
const secretDAL = createSecretDAL(db);
const permissionService = permissionServiceFactory({ permissionDAL: createPermissionDAL(db) });
const auditLogService = auditLogServiceFactory({ auditDAL: createAuditDAL(db) });
const secretService = secretServiceFactory({ secretDAL, permissionService, auditLogService });
```

### The DAL (Data Access Layer) Pattern (Infisical, Twenty CRM)

Separate database queries from business logic:

```
services/
  secret/
    secret-dal.ts        # Database queries only
    secret-service.ts    # Business logic, calls DAL
    secret-types.ts      # TypeScript types
    secret-router.ts     # API routes
```

### Component Sizing Guidelines

- **Functions < 20 lines:** Ideal
- **Functions 20-50 lines:** Acceptable for complex logic
- **Functions 50+ lines:** Almost certainly needs decomposition
- **Modules < 300 lines:** Ideal
- **Modules 300-500 lines:** Acceptable for services
- **Modules 500+ lines:** Split into a subpackage

---

## 4. TypeScript Discipline

### Non-Negotiable: Strict Mode + Extra Flags

Every production TypeScript project uses `strict: true`. The best projects go further:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "skipLibCheck": true
  }
}
```

Why each flag matters:

- **`noUncheckedIndexedAccess`**: Without it, `arr[0]` is typed as `T` instead of `T | undefined`. This hides runtime errors when arrays are empty or objects don't have a key. Cal.com, Zod, and tRPC all enable this.
- **`exactOptionalPropertyTypes`**: Distinguishes between `{ x?: number }` (missing) and `{ x: number | undefined }` (present but undefined). Prevents bugs in partial updates.
- **`verbatimModuleSyntax`**: Forces explicit `import type` for type-only imports. Prevents runtime import of type-only modules (which causes crashes).

### No `any`. Ever.

`any` silences the type checker — production code doesn't need it. Use `unknown`, generics, or unions instead.

```typescript
// Bad — type checker gives up
function process(data: any): any {
  return data.key;
}

// Good — explicit types
function process(data: Record<string, string>): string {
  return data["key"]!;
}

// Good — when type is truly unknown, validate it
function processUnknown(data: unknown): string {
  const parsed = z.object({ key: z.string() }).parse(data);
  return parsed.key;
}

// Good — generics for reusable functions
function first<T>(items: readonly T[]): T | undefined {
  return items[0];
}
```

### Use `satisfies` for Configuration Objects

Use `satisfies` instead of type annotations when you want to validate that an object conforms to a type while preserving its literal/narrow type:

```typescript
// Bad — widens the type
const config: Config = { port: 3000, host: "localhost" };
// config.port is `number`, config.host is `string`

// Good — validates AND preserves literals
const config = { port: 3000, host: "localhost" } satisfies Config;
// config.port is `3000`, config.host is `"localhost"`
```

### Branded Types for Domain Identifiers

Prevent mixing up values of the same underlying type:

```typescript
type UserId = string & { readonly __brand: unique symbol };
type OrderId = string & { readonly __brand: unique symbol };

function createUserId(id: string): UserId {
  return id as UserId;
}

function getUser(id: UserId): Promise<User> { /* ... */ }

const userId = createUserId("usr_123");
const orderId = createOrderId("ord_456");
getUser(orderId); // Compile error! OrderId is not assignable to UserId
```

### Types Over Interfaces, Functions Over Classes

Both Infisical and Payload CMS explicitly document this preference:

```typescript
// Preferred — types are more flexible (unions, intersections, mapped types)
type UserCreateInput = {
  email: string;
  name: string;
  role: "admin" | "user";
};

// Preferred — functions with single object parameters
export function createUser({ email, name, role }: UserCreateInput): Promise<User> {
  // ...
}

// NOT: class UserService with createUser(email, name, role)
// Classes are fine for stateful collaborators, but pure functions are simpler
// for business logic and better for tree-shaking.
```

### Module Resolution

```json
// Node.js apps — enforces runtime-correct resolution
{ "moduleResolution": "NodeNext", "module": "NodeNext" }

// Bundled apps (Vite/Next.js) — allows extension-less imports
{ "moduleResolution": "bundler", "module": "ESNext" }

// Libraries — MUST use NodeNext to prevent bundler-only code
{ "moduleResolution": "NodeNext", "module": "NodeNext" }
```

**Why `bundler` is dangerous for libraries:** It allows module specifiers that only work when a bundler processes them. Consumers running in Node.js directly will get import failures.

### Discriminated Unions for State

Make impossible states unrepresentable:

```typescript
// Bad — can be loading AND have an error simultaneously
type PageState = {
  isLoading: boolean;
  data: Item[] | null;
  error: string | null;
};

// Good — exactly one state at a time
type PageState =
  | { status: "loading" }
  | { status: "success"; data: Item[] }
  | { status: "empty" }
  | { status: "error"; error: AppError };

function render(state: PageState) {
  switch (state.status) {
    case "loading":
      return <Spinner />;
    case "success":
      return <ItemList items={state.data} />;
    case "empty":
      return <EmptyState />;
    case "error":
      return <ErrorMessage error={state.error} />;
    // TypeScript enforces exhaustiveness — no default needed
  }
}
```

---

## 5. Modern JavaScript

### ESM Only (No More CommonJS)

2025-2026 marks the tipping point. New projects should be ESM-only:

```json
// package.json
{
  "type": "module"
}
```

**Why CJS is worse:** CJS cannot be statically analyzed (you must execute the code to know exports), does not support tree-shaking, and loads synchronously which blocks the event loop.

**Migration path for legacy:** Use dynamic `import()` to incrementally adopt ESM:

```typescript
// In a CJS file, import ESM module dynamically
const { createServer } = await import("./server.mjs");
```

### Top-Level Await

Production-ready in ESM modules. No more async IIFE wrappers:

```typescript
// config.ts — validated config available at module level
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(3000),
});

export const config = EnvSchema.parse(process.env);

// db.ts — database client ready at import time
import { config } from "./config.js";
import { drizzle } from "drizzle-orm/node-postgres";

export const db = drizzle(config.DATABASE_URL);
```

**Gotcha:** A module using top-level await blocks loading of any module that imports it. Don't put long-running operations at module level.

### `structuredClone` for Deep Copies

Replace `JSON.parse(JSON.stringify())` and lodash `cloneDeep`:

```typescript
const original = { date: new Date(), set: new Set([1, 2, 3]), nested: { a: 1 } };

// Bad — drops Date, Set, undefined, functions
const broken = JSON.parse(JSON.stringify(original));

// Good — handles Date, Set, Map, RegExp, ArrayBuffer, circular refs
const cloned = structuredClone(original);
```

### Explicit Resource Management (`using`)

TypeScript 5.2+ supports `Symbol.dispose` for deterministic cleanup:

```typescript
function openDatabaseConnection(): Disposable & Connection {
  const conn = createConnection();
  return Object.assign(conn, {
    [Symbol.dispose]() {
      conn.close();
    },
  });
}

// Connection is automatically closed at block exit
{
  using conn = openDatabaseConnection();
  await conn.query("SELECT * FROM users");
} // conn[Symbol.dispose]() called automatically

// Async version for async cleanup
{
  await using tx = await db.transaction();
  await tx.insert(users).values({ name: "Alice" });
  await tx.commit();
} // tx[Symbol.asyncDispose]() called — rolls back if commit wasn't called
```

### AbortController for Cancellation

Use `AbortController` for cancellation across all async operations:

```typescript
async function handleRequest(req: Request): Promise<Response> {
  const controller = new AbortController();
  const { signal } = controller;

  // Cancel everything if client disconnects
  req.signal.addEventListener("abort", () => controller.abort());

  // Timeout after 30 seconds
  const timeout = setTimeout(() => controller.abort(new Error("Timeout")), 30_000);

  try {
    // Pass signal to every async operation
    const userData = await fetch("https://api.example.com/user", { signal });
    const orders = await db.query.orders.findMany({ signal });
    return new Response(JSON.stringify({ userData, orders }));
  } finally {
    clearTimeout(timeout);
  }
}
```

**Key pattern:** One `AbortSignal` flows through the entire request lifecycle — from HTTP handler through fetch calls, streams, and worker tasks. When the client disconnects, everything stops.

---

## 6. Error Handling

### Error Cause Chains (Always)

Always use the `cause` option when re-throwing errors. Available since Node.js 16.9.0:

```typescript
try {
  await db.query(sql);
} catch (err) {
  throw new DatabaseError("Failed to execute query", { cause: err });
}
// console.log and util.inspect recursively print the full cause chain
```

### Custom Error Class Hierarchy

Create domain-specific error classes with structured properties:

```typescript
// packages/lib/src/errors.ts
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = this.constructor.name;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
    };
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string, options?: ErrorOptions) {
    super(`${resource} '${id}' not found`, "NOT_FOUND", 404, options);
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly fieldErrors: Record<string, string[]>,
    options?: ErrorOptions,
  ) {
    super(message, "VALIDATION_ERROR", 400, options);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "CONFLICT", 409, options);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required", options?: ErrorOptions) {
    super(message, "UNAUTHORIZED", 401, options);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Insufficient permissions", options?: ErrorOptions) {
    super(message, "FORBIDDEN", 403, options);
  }
}
```

**Key rule:** Always set `this.name = this.constructor.name`. Without it, stack traces show "Error" instead of the actual class name.

### Fastify Error Handler Pattern

Fastify's error handlers are scoped to plugin contexts:

```typescript
import Fastify from "fastify";
import { AppError, NotFoundError } from "@myapp/lib/errors.js";

const app = Fastify({ logger: true });

app.setErrorHandler((error, request, reply) => {
  if (error instanceof AppError) {
    request.log.warn({ err: error, code: error.code }, error.message);
    return reply.status(error.statusCode).send(error.toJSON());
  }

  // Zod validation errors from schema validation
  if (error.validation) {
    return reply.status(400).send({
      code: "VALIDATION_ERROR",
      message: "Invalid request",
      errors: error.validation,
    });
  }

  // Unexpected errors — log full stack, return generic message
  request.log.error({ err: error }, "Unhandled error");
  return reply.status(500).send({
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred",
  });
});
```

### tRPC Error Formatting (Cal.com, Documenso)

```typescript
import { initTRPC, TRPCError } from "@trpc/server";
import { ZodError } from "zod";

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

// In procedures
const userRouter = t.router({
  getById: t.procedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const user = await ctx.userService.getById(input.id);
      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `User ${input.id} not found`,
        });
      }
      return user;
    }),
});
```

### Result Pattern for Expected Failures

Use `neverthrow` for typed Result patterns:

```typescript
import { ok, err, Result } from "neverthrow";

type ValidationError = { field: string; message: string };

function parseAge(input: string): Result<number, ValidationError> {
  const age = parseInt(input, 10);
  if (isNaN(age)) return err({ field: "age", message: "Must be a number" });
  if (age < 0 || age > 150) return err({ field: "age", message: "Out of range" });
  return ok(age);
}

// Caller is FORCED to handle the error — it's in the type signature
const result = parseAge("abc");
result.match({
  ok: (age) => console.log(`Valid age: ${age}`),
  err: (e) => console.error(`${e.field}: ${e.message}`),
});
```

**When to use:** Expected failure modes — validation, not-found, permission denied.
**When NOT to use:** Truly exceptional situations (OOM, assertion failures) should still throw.

---

## 7. Configuration

### Zod-Validated Config, Centralized Access

The production pattern: validate at startup, crash immediately on misconfiguration, centralize all access through a single module:

```typescript
// packages/lib/src/config.ts
import { z } from "zod";

const booleanString = z
  .enum(["true", "false", "1", "0"])
  .transform((val) => val === "true" || val === "1");

const EnvSchema = z.object({
  // Server
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default("0.0.0.0"),

  // Database
  DATABASE_URL: z.string().url(),

  // Authentication
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRY: z.string().default("15m"),

  // External services
  STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
  REDIS_URL: z.string().url().optional(),

  // Feature flags
  FEATURE_NEW_CHECKOUT: booleanString.default("false"),

  // Observability
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
});

// Validate at startup — fail fast
const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("=== INVALID CONFIGURATION ===");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  console.error("=============================");
  process.exit(1);
}

export const config = Object.freeze(parsed.data);

export type Config = typeof config;
```

### T3-Style Env Validation (Next.js Apps)

For Next.js apps, use `@t3-oss/env-nextjs` (Cal.com, Documenso pattern):

```typescript
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    NEXTAUTH_SECRET: z.string().min(1),
    REDIS_URL: z.string().url().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    REDIS_URL: process.env.REDIS_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
});
```

This crashes at **build time** if required env vars are missing, preventing broken deployments.

### Key Rules

1. **Never access `process.env` directly** throughout the codebase. Import from the config module.
2. **Validate at startup.** Crash immediately, not on the first request that uses the variable.
3. **Type coercion.** `process.env` values are always strings. Use `z.coerce.number()`.
4. **Boolean strings.** `process.env.FLAG === true` is always `false`. The string `"false"` is truthy.
5. **Secrets in secret managers.** `.env` files are for local development only. Use AWS Secrets Manager, HashiCorp Vault, or Infisical for production.
6. **`.env.example` committed.** Documents required vars with dummy values. Never commit `.env`.
7. **Node.js 20.6+ has native `.env` support.** Use `node --env-file=.env` instead of dotenv.

---

## 8. Networking & APIs

### Fastify: The Production HTTP Framework

Fastify achieves ~77k req/sec (vs Express's ~14k) through schema-based serialization and a plugin encapsulation model:

```typescript
import Fastify from "fastify";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";

const app = Fastify({
  logger: {
    level: config.LOG_LEVEL,
    serializers: {
      req(request) {
        return {
          method: request.method,
          url: request.url,
          remoteAddress: request.ip,
        };
      },
    },
    redact: ["req.headers.authorization", "req.headers.cookie"],
  },
}).withTypeProvider<TypeBoxTypeProvider>();

// Schema-validated, fully-typed route
app.post(
  "/users",
  {
    schema: {
      body: Type.Object({
        email: Type.String({ format: "email" }),
        name: Type.String({ minLength: 1, maxLength: 100 }),
      }),
      response: {
        201: Type.Object({
          id: Type.String(),
          email: Type.String(),
          name: Type.String(),
        }),
      },
    },
  },
  async (request, reply) => {
    // request.body is fully typed as { email: string; name: string }
    const user = await userService.create(request.body);
    return reply.status(201).send(user);
  },
);

// Plugin encapsulation — scoped middleware, error handlers, decorators
app.register(
  async function authRoutes(instance) {
    instance.addHook("onRequest", verifyJWT);

    instance.get("/me", async (request) => {
      return request.user; // Decorated by verifyJWT hook
    });
  },
  { prefix: "/api" },
);
```

### Hono: Multi-Runtime Alternative

Hono runs on Cloudflare Workers, Deno, Bun, AWS Lambda, and Node.js with the same code:

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const app = new Hono();

app.post(
  "/users",
  zValidator(
    "json",
    z.object({
      email: z.string().email(),
      name: z.string().min(1).max(100),
    }),
  ),
  async (c) => {
    const body = c.req.valid("json"); // Fully typed
    const user = await userService.create(body);
    return c.json(user, 201);
  },
);
```

### Native `fetch` for HTTP Clients

Node.js 18+ has stable built-in `fetch`. Replace `node-fetch` and `axios`:

```typescript
async function fetchWithRetry(
  url: string,
  options: RequestInit & { retries?: number } = {},
): Promise<Response> {
  const { retries = 3, ...fetchOptions } = options;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, fetchOptions);
      if (response.ok || response.status < 500) return response;
      if (attempt === retries) return response;
    } catch (error) {
      if (attempt === retries) throw error;
    }

    // Exponential backoff: 200ms, 400ms, 800ms
    await new Promise((r) => setTimeout(r, 200 * 2 ** attempt));
  }

  throw new Error("Unreachable");
}
```

### Rate Limiting

```typescript
// Fastify
import rateLimit from "@fastify/rate-limit";

app.register(rateLimit, {
  max: 100,         // 100 requests
  timeWindow: "1m", // per minute
});

// Auth routes — stricter
app.register(async function authRoutes(instance) {
  instance.register(rateLimit, {
    max: 5,
    timeWindow: "15m",
    keyGenerator: (request) => request.ip,
  });
});
```

---

## 9. Data Access & ORM

### Drizzle ORM: The Type-Safe Choice

Drizzle is 7.4kb minified+gzipped with 0 dependencies. It generates SQL you can read and predict:

```typescript
// packages/db/src/schema.ts
import { pgTable, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role", { enum: ["admin", "user"] }).notNull().default("user"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orders = pgTable("orders", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id),
  total: integer("total").notNull(), // cents
  status: text("status", { enum: ["pending", "paid", "shipped", "cancelled"] }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

```typescript
// packages/db/src/client.ts
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

export const db = drizzle(config.DATABASE_URL, { schema });
export type Database = typeof db;
```

```typescript
// services/user-service.ts — queries with full type safety
import { eq, and, desc, sql } from "drizzle-orm";
import { users, orders } from "@myapp/db/schema.js";

async function getUserWithOrders(userId: string) {
  return db.query.users.findFirst({
    where: eq(users.id, userId),
    with: {
      orders: {
        orderBy: [desc(orders.createdAt)],
        limit: 10,
      },
    },
  });
}

// Select only needed fields — reduce payload size
async function listUserEmails() {
  return db.select({ id: users.id, email: users.email }).from(users);
}

// Transactions
async function createOrderWithPayment(input: CreateOrderInput) {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({ userId: input.userId, total: input.total, status: "pending" })
      .returning();

    await tx
      .update(users)
      .set({ lastOrderAt: sql`now()` })
      .where(eq(users.id, input.userId));

    return order;
  });
}
```

### Prisma Alternative

If you need a more mature migration system or visual GUI:

```typescript
// Use select to avoid over-fetching (Prisma query optimization)
const users = await prisma.user.findMany({
  select: {
    id: true,
    name: true,
    posts: {
      select: { title: true },
      take: 5,
    },
  },
});

// Type for query results with specific fields
type UserWithPosts = Prisma.UserGetPayload<{
  select: { id: true; name: true; posts: { select: { title: true } } };
}>;
```

### Avoiding N+1 Queries

```typescript
// BAD — N+1: one query per order
for (const order of orders) {
  const user = await db.query.users.findFirst({ where: eq(users.id, order.userId) });
}

// GOOD — batch with IN clause
const userIds = orders.map((o) => o.userId);
const relatedUsers = await db
  .select()
  .from(users)
  .where(sql`${users.id} IN (${sql.join(userIds.map(sql.literal), sql`, `)})`);

// GOOD — use Drizzle relations (generates efficient JOINs)
const ordersWithUsers = await db.query.orders.findMany({
  with: { user: true },
});

// GOOD — DataLoader for GraphQL resolvers
import DataLoader from "dataloader";

const userLoader = new DataLoader(async (ids: readonly string[]) => {
  const rows = await db.select().from(users).where(sql`${users.id} = ANY(${ids})`);
  const map = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => map.get(id) ?? null);
});
```

---

## 10. Concurrency & Performance

### Event Loop: Never Block It

Node.js runs JavaScript on a single thread. Synchronous I/O blocks ALL concurrent requests:

```typescript
// BAD — blocks event loop for all users during file read
app.get("/config", (req, res) => {
  const data = fs.readFileSync("config.json", "utf-8"); // 💀
  res.json(JSON.parse(data));
});

// GOOD — read once at startup, serve from memory
let cachedConfig: AppConfig;

async function initConfig() {
  const raw = await fs.promises.readFile("config.json", "utf-8");
  cachedConfig = JSON.parse(raw);
}

app.get("/config", (req, res) => {
  res.json(cachedConfig); // Zero I/O per request
});
```

### Worker Threads for CPU-Intensive Tasks

Use `piscina` (worker pool) for CPU-heavy work:

```typescript
import Piscina from "piscina";

const pool = new Piscina({
  filename: new URL("./workers/image-processor.js", import.meta.url).href,
  maxThreads: 4,
});

// Route handler — non-blocking
app.post("/images/resize", async (request, reply) => {
  const result = await pool.run({
    buffer: request.body,
    width: 800,
    height: 600,
  });
  return reply.type("image/webp").send(result);
});
```

```typescript
// workers/image-processor.ts
import sharp from "sharp";

export default async function resize({ buffer, width, height }: ResizeInput) {
  return sharp(buffer).resize(width, height).webp({ quality: 80 }).toBuffer();
}
```

### Streaming for Large Data

Never load entire files or responses into memory:

```typescript
import { pipeline } from "node:stream/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { createGzip } from "node:zlib";

// Stream a large file through gzip compression
await pipeline(
  createReadStream("input.csv"),
  createGzip(),
  createWriteStream("output.csv.gz"),
);

// Stream a database export to HTTP response
app.get("/export", async (request, reply) => {
  const cursor = db.select().from(users).$cursor();

  reply.header("Content-Type", "application/x-ndjson");
  reply.raw.writeHead(200);

  for await (const row of cursor) {
    reply.raw.write(JSON.stringify(row) + "\n");
  }

  reply.raw.end();
});
```

### BullMQ for Job Processing

```typescript
import { Queue, Worker } from "bullmq";

const emailQueue = new Queue("emails", { connection: redisConnection });

// Producer — enqueue jobs
await emailQueue.add("welcome", { userId: "usr_123", template: "welcome" }, {
  attempts: 3,
  backoff: { type: "exponential", delay: 1000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
});

// Consumer — process jobs
const worker = new Worker(
  "emails",
  async (job) => {
    const { userId, template } = job.data;
    const user = await userService.getById(userId);
    await emailService.send(user.email, template);
  },
  {
    concurrency: 10,
    connection: redisConnection,
    limiter: { max: 100, duration: 1000 }, // Max 100 emails/sec
  },
);

worker.on("failed", (job, err) => {
  logger.error({ err, jobId: job?.id, queue: "emails" }, "Job failed");
});
```

---

## 11. Logging & Observability

### Pino: The Production Logger

Pino is 5-10x faster than Winston. Fastify uses it as the built-in logger:

```typescript
import pino from "pino";

export const logger = pino({
  level: config.LOG_LEVEL,
  formatters: {
    level: (label) => ({ level: label }),
  },
  // Redact sensitive fields
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.token"],
    censor: "[REDACTED]",
  },
  // Pretty-print only in development
  ...(config.NODE_ENV === "development" && {
    transport: { target: "pino-pretty" },
  }),
});

// Child loggers for request context — zero overhead until logged
function createRequestLogger(requestId: string, traceId?: string) {
  return logger.child({ requestId, traceId });
}

// Usage in services
function createUserService(deps: UserServiceDeps) {
  return {
    async createUser(input: CreateUserInput, reqLogger: pino.Logger) {
      reqLogger.info({ email: input.email }, "Creating user");

      const user = await deps.userDAL.create(input);

      reqLogger.info({ userId: user.id }, "User created");
      return user;
    },
  };
}
```

### Payload CMS Logging Convention

From Payload's CLAUDE.md — the correct way to log:

```typescript
// CORRECT: msg as object property, err for error objects
logger.error({ msg: "Failed to process", err: error });

// INCORRECT: Do NOT pass errors as second argument
logger.error("Failed to process", error); // Wrong — error becomes the bindings object
```

### OpenTelemetry for Distributed Tracing

```typescript
// instrumentation.ts — MUST be imported before any other code
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: "my-api",
  }),
  traceExporter: new OTLPTraceExporter({
    url: config.OTEL_EXPORTER_OTLP_ENDPOINT,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-pino": { enabled: true },
      "@opentelemetry/instrumentation-http": { enabled: true },
      "@opentelemetry/instrumentation-pg": { enabled: true },
    }),
  ],
});

sdk.start();

process.on("SIGTERM", () => sdk.shutdown());
```

### Key Practices

1. **JSON-structured logs everywhere.** Never plain text in production.
2. **Correlation IDs.** Same `traceId` in OTEL spans and Pino logs — jump from slow trace to exact log lines.
3. **Pino-pretty only in development.** JSON in production for log aggregators.
4. **Log redaction.** Redact Authorization headers, passwords, tokens.
5. **10% sampling in production, 100% in dev, 100% for errors.** Use `TraceIdRatioBased` sampler.

---

## 12. Testing

### Vitest: The Default

Vitest has overtaken Jest as the dominant testing framework in TypeScript projects. 8 of 16 repos studied use it (Payload CMS, Cal.com, Zod, tRPC, Prisma, Hono, Drizzle, BullMQ).

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      exclude: ["**/node_modules/**", "**/test/**"],
    },
    // For monorepos — run all packages from root
    projects: ["packages/*"],
  },
});
```

### Test Behavior, Not Implementation

The React Testing Library and Kent C. Dodds' principles apply to backend code too:

```typescript
// BAD — testing internal method calls
test("should process checkout", async () => {
  const service = new CheckoutService();
  const validateSpy = vi.spyOn(service, "_validateCart");
  await service.checkout(mockCart, mockPayment);
  expect(validateSpy).toHaveBeenCalledBefore(calcTaxSpy); // Breaks on refactor
});

// GOOD — testing observable behavior
test("should return order confirmation when checkout succeeds", async () => {
  const fakePaymentGateway = {
    charge: vi.fn().mockResolvedValue({ transactionId: "txn_123", status: "succeeded" }),
  };
  const service = new CheckoutService(fakePaymentGateway, fakeEmailSender);

  const result = await service.checkout(cart, payment);

  // Assert on OUTPUT — what the caller actually cares about
  expect(result).toMatchObject({
    orderId: expect.any(String),
    status: "confirmed",
  });
  // Assert on SIDE EFFECTS via collaborator boundaries
  expect(fakePaymentGateway.charge).toHaveBeenCalledWith(
    expect.objectContaining({ amount: expect.any(Number) }),
  );
});
```

### Arrange-Act-Assert Structure

```typescript
describe("UserService", () => {
  let userService: UserService;
  let fakeUserDAL: FakeUserDAL;

  beforeEach(() => {
    fakeUserDAL = createFakeUserDAL();
    userService = createUserService({ userDAL: fakeUserDAL });
  });

  test("should throw NotFoundError when user does not exist", async () => {
    // Arrange
    fakeUserDAL.setUsers([]);

    // Act & Assert
    await expect(userService.getById("nonexistent")).rejects.toThrow(NotFoundError);
  });

  test("should create user with hashed password", async () => {
    // Arrange
    const input = { email: "alice@example.com", name: "Alice", password: "secure123" };

    // Act
    const user = await userService.create(input);

    // Assert
    expect(user.email).toBe("alice@example.com");
    expect(user.passwordHash).not.toBe("secure123");
    expect(user.passwordHash).toMatch(/^\$2[aby]?\$/); // bcrypt format
  });
});
```

### Integration Tests for API Routes

```typescript
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app.js";

describe("POST /api/users", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ testing: true });
  });

  afterAll(async () => {
    await app.close();
  });

  test("should create a user and return 201", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/users",
      payload: { email: "test@example.com", name: "Test User" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: expect.any(String),
      email: "test@example.com",
    });
  });

  test("should return 400 for invalid email", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/users",
      payload: { email: "not-an-email", name: "Test" },
    });

    expect(response.statusCode).toBe(400);
  });
});
```

### Testing Cleanup (Payload CMS Pattern)

```typescript
describe("Posts collection", () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    await Promise.all(
      createdIds.map((id) => payload.delete({ collection: "posts", id })),
    );
    createdIds.length = 0;
  });

  test("should create a post", async () => {
    const post = await payload.create({ collection: "posts", data: { title: "Test" } });
    createdIds.push(post.id);
    expect(post.title).toBe("Test");
  });
});
```

---

## 13. Build Configuration & Tooling

### Build Tool Decision Matrix

| Tool | Best For | Used By |
|------|----------|---------|
| **Turbo** | Monorepo task orchestration | Cal.com, Payload, Documenso, tRPC, Prisma |
| **Vite 8** | Frontend apps | Next.js ecosystem, Hono dev |
| **tsup** | TypeScript library publishing | tRPC, various smaller libs |
| **tsc** (direct) | Type checking, simple compilation | Zod (via zshy), Hono, BullMQ |
| **esbuild** | Fast bundling, build scripts | Next.js (internal), Vitest |
| **Bun bundler** | Backend/server bundles, CLI tools | Bun ecosystem |

### TypeScript Build Configuration

```json
// tsconfig.json — base config for IDE
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "test"]
}
```

```json
// tsconfig.build.json — stricter for production
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "sourceMap": false,
    "declaration": true,
    "declarationMap": false
  },
  "exclude": ["node_modules", "dist", "test", "**/*.test.ts", "**/*.spec.ts"]
}
```

### tsup for Library Publishing

```typescript
// tsup.config.ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],          // ESM-only for new libraries
  dts: true,                // Generate .d.ts files
  clean: true,
  splitting: false,
  sourcemap: true,
  target: "node20",
  outDir: "dist",
});
```

### Package.json Exports

```json
{
  "name": "@myapp/lib",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./errors": {
      "import": "./dist/errors.js",
      "types": "./dist/errors.d.ts"
    }
  },
  "files": ["dist"]
}
```

---

## 14. Code Quality & Hygiene

### Biome: The Modern Choice

Cal.com and Zod have migrated from ESLint+Prettier to Biome. It's 10-25x faster (Rust-based):

```json
// biome.json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "organizeImports": { "enabled": true },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedImports": "error",
        "noUnusedVariables": "error",
        "useExhaustiveDependencies": "warn"
      },
      "suspicious": {
        "noExplicitAny": "error",
        "noConsoleLog": "warn"
      },
      "style": {
        "noNonNullAssertion": "warn",
        "useConst": "error"
      }
    }
  }
}
```

### ESLint Alternative (If Biome Doesn't Cover Your Needs)

```javascript
// eslint.config.js (flat config — the new standard)
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-throw-literal": "error",
    },
  },
);
```

### Git Hooks (Husky + lint-staged)

Nearly all production repos use Husky:

```json
// package.json
{
  "scripts": {
    "prepare": "husky"
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["biome check --write"],
    "*.{json,md}": ["biome format --write"]
  }
}
```

```bash
# .husky/pre-commit
npx lint-staged
```

### Conventional Commits (Payload, NestJS)

```
<type>(scope): lowercase title

Types: feat, fix, chore, docs, ci, perf, refactor, test
Scopes: match package names (db, api, web, lib)
```

### Circular Dependency Detection

Add to CI to catch barrel file and circular import issues:

```bash
npx madge --circular --extensions ts src/
npx dpdm --circular src/index.ts
```

---

## 15. Security

### Input Validation at Every Trust Boundary

Use Zod at API boundaries:

```typescript
import { z } from "zod";

const CreateUserSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(100).trim(),
  age: z.number().int().min(0).max(150).optional(),
});

type CreateUserInput = z.infer<typeof CreateUserSchema>;

// Fastify with TypeBox (10x faster validation via Ajv)
// Zod for everything else
```

### HTTP Security Headers

```typescript
import helmet from "@fastify/helmet";

app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  // HSTS — force HTTPS
  strictTransportSecurity: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});
```

### Prototype Pollution Defense

Multi-layered defense:

```typescript
// 1. Freeze Object.prototype at startup (breaks badly-written libs — test first)
// Object.freeze(Object.prototype);

// 2. Use Object.create(null) for lookup objects
const allowedRoles = Object.create(null) as Record<string, boolean>;
allowedRoles["admin"] = true;
allowedRoles["user"] = true;

// 3. Use Map instead of plain objects for user-supplied key-value data
const userPreferences = new Map<string, string>();

// 4. Node.js flag to remove __proto__
// node --disable-proto=delete index.js

// 5. Schema validation (Zod) rejects unexpected keys by default
const SettingsSchema = z.object({
  theme: z.enum(["light", "dark"]),
  language: z.string().max(5),
}).strict(); // Rejects any extra keys including __proto__
```

### SSRF Prevention

```typescript
import { isPrivateIP } from "./security-utils.js";

async function safeFetch(url: string, signal?: AbortSignal): Promise<Response> {
  const parsed = new URL(url);

  // Resolve hostname and check against private IP ranges
  const { address } = await dns.promises.lookup(parsed.hostname);
  if (isPrivateIP(address)) {
    throw new ForbiddenError("Cannot access private IP addresses");
  }

  return fetch(url, {
    signal,
    redirect: "error", // Disable redirects — or re-validate after each
  });
}

function isPrivateIP(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 169 && parts[1] === 254) // AWS IMDS
  );
}
```

### SQL Injection Prevention

Always use parameterized queries:

```typescript
// BAD — SQL injection
const users = await db.execute(sql`SELECT * FROM users WHERE name = '${name}'`);

// GOOD — parameterized (Drizzle does this automatically)
const users = await db.select().from(usersTable).where(eq(usersTable.name, name));

// GOOD — explicit parameterized query
const users = await db.execute(sql`SELECT * FROM users WHERE name = ${name}`);
// Drizzle's sql`` template tag auto-parameterizes interpolated values
```

### Middleware Is NOT a Security Boundary

After CVE-2025-29927 (Next.js middleware bypass, CVSS 9.1): auth checks must live in Route Handlers, Server Actions, and the Data Access Layer — not just middleware. Middleware is for routing and response shaping, not defense.

---

## 16. Package Management & Supply Chain

### pnpm for Production

pnpm dominates in production TypeScript monorepos (Zod, Prisma, tRPC, Drizzle, Payload, Next.js, Hono):

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

### .npmrc — Mandatory Settings

```ini
# .npmrc
ignore-scripts=true           # Block postinstall scripts (RCE prevention)
strict-peer-dependencies=true # Catch dependency conflicts
auto-install-peers=true       # Auto-install peer deps
# Allowlist packages that genuinely need scripts:
# pnpm config set allow-scripts esbuild,sharp,prisma
```

### Supply Chain Security Checklist

After the 2025 Shai-Hulud worm (796 packages, 132M monthly downloads):

1. **Frozen lockfiles in CI:** `pnpm install --frozen-lockfile` (never `pnpm install`)
2. **Disable lifecycle scripts:** `ignore-scripts=true` in `.npmrc`
3. **Package provenance:** Verify Sigstore attestations
4. **Pin exact versions:** No `^` or `~` for direct dependencies
5. **Regular audits:** `pnpm audit` + Socket.dev or Snyk for deeper analysis
6. **Minimal dependencies:** Every dep is an attack surface. Prefer Node.js built-ins.

### Decision Matrix

| Scenario | Recommendation | Why |
|----------|---------------|-----|
| **New greenfield project** | **pnpm** or **Bun** | pnpm: strict isolation, mature. Bun: faster, integrated runtime |
| **Enterprise monorepo** | **pnpm** | Best workspace support, proven at scale, 70% less disk |
| **Existing npm project** | Stay or migrate to pnpm | Migration cost may not be worth it for working projects |
| **CI/CD pipelines** | **pnpm** | Content-addressable store makes caching highly effective |

---

## 17. Common Anti-Patterns

### Anti-Pattern 1: Swallowed Promise Rejections (Missing `await`)

Forgetting `await` causes errors to silently disappear. One documented case involved $30,000 in invalid refunds over four months.

```typescript
// WRONG — validateOrder returns a Promise but we never wait for it
async function processPayment(order: Order) {
  validateOrder(order); // BUG: missing await — errors vanish silently
  const charge = await stripe.charges.create({
    amount: order.amount,
    currency: "usd",
    source: order.paymentToken,
  });
  return { success: true, chargeId: charge.id };
}

// RIGHT — await the validation
async function processPayment(order: Order) {
  await validateOrder(order); // Errors now propagate correctly
  const charge = await stripe.charges.create({
    amount: order.amount,
    currency: "usd",
    source: order.paymentToken,
  });
  return { success: true, chargeId: charge.id };
}
```

**Defense:** Enable `@typescript-eslint/no-floating-promises` in ESLint. Run Node.js with `--unhandled-rejections=strict`.

### Anti-Pattern 2: `any` Type Abuse

`any` silently disables all type checking. Sentry reports `TypeError: Cannot read properties of undefined` as the #1 JavaScript production error.

```typescript
// WRONG — no type safety, crashes at runtime
async function fetchUser(id: number): Promise<any> {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
}
const user = await fetchUser(1);
console.log(user.preferences.theme); // Runtime crash if structure differs

// RIGHT — validate at the boundary with Zod
const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  preferences: z.object({ theme: z.enum(["light", "dark"]) }),
});

async function fetchUser(id: number): Promise<z.infer<typeof UserSchema>> {
  const response = await fetch(`/api/users/${id}`);
  if (!response.ok) throw new ApiError("Failed to fetch user", response.status);
  return UserSchema.parse(await response.json());
}
```

### Anti-Pattern 3: Catch-and-Ignore

Empty catch blocks swallow errors silently. The application continues in a corrupted state.

```typescript
// WRONG — error disappears into the void
async function syncUserData(userId: string) {
  try {
    const data = await externalApi.fetchUser(userId);
    await db.users.update(userId, data);
  } catch (e) {
    console.log("sync failed"); // Nobody reads this in production
  }
}

// RIGHT — structured logging, metrics, dead-letter queue
async function syncUserData(userId: string) {
  try {
    const data = await externalApi.fetchUser(userId);
    await db.users.update(userId, data);
    metrics.increment("user_sync.success");
  } catch (err) {
    metrics.increment("user_sync.failure");
    logger.error({ err, userId }, "User sync failed");
    throw new SyncError(userId, { cause: err }); // Re-throw for caller
  }
}
```

### Anti-Pattern 4: Throwing Strings Instead of Errors

String throws have no stack trace, no `.name`, no `.cause`. Monitoring tools can't group them.

```typescript
// WRONG
if (!user) throw "User not found"; // No stack trace, no type safety
if (!valid) throw { message: "Invalid", code: 403 }; // Not an Error

// RIGHT
if (!user) throw new NotFoundError("User", userId);
if (!valid) throw new ForbiddenError("Invalid credentials");
```

### Anti-Pattern 5: Blocking the Event Loop

Synchronous I/O blocks ALL concurrent requests:

```typescript
// WRONG — fs.readFileSync blocks the event loop for every request
app.get("/data", (req, res) => {
  const data = fs.readFileSync("large-file.json", "utf-8"); // 💀
  res.json(JSON.parse(data));
});

// WRONG — synchronous crypto in a request handler
app.post("/hash", (req, res) => {
  const hash = crypto.pbkdf2Sync(req.body.password, "salt", 100000, 64, "sha512"); // 💀
  res.json({ hash: hash.toString("hex") });
});

// RIGHT — async I/O, preload data, worker threads for CPU work
const data = await fs.promises.readFile("large-file.json", "utf-8");
const parsed = JSON.parse(data);
app.get("/data", (req, res) => res.json(parsed));

app.post("/hash", async (req, res) => {
  const hash = await workerPool.run({ password: req.body.password });
  res.json({ hash });
});
```

### Anti-Pattern 6: Memory Leaks from Unbounded Caches

In-memory caches grow without bound until the process OOMs.

```typescript
// WRONG — cache grows forever
const cache: Record<string, User> = {};
function getUser(id: string) {
  if (cache[id]) return cache[id];
  const user = db.users.findById(id);
  cache[id] = user; // Never evicted. 1M users = 1M entries.
  return user;
}

// RIGHT — bounded LRU cache with TTL
import { LRUCache } from "lru-cache";
const userCache = new LRUCache<string, User>({
  max: 10_000,
  ttl: 5 * 60 * 1000, // 5 minutes
});

async function getUser(id: string) {
  const cached = userCache.get(id);
  if (cached) return cached;
  const user = await db.users.findById(id);
  if (user) userCache.set(id, user);
  return user;
}
```

### Anti-Pattern 7: Async Callbacks in Event Emitters

Async callbacks in EventEmitters cause unhandled rejections:

```typescript
// WRONG — if processOrder rejects, the EventEmitter can't catch it
emitter.on("order", async (order) => {
  await validateOrder(order);
  await chargePayment(order);
});

// WRONG — Express 4 does NOT handle async middleware errors
app.get("/users/:id", async (req, res) => {
  const user = await db.users.findById(req.params.id); // If this throws, request hangs
  res.json(user);
});

// RIGHT — wrap async callbacks
emitter.on("order", (order) => {
  processOrder(order).catch((err) => emitter.emit("error", err));
});

// RIGHT — async error wrapper (Express 4) or use Express 5+/Fastify
const asyncHandler = (fn: RequestHandler) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

app.get("/users/:id", asyncHandler(async (req, res) => {
  const user = await db.users.findById(req.params.id);
  res.json(user);
}));
```

### Anti-Pattern 8: Prototype Pollution via Unsafe Merging

```typescript
// WRONG — recursive merge without key filtering
function deepMerge(target: any, source: any) {
  for (const key in source) {
    if (typeof source[key] === "object") {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
}
// Attacker sends: { "__proto__": { "isAdmin": true } }
// Now ({}).isAdmin === true for EVERY object

// RIGHT — validate with Zod (strips unknown keys) or filter dangerous keys
const SettingsSchema = z.object({
  theme: z.enum(["light", "dark"]),
  language: z.string().max(5),
}).strict();

app.post("/settings", (req, res) => {
  const settings = SettingsSchema.parse(req.body); // Rejects __proto__, constructor
  res.json(settings);
});
```

### Anti-Pattern 9: `eval()` and Dynamic Code Execution

`eval` executes arbitrary code with full access to the current scope:

```typescript
// WRONG — Remote Code Execution vulnerability
app.post("/search", (req, res) => {
  const results = products.filter((item) => eval(req.body.filter)); // 💀
  // Attacker sends: filter = "process.mainModule.require('child_process').execSync('...')"
});

// RIGHT — whitelist-based filter
const OPERATORS = {
  eq: (a: unknown, b: unknown) => a === b,
  gt: (a: number, b: number) => a > b,
  lt: (a: number, b: number) => a < b,
  in: (a: unknown, b: unknown[]) => b.includes(a),
} as const;

const FilterSchema = z.object({
  field: z.enum(["price", "category", "rating"]),
  operator: z.enum(["eq", "gt", "lt", "in"]),
  value: z.union([z.string(), z.number(), z.array(z.string())]),
});

app.post("/search", (req, res) => {
  const conditions = z.array(FilterSchema).parse(req.body.conditions);
  const results = products.filter((item) =>
    conditions.every(({ field, operator, value }) =>
      OPERATORS[operator](item[field], value),
    ),
  );
  res.json(results);
});
```

### Anti-Pattern 10: Scattered `process.env` Without Validation

```typescript
// WRONG — no validation, crashes at 3am
mongoose.connect(process.env.MONGO_URI); // undefined if not set
const port = process.env.PORT || 3000; // String "3000", not number
if (process.env.EMAIL_ENABLED) { ... } // "false" is truthy!

// RIGHT — see Section 7: Configuration
// Centralized, Zod-validated, fail-fast at startup
```

### Anti-Pattern 11: Barrel File Bloat

```typescript
// WRONG — utils/index.ts re-exports everything
export { formatDate } from "./date-utils";
export { encrypt } from "./crypto-utils";
export { logger } from "./logger";
// ... 30 more exports

// Importing one thing loads everything:
import { logger } from "../utils"; // Pulls in ALL utilities

// RIGHT — import directly from the source module
import { logger } from "../utils/logger.js";
import { encrypt } from "../utils/crypto-utils.js";
```

### Anti-Pattern 12: Hardcoded Secrets

28.65 million secrets were leaked in public GitHub commits in 2025:

```typescript
// WRONG — credentials in source code
const JWT_SECRET = "super-secret-jwt-key";
const STRIPE_KEY = "sk_live_4eC39HqLyjWDarjtT1zdp7dc";

// RIGHT — validated env config (Section 7) + secrets manager for production
const config = EnvSchema.parse(process.env);
// .env files for local dev only. AWS Secrets Manager/Vault/Infisical for prod.
```

---

## 18. Projects Studied

| # | Repository | Stars | Category | Key Pattern Learned |
|---|-----------|-------|----------|-------------------|
| 1 | [Next.js](https://github.com/vercel/next.js) | ~139k | Full-stack framework | Turbo pipelines, SWC transpilation, middleware patterns |
| 2 | [NestJS](https://github.com/nestjs/nest) | ~75k | Backend framework | Decorator-based DI, exception filter pipeline, guards/interceptors |
| 3 | [Express](https://github.com/expressjs/express) | ~69k | Backend framework | Legacy async error handling patterns to avoid |
| 4 | [Prisma](https://github.com/prisma/prisma) | ~46k | ORM | Generated types, select optimization, custom ESLint rules |
| 5 | [Twenty CRM](https://github.com/twentyhq/twenty) | ~44k | Production app | Nx monorepo, NestJS + React, DAL pattern |
| 6 | [Zod](https://github.com/colinhacks/zod) | ~42k | Validation library | Schema inference, zshy bundler-free builds, Biome migration |
| 7 | [Payload CMS](https://github.com/payloadcms/payload) | ~42k | CMS | Config-as-code, Pino logging conventions, test cleanup patterns |
| 8 | [Cal.com](https://github.com/calcom/cal.com) | ~41k | Production app | T3 stack (tRPC + Prisma + Zod), Turbo monorepo, Biome |
| 9 | [tRPC](https://github.com/trpc/trpc) | ~40k | API library | Full type inference chain, error formatting, middleware patterns |
| 10 | [Fastify](https://github.com/fastify/fastify) | ~36k | Backend framework | Schema-based serialization (77k rps), plugin encapsulation, Pino integration |
| 11 | [Drizzle ORM](https://github.com/drizzle-team/drizzle-orm) | ~34k | ORM | Type-safe queries, zero deps (7.4kb), cross-DB integration tests |
| 12 | [Hono](https://github.com/honojs/hono) | ~30k | Backend framework | Multi-runtime (Workers/Deno/Bun/Node), RegExpRouter, Zod validation |
| 13 | [Infisical](https://github.com/Infisical/infisical) | ~26k | Secrets manager | Factory-based DI, DAL pattern, AES-256-GCM encryption, audit logging |
| 14 | [Documenso](https://github.com/documenso/documenso) | ~13k | Production app | T3 stack, @t3-oss/env-nextjs, Turbo monorepo |
| 15 | [BullMQ](https://github.com/taskforcesh/bullmq) | ~9k | Job queue | Worker concurrency, rate limiting, retry with backoff |
| 16 | [Turborepo](https://github.com/vercel/turborepo) | ~27k | Build tool | Pipeline DAG, remote caching, monorepo task orchestration |

---

*Generated from studying 16 production codebases with a combined 700k+ GitHub stars, cross-referenced with official documentation, security advisories, and community best practices as of April 2026.*
