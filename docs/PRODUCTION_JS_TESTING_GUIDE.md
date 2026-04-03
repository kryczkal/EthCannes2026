# Production-Ready JavaScript Testing: The Complete Guide

> How teams at Vitest, React, Vue, Svelte, Cal.com, Fastify, TanStack, Jotai, Zod, and Playwright ship tested code that doesn't break in production. Written for engineers who want their test suites to be fast, trustworthy, and maintainable.

---

## Table of Contents

1. [Mindset Shift: Amateur vs Production Testing](#1-mindset-shift-amateur-vs-production-testing)
2. [Framework Selection: Vitest as the Default](#2-framework-selection-vitest-as-the-default)
3. [Project Configuration](#3-project-configuration)
4. [Test Structure and Naming](#4-test-structure-and-naming)
5. [Unit Testing Patterns](#5-unit-testing-patterns)
6. [Mocking: The Right Way](#6-mocking-the-right-way)
7. [API Mocking with MSW](#7-api-mocking-with-msw)
8. [Component Testing with Testing Library](#8-component-testing-with-testing-library)
9. [Snapshot Testing](#9-snapshot-testing)
10. [Type Testing](#10-type-testing)
11. [Property-Based Testing](#11-property-based-testing)
12. [Integration Testing](#12-integration-testing)
13. [End-to-End Testing with Playwright](#13-end-to-end-testing-with-playwright)
14. [Test Data Management](#14-test-data-management)
15. [Performance and CI Optimization](#15-performance-and-ci-optimization)
16. [Coverage Strategy](#16-coverage-strategy)
17. [Anti-Patterns](#17-anti-patterns)
18. [Projects Studied](#18-projects-studied)

---

## 1. Mindset Shift: Amateur vs Production Testing

| Dimension | Amateur | Production |
|---|---|---|
| **Framework choice** | Whatever the tutorial used | Vitest for new projects, Jest only if already entrenched (React, Vue, Svelte, Jotai, TanStack all use Vitest) |
| **Test naming** | `test('it works')` | `test('when user submits empty form, shows validation errors for required fields')` |
| **Mocking** | Mock everything, `jest.mock` everywhere | Mock at boundaries only (APIs, time, randomness). Use real implementations for internal modules |
| **API testing** | Manually stub fetch/axios in every test | MSW with shared handlers, `onUnhandledRequest: 'error'` |
| **Component queries** | `getByTestId('submit-btn')` | `getByRole('button', { name: /submit/i })` |
| **Assertions** | `expect(el.disabled).toBe(true)` | `expect(el).toBeDisabled()` with jest-dom matchers |
| **Snapshots** | Snapshot entire pages and auto-update when they break | Inline snapshots for small, stable structures only. Explicit assertions for everything else |
| **E2E tests** | Cypress with `cy.wait(5000)` | Playwright with auto-waiting locators, browser context isolation, and test sharding |
| **CI pipeline** | Run all tests sequentially, 15-minute builds | Shard across runners, cache dependencies, fail fast on first error |
| **Coverage** | Chase 100% line coverage | Target 80%+ branch coverage on business logic, skip generated code and type definitions |
| **Test isolation** | Shared state leaks between tests, order-dependent failures | Each test sets up and tears down its own state. `restoreMocks: true` in config |

---

## 2. Framework Selection: Vitest as the Default

**Use Vitest for new projects.** The ecosystem has converged. Vue, Svelte, TanStack Query, Jotai, Zod, and most Vite-based projects use Vitest. It's faster than Jest, supports ESM natively, has built-in TypeScript support, and shares Vite's transform pipeline.

**Keep Jest if** your project already uses it and migration cost is high (React core, Docusaurus, React Router still use Jest). Don't migrate a working 2,000-test Jest suite for marginal gains.

**Node.js built-in `node:test`** is viable for zero-dependency libraries. Fastify uses it with the `borp` runner. Consider it for packages that want no test framework dependency.

```bash
# Install Vitest
npm install -D vitest

# With React/JSX support
npm install -D vitest @vitejs/plugin-react jsdom

# With Testing Library
npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event

# With MSW
npm install -D msw
```

---

## 3. Project Configuration

### Vitest Configuration (Single Project)

Used by: Zod, Jotai, Prisma

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/**/index.ts',
        'src/**/__mocks__/**',
      ],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
    // Conditional reporter for CI
    reporter: process.env.CI
      ? ['default', 'github-actions']
      : ['default'],
  },
})
```

### Vitest Workspace Configuration (Monorepo)

Used by: Cal.com (16 workspaces), Vue core

```typescript
// vitest.workspace.ts
import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  {
    test: {
      name: '@app/core',
      root: './packages/core',
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    test: {
      name: '@app/ui',
      root: './packages/ui',
      environment: 'jsdom',
      include: ['src/**/*.test.tsx'],
      setupFiles: ['./test-setup.tsx'],
    },
  },
  {
    test: {
      name: '@app/api',
      root: './packages/api',
      environment: 'node',
      include: ['src/**/*.test.ts'],
      // Use forks pool to prevent fetch-related errors
      pool: 'forks',
    },
  },
])
```

### Setup File

```typescript
// tests/setup.ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Cleanup after each test (automatic in Vitest with globals: true,
// but explicit here for clarity)
afterEach(() => {
  cleanup()
})
```

### Package.json Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "test:typecheck": "vitest --typecheck",
    "test:e2e": "playwright test",
    "test:ci": "vitest run --coverage --reporter=default --reporter=github-actions"
  }
}
```

---

## 4. Test Structure and Naming

### Three-Part Test Names

Used by: goldbergyoni/javascript-testing-best-practices (20k+ stars)

Structure: **[Unit under test]** — **[Scenario]** — **[Expected result]**

```typescript
// Bad
test('handles click', () => { /* ... */ })
test('validation works', () => { /* ... */ })

// Good
describe('OrderService.calculateTotal', () => {
  test('when cart has items with quantity > 0, returns sum of item prices times quantities', () => {
    // ...
  })

  test('when cart is empty, returns zero', () => {
    // ...
  })

  test('when discount code is applied, subtracts percentage from total', () => {
    // ...
  })
})
```

### AAA Pattern (Arrange-Act-Assert)

Separate each phase with a blank line. Every test should have exactly one Act and one logical assertion.

```typescript
describe('UserClassifier', () => {
  test('when user spent more than $500, classifies as premium', () => {
    // Arrange
    const user = createUser({ totalSpent: 505, joinDate: new Date('2024-01-01') })
    const classifier = new UserClassifier()

    // Act
    const tier = classifier.classify(user)

    // Assert
    expect(tier).toBe('premium')
  })
})
```

### File Organization

Two dominant patterns from production codebases:

**Colocated tests** (Vue, TanStack, Jotai): Test files live next to source files.
```
src/
  utils/
    format.ts
    format.test.ts
  hooks/
    useAuth.ts
    useAuth.test.ts
```

**Separate test directory** (React, Svelte): Tests live in `__tests__` or a top-level `tests/` directory.
```
src/
  utils/format.ts
  hooks/useAuth.ts
packages/react-dom/src/__tests__/
  ReactDOMComponent-test.js
  ReactDOMInput-test.js
```

**Recommendation:** Colocate for applications. Either approach works for libraries, but pick one and be consistent.

---

## 5. Unit Testing Patterns

### Test Pure Functions Thoroughly

Pure functions are the highest ROI tests. No mocking needed, fast execution, deterministic results.

```typescript
// src/utils/price.ts
export function calculateDiscount(
  price: number,
  discountPercent: number,
  maxDiscount: number,
): number {
  const discount = price * (discountPercent / 100)
  return Math.min(discount, maxDiscount)
}

// src/utils/price.test.ts
import { describe, test, expect } from 'vitest'
import { calculateDiscount } from './price'

describe('calculateDiscount', () => {
  test('applies percentage discount to price', () => {
    expect(calculateDiscount(100, 20, 50)).toBe(20)
  })

  test('caps discount at maxDiscount', () => {
    expect(calculateDiscount(1000, 50, 100)).toBe(100)
  })

  test('handles zero price', () => {
    expect(calculateDiscount(0, 20, 50)).toBe(0)
  })

  test('handles zero discount', () => {
    expect(calculateDiscount(100, 0, 50)).toBe(0)
  })
})
```

### Test Public APIs, Not Internals

Used by: React (130+ test files testing public DOM APIs, not internal fiber structure)

```typescript
// Bad: Testing internal state
test('sets internal loading flag', () => {
  const service = new OrderService()
  service.fetchOrders()
  expect(service._isLoading).toBe(true) // Testing private state
})

// Good: Testing observable behavior
test('when fetching orders, shows loading indicator', async () => {
  render(<OrderList />)

  expect(screen.getByRole('progressbar')).toBeInTheDocument()

  await waitFor(() => {
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
})
```

### Declarative Assertions

Use expressive matchers instead of manual comparisons.

```typescript
// Bad: Imperative assertion logic
const admins = getAdminUsers()
let foundAdmin1 = false
admins.forEach(user => {
  if (user.name === 'admin1') foundAdmin1 = true
  expect(user.role).not.toBe('viewer')
})
expect(foundAdmin1).toBe(true)

// Good: Declarative assertion
const admins = getAdminUsers()
expect(admins).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ name: 'admin1' }),
  ])
)
expect(admins.every(u => u.role !== 'viewer')).toBe(true)
```

### Testing Async Code

```typescript
import { describe, test, expect, vi } from 'vitest'

describe('fetchUserProfile', () => {
  test('returns parsed user data on success', async () => {
    const profile = await fetchUserProfile('user-123')

    expect(profile).toEqual({
      id: 'user-123',
      name: 'Jane Doe',
      email: 'jane@example.com',
    })
  })

  test('throws NotFoundError when user does not exist', async () => {
    await expect(fetchUserProfile('nonexistent')).rejects.toThrow(NotFoundError)
  })
})
```

### Testing Error Boundaries

```typescript
describe('ErrorBoundary', () => {
  test('when child throws, renders fallback UI', () => {
    const ThrowingComponent = () => {
      throw new Error('Intentional test error')
    }

    // Suppress console.error for this test
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary fallback={<div>Something went wrong</div>}>
        <ThrowingComponent />
      </ErrorBoundary>
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    spy.mockRestore()
  })
})
```

---

## 6. Mocking: The Right Way

### When to Mock

**Mock at system boundaries:**
- External HTTP APIs (use MSW, see Section 7)
- Time (`vi.useFakeTimers()`)
- Randomness (`vi.spyOn(Math, 'random')`)
- File system operations
- Database calls in unit tests
- Third-party services (payment providers, email, etc.)

**Do NOT mock:**
- Internal modules and utilities
- Data transformation functions
- Your own libraries within the same monorepo
- Framework internals (React hooks, Vue composables)

### Module Mocking with `vi.mock()`

```typescript
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { sendNotification } from './notification-service'
import { EmailClient } from './email-client'

// Mock the entire module — hoisted before imports
vi.mock('./email-client', () => ({
  EmailClient: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({ messageId: 'test-123' }),
  })),
}))

describe('sendNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('sends email with correct subject and body', async () => {
    await sendNotification({
      to: 'user@example.com',
      type: 'welcome',
    })

    const emailInstance = vi.mocked(EmailClient).mock.results[0].value
    expect(emailInstance.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: expect.stringContaining('Welcome'),
      })
    )
  })
})
```

### Partial Mocking with `importOriginal`

When you need most of a module's real behavior but want to override one export:

```typescript
vi.mock('./config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./config')>()
  return {
    ...actual,
    getFeatureFlags: vi.fn().mockReturnValue({
      newCheckout: true,
      darkMode: false,
    }),
  }
})
```

### Spying with `vi.spyOn()`

Use `vi.spyOn` when you want to observe calls without replacing the implementation:

```typescript
import * as analytics from './analytics'

test('tracks page view on mount', () => {
  const trackSpy = vi.spyOn(analytics, 'track')

  render(<Dashboard />)

  expect(trackSpy).toHaveBeenCalledWith('page_view', {
    page: 'dashboard',
  })
})
```

### Timer Mocking

Used by: React, Vue, Svelte for testing debounced/throttled behavior

```typescript
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { debounce } from './debounce'

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('delays function execution by specified ms', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    debounced()
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(299)
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledOnce()
  })

  test('resets timer on subsequent calls', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    debounced()
    vi.advanceTimersByTime(200)
    debounced() // Reset timer

    vi.advanceTimersByTime(200)
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledOnce()
  })
})
```

### Date Mocking

```typescript
test('formats relative time correctly', () => {
  vi.setSystemTime(new Date('2025-06-15T10:00:00Z'))

  expect(formatRelative(new Date('2025-06-15T09:55:00Z'))).toBe('5 minutes ago')
  expect(formatRelative(new Date('2025-06-14T10:00:00Z'))).toBe('yesterday')

  vi.useRealTimers()
})
```

### Environment Variable Mocking

```typescript
test('uses production API URL in production mode', () => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('API_URL', 'https://api.prod.example.com')

  const client = createApiClient()
  expect(client.baseUrl).toBe('https://api.prod.example.com')

  vi.unstubAllEnvs()
})
```

### Critical: Always Restore Mocks

Set `restoreMocks: true` in your Vitest config to automatically restore all mocks after each test. This prevents state leaking between tests.

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    restoreMocks: true, // Equivalent to vi.restoreAllMocks() in afterEach
  },
})
```

---

## 7. API Mocking with MSW

MSW (Mock Service Worker) intercepts actual network requests at the protocol level. Unlike `vi.mock('axios')`, your application code runs exactly as it would in production — real HTTP client, real request/response serialization.

### Handler Setup

```typescript
// tests/mocks/handlers.ts
import { http, HttpResponse } from 'msw'

export const handlers = [
  // GET request
  http.get('https://api.example.com/users/:id', ({ params }) => {
    const { id } = params
    return HttpResponse.json({
      id,
      name: 'Jane Doe',
      email: 'jane@example.com',
    })
  }),

  // POST request
  http.post('https://api.example.com/users', async ({ request }) => {
    const body = await request.json()
    return HttpResponse.json(
      { id: 'new-user-123', ...body },
      { status: 201 },
    )
  }),

  // Error scenario
  http.get('https://api.example.com/users/not-found', () => {
    return HttpResponse.json(
      { error: 'User not found' },
      { status: 404 },
    )
  }),
]
```

### Server Setup

```typescript
// tests/mocks/server.ts
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)
```

### Integration with Vitest

```typescript
// tests/setup.ts
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './mocks/server'

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})
```

### Per-Test Handler Overrides

Override handlers in specific tests without affecting other tests:

```typescript
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'

test('shows error message when API returns 500', async () => {
  // Override for this test only
  server.use(
    http.get('https://api.example.com/users/:id', () => {
      return HttpResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      )
    }),
  )

  render(<UserProfile userId="123" />)

  await waitFor(() => {
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Failed to load user profile'
    )
  })
})
```

### GraphQL Mocking

```typescript
import { graphql, HttpResponse } from 'msw'

export const graphqlHandlers = [
  graphql.query('GetUser', ({ variables }) => {
    return HttpResponse.json({
      data: {
        user: {
          id: variables.id,
          name: 'Jane Doe',
          posts: [],
        },
      },
    })
  }),

  graphql.mutation('CreatePost', ({ variables }) => {
    return HttpResponse.json({
      data: {
        createPost: {
          id: 'post-123',
          title: variables.title,
          createdAt: new Date().toISOString(),
        },
      },
    })
  }),
]
```

---

## 8. Component Testing with Testing Library

### Query Priority

Used by: Testing Library official docs, enforced by eslint-plugin-testing-library

Query by what the user sees and interacts with, in order of preference:

1. **`getByRole`** — matches ARIA role (button, textbox, heading, link, etc.)
2. **`getByLabelText`** — matches form labels
3. **`getByPlaceholderText`** — fallback for inputs without labels
4. **`getByText`** — matches visible text
5. **`getByTestId`** — last resort only

```typescript
// Bad: Querying by implementation detail
const { container } = render(<LoginForm />)
const button = container.querySelector('.btn-primary')
const input = screen.getByTestId('email-input')

// Good: Querying by user-facing attributes
render(<LoginForm />)
const button = screen.getByRole('button', { name: /sign in/i })
const emailInput = screen.getByRole('textbox', { name: /email/i })
const passwordInput = screen.getByLabelText(/password/i)
```

### User Event Over fireEvent

`@testing-library/user-event` simulates real browser interactions (focus, keydown, keyup, input, change) instead of dispatching a single synthetic event.

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

test('submits login form with credentials', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()

  render(<LoginForm onSubmit={onSubmit} />)

  await user.type(screen.getByRole('textbox', { name: /email/i }), 'jane@example.com')
  await user.type(screen.getByLabelText(/password/i), 'securepass123')
  await user.click(screen.getByRole('button', { name: /sign in/i }))

  expect(onSubmit).toHaveBeenCalledWith({
    email: 'jane@example.com',
    password: 'securepass123',
  })
})
```

### Always Use `screen`

```typescript
// Bad: Destructuring render result
const { getByRole, getByText } = render(<Component />)

// Good: Using screen
render(<Component />)
screen.getByRole('heading', { name: /dashboard/i })
```

### Asserting Non-Existence

Use `queryBy*` only for asserting something is NOT present:

```typescript
// Asserting presence — use getBy (throws if not found)
expect(screen.getByRole('alert')).toBeInTheDocument()

// Asserting absence — use queryBy (returns null if not found)
expect(screen.queryByRole('alert')).not.toBeInTheDocument()

// Waiting for appearance — use findBy
const alert = await screen.findByRole('alert')
expect(alert).toHaveTextContent('Saved successfully')
```

### Async Patterns

```typescript
// Bad: Using waitFor when findBy suffices
const button = await waitFor(() =>
  screen.getByRole('button', { name: /submit/i })
)

// Good: Using findBy (wraps waitFor internally)
const button = await screen.findByRole('button', { name: /submit/i })

// Good: waitFor for assertions (not queries)
await waitFor(() => {
  expect(screen.getByRole('status')).toHaveTextContent('Saved')
})
```

### Use jest-dom Matchers

```typescript
// Bad: Manual DOM property checks
expect(button.disabled).toBe(true)
expect(element.textContent).toBe('Hello')
expect(input.value).toBe('test')
expect(container.querySelector('.visible')).not.toBeNull()

// Good: jest-dom matchers with better error messages
expect(button).toBeDisabled()
expect(element).toHaveTextContent('Hello')
expect(input).toHaveValue('test')
expect(element).toBeVisible()
```

### Testing Hooks

```typescript
import { renderHook, waitFor } from '@testing-library/react'
import { useCounter } from './useCounter'

test('increments counter', () => {
  const { result } = renderHook(() => useCounter(0))

  expect(result.current.count).toBe(0)

  act(() => {
    result.current.increment()
  })

  expect(result.current.count).toBe(1)
})
```

---

## 9. Snapshot Testing

### When to Use

- **AST output** from compilers/parsers (Svelte uses snapshots for compiler output)
- **Serialized data structures** that are stable and small
- **Error messages** that must not change unintentionally
- **CLI output** formatting

### When to Avoid

- Component render output (use explicit assertions instead)
- Large objects (hard to review in PRs)
- Anything with timestamps, IDs, or non-deterministic values
- As a substitute for writing real assertions

### Inline Snapshots

Preferred for small outputs. The expected value lives in the test file, making changes visible in diffs.

```typescript
import { describe, test, expect } from 'vitest'
import { parseExpression } from './parser'

test('parses binary expression', () => {
  const ast = parseExpression('1 + 2')

  expect(ast).toMatchInlineSnapshot(`
    {
      "left": {
        "type": "NumericLiteral",
        "value": 1,
      },
      "operator": "+",
      "right": {
        "type": "NumericLiteral",
        "value": 2,
      },
      "type": "BinaryExpression",
    }
  `)
})
```

### File Snapshots for Larger Outputs

```typescript
test('generates correct CSS from component', () => {
  const css = compileToCss(svelteComponent)
  expect(css).toMatchFileSnapshot('./snapshots/button.css')
})
```

### Custom Serializers

Strip non-deterministic values to prevent false diffs:

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    snapshotSerializers: ['./tests/serializers/strip-ansi.ts'],
  },
})

// tests/serializers/strip-ansi.ts
import stripAnsi from 'strip-ansi'

export default {
  serialize(val: string) {
    return stripAnsi(val)
  },
  test(val: unknown) {
    return typeof val === 'string' && /\u001b\[/.test(val)
  },
}
```

---

## 10. Type Testing

Vitest has built-in type testing using `expectTypeOf` and `assertType`. Tests run during `vitest --typecheck` and use `tsc` under the hood.

Used by: Vue, Zod, TanStack Query for validating public API types.

### Setup

Type test files use the `.test-d.ts` extension:

```typescript
// src/utils/types.test-d.ts
import { describe, test, expectTypeOf } from 'vitest'
import { merge, pick } from './object-utils'

describe('merge', () => {
  test('merges two object types', () => {
    const result = merge({ a: 1 }, { b: 'hello' })
    expectTypeOf(result).toEqualTypeOf<{ a: number; b: string }>()
  })

  test('later properties override earlier ones', () => {
    const result = merge({ a: 1 }, { a: 'override' })
    expectTypeOf(result.a).toBeString()
  })
})

describe('pick', () => {
  test('narrows return type to picked keys', () => {
    const obj = { a: 1, b: 'hello', c: true }
    const picked = pick(obj, ['a', 'c'])

    expectTypeOf(picked).toEqualTypeOf<{ a: number; c: boolean }>()
    // @ts-expect-error — 'b' was not picked
    picked.b
  })
})
```

### Common Type Assertions

```typescript
import { expectTypeOf } from 'vitest'

// Check exact type equality
expectTypeOf<string>().toEqualTypeOf<string>()

// Check type extension
expectTypeOf<'hello'>().toExtend<string>()

// Check function signatures
expectTypeOf(myFunction).toBeFunction()
expectTypeOf(myFunction).parameter(0).toBeString()
expectTypeOf(myFunction).returns.toBeNumber()

// Check that types are NOT equal
expectTypeOf<string>().not.toEqualTypeOf<number>()

// Object type matching
expectTypeOf({ name: 'Jane' }).toMatchObjectType<{ name: string }>()
```

### Run Type Tests

```bash
vitest --typecheck
vitest --typecheck --run  # Single run, no watch
```

---

## 11. Property-Based Testing

Property-based testing generates hundreds of random inputs to find edge cases that example-based tests miss. Use `fast-check` — it's used by Jest and Jasmine themselves for testing.

### Setup

```bash
npm install -D fast-check
```

### Basic Properties

```typescript
import { describe, test, expect } from 'vitest'
import fc from 'fast-check'
import { sort } from './sort'

describe('sort', () => {
  test('output has same length as input', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (arr) => {
        expect(sort(arr)).toHaveLength(arr.length)
      })
    )
  })

  test('output is sorted in ascending order', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (arr) => {
        const sorted = sort(arr)
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i]).toBeGreaterThanOrEqual(sorted[i - 1])
        }
      })
    )
  })

  test('output contains exactly the same elements as input', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (arr) => {
        const sorted = sort(arr)
        expect([...sorted].sort()).toEqual([...arr].sort())
      })
    )
  })
})
```

### Encode/Decode Roundtrip

A classic property: encoding then decoding should return the original value.

```typescript
test('JSON parse is inverse of JSON stringify for plain objects', () => {
  fc.assert(
    fc.property(
      fc.record({
        name: fc.string(),
        age: fc.integer({ min: 0, max: 150 }),
        active: fc.boolean(),
      }),
      (obj) => {
        expect(JSON.parse(JSON.stringify(obj))).toEqual(obj)
      }
    )
  )
})
```

### Schema Validation

```typescript
import { z } from 'zod'

const UserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  age: z.number().int().min(0).max(150),
})

test('schema rejects all invalid emails', () => {
  fc.assert(
    fc.property(
      fc.string().filter(s => !s.includes('@') || !s.includes('.')),
      (invalidEmail) => {
        const result = UserSchema.safeParse({
          name: 'Test',
          email: invalidEmail,
          age: 25,
        })
        expect(result.success).toBe(false)
      }
    ),
    { numRuns: 500 },
  )
})
```

### Reproducing Failures

When fast-check finds a failing input, it shrinks it to the smallest reproducing case and prints a seed:

```
Property failed after 23 tests
Shrunk 5 time(s)
Counterexample: [""]
Seed: 1234567890
```

Replay with the seed:

```typescript
fc.assert(
  fc.property(fc.array(fc.string()), (arr) => {
    // ...
  }),
  { seed: 1234567890, path: '22:0' }, // Reproduce exact failure
)
```

---

## 12. Integration Testing

### Database Testing with Testcontainers

Spin up real database instances for integration tests:

```typescript
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createPool } from './db'

let container: PostgreSqlContainer
let pool: ReturnType<typeof createPool>

beforeAll(async () => {
  container = await new PostgreSqlContainer()
    .withDatabase('testdb')
    .start()

  pool = createPool({
    connectionString: container.getConnectionUri(),
  })

  // Run migrations
  await pool.query(readFileSync('./migrations/001.sql', 'utf8'))
}, 30_000) // Container startup can take time

afterAll(async () => {
  await pool.end()
  await container.stop()
})

test('creates and retrieves a user', async () => {
  const created = await pool.query(
    'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
    ['Jane', 'jane@example.com'],
  )

  const retrieved = await pool.query(
    'SELECT * FROM users WHERE id = $1',
    [created.rows[0].id],
  )

  expect(retrieved.rows[0]).toEqual(
    expect.objectContaining({
      name: 'Jane',
      email: 'jane@example.com',
    }),
  )
})
```

### API Route Testing

For Node.js frameworks, use request injection instead of starting a real server:

```typescript
// Fastify style — used by Fastify itself
import { describe, test, expect } from 'vitest'
import { buildApp } from '../src/app'

describe('GET /api/users', () => {
  test('returns list of users', async () => {
    const app = buildApp()

    const response = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: 'Bearer test-token' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Jane Doe' }),
      ])
    )
  })
})
```

### Testing Middleware

```typescript
import { describe, test, expect, vi } from 'vitest'
import { authMiddleware } from './auth-middleware'

describe('authMiddleware', () => {
  test('passes through for valid token', async () => {
    const req = { headers: { authorization: 'Bearer valid-token' } }
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    const next = vi.fn()

    await authMiddleware(req as any, res as any, next)

    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })

  test('returns 401 for missing token', async () => {
    const req = { headers: {} }
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    const next = vi.fn()

    await authMiddleware(req as any, res as any, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })
})
```

---

## 13. End-to-End Testing with Playwright

### Configuration

Used by: Cal.com, React Router/Remix

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI
    ? [['blob'], ['html', { open: 'never' }]]
    : [['html', { open: 'on-failure' }]],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
```

### Page Object Model

```typescript
// e2e/pages/login.page.ts
import { type Page, type Locator } from '@playwright/test'

export class LoginPage {
  readonly emailInput: Locator
  readonly passwordInput: Locator
  readonly submitButton: Locator
  readonly errorMessage: Locator

  constructor(private page: Page) {
    this.emailInput = page.getByRole('textbox', { name: /email/i })
    this.passwordInput = page.getByLabel(/password/i)
    this.submitButton = page.getByRole('button', { name: /sign in/i })
    this.errorMessage = page.getByRole('alert')
  }

  async goto() {
    await this.page.goto('/login')
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    await this.submitButton.click()
  }
}
```

### Test with Page Objects

```typescript
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test'
import { LoginPage } from './pages/login.page'

test.describe('Authentication', () => {
  test('successful login redirects to dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()

    await loginPage.login('jane@example.com', 'password123')

    await expect(page).toHaveURL('/dashboard')
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible()
  })

  test('invalid credentials shows error', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()

    await loginPage.login('jane@example.com', 'wrongpassword')

    await expect(loginPage.errorMessage).toHaveText('Invalid email or password')
    await expect(page).toHaveURL('/login')
  })
})
```

### Authentication State Reuse

Avoid logging in for every test by saving authenticated state:

```typescript
// e2e/auth.setup.ts
import { test as setup, expect } from '@playwright/test'

const authFile = 'e2e/.auth/user.json'

setup('authenticate', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('textbox', { name: /email/i }).fill('jane@example.com')
  await page.getByLabel(/password/i).fill('password123')
  await page.getByRole('button', { name: /sign in/i }).click()

  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible()

  await page.context().storageState({ path: authFile })
})
```

```typescript
// playwright.config.ts (add to projects)
{
  name: 'setup',
  testMatch: /.*\.setup\.ts/,
},
{
  name: 'chromium',
  use: {
    ...devices['Desktop Chrome'],
    storageState: 'e2e/.auth/user.json',
  },
  dependencies: ['setup'],
},
```

### Flaky Test Mitigation

1. **Never use hard waits.** Playwright's locators auto-wait.
2. **Use `toBeVisible()` not `toBeInTheDocument()`.** Playwright assertions auto-retry.
3. **Use stable locators.** Prefer `getByRole`, `getByLabel`, `getByText` over CSS selectors.
4. **Quarantine known flaky tests** with annotations:

```typescript
test('occasionally flaky network test', {
  annotation: { type: 'flaky', description: 'Depends on external API latency' },
}, async ({ page }) => {
  // ...
})
```

### Visual Regression Testing

```typescript
test('homepage renders correctly', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveScreenshot('homepage.png', {
    maxDiffPixelRatio: 0.01,
  })
})
```

---

## 14. Test Data Management

### Factory Functions

Build test objects with sensible defaults and easy overrides:

```typescript
// tests/factories/user.ts
interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'user' | 'viewer'
  createdAt: Date
}

let userCounter = 0

export function createUser(overrides: Partial<User> = {}): User {
  userCounter++
  return {
    id: `user-${userCounter}`,
    name: `Test User ${userCounter}`,
    email: `user${userCounter}@test.com`,
    role: 'user',
    createdAt: new Date('2025-01-01'),
    ...overrides,
  }
}

// Usage
const admin = createUser({ role: 'admin', name: 'Admin Jane' })
const viewer = createUser({ role: 'viewer' })
```

### Builder Pattern for Complex Objects

```typescript
// tests/factories/order-builder.ts
class OrderBuilder {
  private order: Order = {
    id: 'order-1',
    items: [],
    status: 'pending',
    customerId: 'customer-1',
    createdAt: new Date('2025-01-01'),
    total: 0,
  }

  withItem(item: Partial<OrderItem> = {}): this {
    const orderItem: OrderItem = {
      productId: `product-${this.order.items.length + 1}`,
      name: 'Test Product',
      price: 10,
      quantity: 1,
      ...item,
    }
    this.order.items.push(orderItem)
    this.order.total += orderItem.price * orderItem.quantity
    return this
  }

  withStatus(status: Order['status']): this {
    this.order.status = status
    return this
  }

  build(): Order {
    return { ...this.order }
  }
}

export const anOrder = () => new OrderBuilder()

// Usage
const order = anOrder()
  .withItem({ name: 'Widget', price: 25, quantity: 2 })
  .withItem({ name: 'Gadget', price: 15 })
  .withStatus('confirmed')
  .build()
```

### Faker for Realistic Data

```typescript
import { faker } from '@faker-js/faker'

export function createRandomUser(): User {
  return {
    id: faker.string.uuid(),
    name: faker.person.fullName(),
    email: faker.internet.email(),
    role: faker.helpers.arrayElement(['admin', 'user', 'viewer']),
    createdAt: faker.date.past(),
  }
}

// For deterministic tests, seed the generator
faker.seed(42)
const user1 = createRandomUser() // Always the same
const user2 = createRandomUser() // Always the same
```

---

## 15. Performance and CI Optimization

### Test Sharding

Split tests across multiple CI runners:

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        shard: [1/4, 2/4, 3/4, 4/4]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'
      - run: npm ci
      - run: npx vitest run --reporter=blob --shard=${{ matrix.shard }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: blob-report-${{ strategy.job-index }}
          path: .vitest-reports/

  merge-reports:
    needs: test
    runs-on: ubuntu-latest
    if: always()
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'
      - run: npm ci
      - uses: actions/download-artifact@v4
        with:
          path: .vitest-reports/
          pattern: blob-report-*
          merge-multiple: true
      - run: npx vitest run --merge-reports
```

### Pool Selection

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    // 'forks' (default): Safer, separate processes. Use for tests with native modules or side effects.
    // 'threads': Faster, worker threads. Use when tests are pure JS/TS.
    pool: 'threads',

    // Disable isolation for speed when tests don't leak state
    // isolate: false,
  },
})
```

### Selective Test Runs

Only run tests affected by changed files:

```bash
# Vitest's built-in changed detection
vitest --changed HEAD~1

# Or with related files
vitest --changed --reporter=verbose
```

### Watch Mode Workflow

Vitest's watch mode re-runs only affected tests. Combined with `--reporter=dot` for minimal output:

```bash
vitest --reporter=dot
```

### Dependency Caching in CI

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
    cache: 'npm'
- run: npm ci  # Deterministic install from lockfile
```

### Playwright Sharding

```yaml
jobs:
  e2e:
    strategy:
      matrix:
        shard: [1/3, 2/3, 3/3]
    steps:
      - run: npx playwright test --shard=${{ matrix.shard }}
```

---

## 16. Coverage Strategy

### What to Measure

- **Branch coverage** over line coverage. A function with an `if/else` at 100% line coverage might only test the `if` branch.
- **80%+ on business logic.** Don't chase 100% globally.
- **Exclude** generated code, type definitions, barrel exports, and config files.

### Configuration

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/**/*.stories.{ts,tsx}',
        'src/**/index.ts',     // Barrel exports
        'src/**/types.ts',     // Pure type files
        'src/**/__mocks__/**',
        'src/**/*.config.*',
      ],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
})
```

### Coverage Enforcement in CI

```yaml
- run: npx vitest run --coverage
  env:
    CI: true
# Fails if thresholds are not met
```

### What Not to Cover

- **Wrapper components** that just pass props through
- **Type-only code** (interfaces, type aliases)
- **Framework boilerplate** (main entry, route definitions)
- **Test utilities** and fixtures

---

## 17. Anti-Patterns

### Anti-Pattern 1: Mocking Everything

**Wrong:**
```typescript
vi.mock('./utils')
vi.mock('./config')
vi.mock('./logger')
vi.mock('./formatter')

test('processOrder works', () => {
  // You're testing that mocks return what you told them to.
  // Zero confidence in actual behavior.
  const result = processOrder(mockOrder)
  expect(result).toBe(true)
})
```

**Right:**
```typescript
// Only mock the external boundary (HTTP API)
// Let utils, config, logger, formatter run with real code
test('processOrder creates order and sends confirmation', async () => {
  server.use(
    http.post('https://api.payment.com/charge', () => {
      return HttpResponse.json({ id: 'charge-123', status: 'succeeded' })
    }),
  )

  const result = await processOrder(createOrder({ total: 50 }))

  expect(result.status).toBe('confirmed')
  expect(result.paymentId).toBe('charge-123')
})
```

### Anti-Pattern 2: Testing Implementation Details

**Wrong:**
```typescript
test('calls setState with correct value', () => {
  const setState = vi.fn()
  vi.spyOn(React, 'useState').mockReturnValue([0, setState])

  render(<Counter />)
  fireEvent.click(screen.getByRole('button', { name: /increment/i }))

  expect(setState).toHaveBeenCalledWith(1)
})
```

**Right:**
```typescript
test('increments displayed count when button is clicked', async () => {
  const user = userEvent.setup()
  render(<Counter />)

  expect(screen.getByText('Count: 0')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: /increment/i }))

  expect(screen.getByText('Count: 1')).toBeInTheDocument()
})
```

### Anti-Pattern 3: Querying by Test ID When Semantic Queries Exist

**Wrong:**
```typescript
render(<Navigation />)
const link = screen.getByTestId('home-link')
const button = screen.getByTestId('logout-button')
```

**Right:**
```typescript
render(<Navigation />)
const link = screen.getByRole('link', { name: /home/i })
const button = screen.getByRole('button', { name: /log out/i })
```

### Anti-Pattern 4: Side Effects Inside `waitFor`

**Wrong:**
```typescript
await waitFor(() => {
  fireEvent.click(screen.getByRole('button'))  // Runs multiple times!
  expect(screen.getByText('Submitted')).toBeInTheDocument()
})
```

**Right:**
```typescript
await user.click(screen.getByRole('button'))
await waitFor(() => {
  expect(screen.getByText('Submitted')).toBeInTheDocument()
})
```

### Anti-Pattern 5: Snapshot Abuse

**Wrong:**
```typescript
test('renders correctly', () => {
  const { container } = render(<EntirePage />)
  expect(container).toMatchSnapshot() // 500-line snapshot nobody reads
})
```

**Right:**
```typescript
test('renders page title and navigation', () => {
  render(<EntirePage />)

  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Dashboard')
  expect(screen.getByRole('navigation')).toBeInTheDocument()
  expect(screen.getAllByRole('link')).toHaveLength(5)
})
```

### Anti-Pattern 6: Using `fireEvent` When `user-event` Is Available

**Wrong:**
```typescript
fireEvent.change(input, { target: { value: 'hello' } })
fireEvent.click(button)
```

**Right:**
```typescript
const user = userEvent.setup()
await user.type(input, 'hello')
await user.click(button)
```

### Anti-Pattern 7: Hard-Coded Waits in E2E Tests

**Wrong:**
```typescript
await page.goto('/dashboard')
await page.waitForTimeout(3000) // Hope the page loaded in 3 seconds
await page.click('#submit')
```

**Right:**
```typescript
await page.goto('/dashboard')
await page.getByRole('button', { name: /submit/i }).click() // Auto-waits for actionability
```

### Anti-Pattern 8: No `onUnhandledRequest` in MSW

**Wrong:**
```typescript
beforeAll(() => server.listen()) // Silent on unhandled requests
```

**Right:**
```typescript
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
// Fails immediately if your code makes an unmocked HTTP request
```

### Anti-Pattern 9: Test Order Dependency

**Wrong:**
```typescript
let sharedUser: User

test('creates a user', async () => {
  sharedUser = await createUser({ name: 'Jane' })
  expect(sharedUser.id).toBeDefined()
})

test('fetches the created user', async () => {
  // Fails if run in isolation or in different order
  const user = await fetchUser(sharedUser.id)
  expect(user.name).toBe('Jane')
})
```

**Right:**
```typescript
test('creates and fetches a user', async () => {
  const created = await createUser({ name: 'Jane' })
  const fetched = await fetchUser(created.id)
  expect(fetched.name).toBe('Jane')
})
```

### Anti-Pattern 10: Ignoring Accessible Names

**Wrong:**
```typescript
render(
  <>
    <button role="button">Click me</button>  {/* Redundant role */}
    <div role="button">Not a real button</div>  {/* Fake button */}
  </>
)
```

**Right:**
```typescript
render(
  <>
    <button>Click me</button>  {/* Inherent button role */}
    <button onClick={handleAction}>Perform action</button>  {/* Real button */}
  </>
)
```

### Anti-Pattern 11: Manually Calling `cleanup`

**Wrong:**
```typescript
import { cleanup } from '@testing-library/react'
afterEach(cleanup) // Unnecessary since Vitest/Jest do this automatically
```

**Right:**
```typescript
// Just don't. Cleanup is automatic with modern frameworks.
// If you're using globals: true in Vitest, it's handled for you.
```

### Anti-Pattern 12: Empty `waitFor` Callbacks

**Wrong:**
```typescript
await waitFor(() => {})
expect(mockFetch).toHaveBeenCalled()
```

**Right:**
```typescript
await waitFor(() => {
  expect(mockFetch).toHaveBeenCalled()
})
```

---

## 18. Projects Studied

| # | Project | Stars | Framework | Key Pattern Learned | Link |
|---|---------|-------|-----------|--------------------|----|
| 1 | React | 234k+ | Jest | Test file naming (`-test.js`, `-test.internal.js`), public API testing with 130+ DOM test files, custom Jest wrappers | [github.com/facebook/react](https://github.com/facebook/react) |
| 2 | Vue | 49k+ | Vitest | `.spec.ts` naming, colocated `__tests__` dirs per package, feature-organized test files | [github.com/vuejs/core](https://github.com/vuejs/core) |
| 3 | Svelte | 81k+ | Vitest | Sample-based test directories, separate test runners per environment (browser, legacy, production, runes), jsdom environment annotation | [github.com/sveltejs/svelte](https://github.com/sveltejs/svelte) |
| 4 | Cal.com | 35k+ | Vitest + Playwright | 16-workspace Vitest config, mode-based test separation (timezone, integration, packaged-embed), `pool: 'forks'`, cross-browser Playwright projects including mobile | [github.com/calcom/cal.com](https://github.com/calcom/cal.com) |
| 5 | Fastify | 33k+ | node:test + borp | Zero-dependency testing with `node:test`, `t.plan()` for assertion counting, `inject()` for HTTP testing without network | [github.com/fastify/fastify](https://github.com/fastify/fastify) |
| 6 | TanStack Query | 43k+ | Vitest | Component test patterns for hooks, renderHook usage, query client per test | [github.com/TanStack/query](https://github.com/TanStack/query) |
| 7 | Jotai | 21k+ | Vitest | jsdom environment, React Testing Library with globals, v8 coverage, conditional CI reporters | [github.com/pmndrs/jotai](https://github.com/pmndrs/jotai) |
| 8 | Prisma | 41k+ | Vitest | Minimal config extending defaults, dist directory exclusion | [github.com/prisma/prisma](https://github.com/prisma/prisma) |
| 9 | Docusaurus | 64k+ | Jest | SWC for transforms, custom module mapping for CSS/MDX, Argos CI for visual regression, GitHub Actions reporter | [github.com/facebook/docusaurus](https://github.com/facebook/docusaurus) |
| 10 | React Router / Remix | 54k+ | Jest + Playwright | Jest for unit tests with Babel, Playwright for integration tests, multi-project setup | [github.com/remix-run/react-router](https://github.com/remix-run/react-router) |
| 11 | Zod | 35k+ | Vitest | Schema validation testing, type testing, exhaustive edge case coverage | [github.com/colinhacks/zod](https://github.com/colinhacks/zod) |
| 12 | Vitest | 14k+ | Vitest (self-hosted) | Dogfooding own framework, comprehensive snapshot and type testing | [github.com/vitest-dev/vitest](https://github.com/vitest-dev/vitest) |
| 13 | Testing Library | 19k+ | Jest | Query priority documentation, user-event patterns, accessibility-first testing philosophy | [github.com/testing-library/react-testing-library](https://github.com/testing-library/react-testing-library) |
| 14 | MSW | 16k+ | Vitest | Protocol-level request interception, handler pattern, `onUnhandledRequest` enforcement | [github.com/mswjs/msw](https://github.com/mswjs/msw) |
| 15 | fast-check | 4k+ | Jest | Property-based testing, shrinking, seed-based reproduction, used by Jest and Jasmine | [github.com/dubzzz/fast-check](https://github.com/dubzzz/fast-check) |
| 16 | Playwright | 70k+ | Playwright | Auto-waiting locators, browser context isolation, auth state reuse, sharding, visual regression | [github.com/microsoft/playwright](https://github.com/microsoft/playwright) |
| 17 | goldbergyoni/javascript-testing-best-practices | 20k+ | Framework-agnostic | AAA pattern, three-part naming, 50+ codified best practices | [github.com/goldbergyoni/javascript-testing-best-practices](https://github.com/goldbergyoni/javascript-testing-best-practices) |
