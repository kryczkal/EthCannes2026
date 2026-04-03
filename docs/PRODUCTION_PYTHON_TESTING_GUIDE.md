# Production-Ready Python Testing: The Complete Guide

> A distilled guide for writing tests at the level of the best Python teams in the world (Meta/Instagram, Stripe, Sentry, Dropbox, Google, Netflix). Built from reading real test code across 20 production projects: pytest, Django, FastAPI, requests, SQLAlchemy, Pydantic, httpx, Celery, attrs, Hypothesis, factory_boy, responses, freezegun, pytest-asyncio, Sentry SDK, Stripe Python, botocore, aiohttp, Starlette, and Black.

---

## Table of Contents

1. [Mindset Shift](#1-mindset-shift)
2. [The Python Test Trophy](#2-the-python-test-trophy)
3. [Project Structure](#3-project-structure)
4. [pytest Configuration](#4-pytest-configuration)
5. [Fixtures & conftest.py](#5-fixtures--conftestpy)
6. [Fakes vs Mocks: The Core Principle](#6-fakes-vs-mocks-the-core-principle)
7. [Fake Patterns](#7-fake-patterns)
8. [Async Testing](#8-async-testing)
9. [Database Testing](#9-database-testing)
10. [HTTP & API Testing](#10-http--api-testing)
11. [FastAPI Testing](#11-fastapi-testing)
12. [Parametrize & Test Builders](#12-parametrize--test-builders)
13. [Property-Based Testing with Hypothesis](#13-property-based-testing-with-hypothesis)
14. [Time & Clock Testing](#14-time--clock-testing)
15. [Exception & Error Testing](#15-exception--error-testing)
16. [Test Coverage](#16-test-coverage)
17. [CI/CD Integration](#17-cicd-integration)
18. [Common Anti-Patterns](#18-common-anti-patterns)
19. [Projects Studied](#19-projects-studied)

---

## 1. Mindset Shift

Amateur Python tests _check behavior_. Production Python tests check behavior **deterministically, in isolation, at speed, and with enough specificity to make failures self-documenting**.

| Amateur | Production |
| --- | --- |
| `unittest.TestCase` everywhere | pytest-native functions with fixtures |
| `mock.patch` scattered throughout | Fakes injected via constructor DI |
| Tests that pass locally, fail in CI | `autouse` fixtures reset global state |
| One giant test file | Mirror of `src/` structure under `tests/` |
| Test the database with the real database | Fast fakes for unit tests; real DB in integration tests |
| Skip async code | `pytest-asyncio` with `asyncio_mode = "auto"` |
| `assert result == expected` | Domain-specific assertions with clear failure messages |
| Coverage as a goal | Coverage as a signal — gaps indicate untested branches |
| Flaky tests left in | Every flaky test is a blocking bug |
| No CI gates | `--strict-markers`, warnings treated as errors |

The production mindset: **a test suite is a second codebase. It has the same quality requirements as production code.**

---

## 2. The Python Test Trophy

```
               ╱  E2E Tests  ╲           (Few — critical paths only)
              ╱  Integration   ╲         (Many — layers wired together)
             ╱   Unit Tests     ╲        (Some — pure logic, use cases)
            ╱  Static Analysis   ╲       (Always — mypy strict, ruff)
```

**Key insight from studying top repos:** The trophy is heavier in the middle than you think. Integration tests (FastAPI `TestClient`, SQLAlchemy against SQLite, httpx `MockTransport`) give high confidence with manageable complexity. Pure unit tests with fakes handle the business logic. E2E tests are reserved for smoke-testing deployed services.

### What Lives Where

| Layer | Tests | Tools |
| --- | --- | --- |
| Static | mypy, ruff | Pre-commit, CI |
| Unit | Use cases, domain logic, pure functions | pytest + fakes |
| Integration | API endpoints, database round-trips, queue producers | pytest + TestClient + SQLite/test DB |
| E2E | Critical user journeys in staging | pytest + real services |

---

## 3. Project Structure

Mirror `src/` under `tests/`. Every module has a test file. Flat is fine for small projects; nested mirrors src layout for larger ones.

```
myapp/
├── src/
│   └── myapp/
│       ├── domain/
│       │   ├── models.py
│       │   ├── use_cases.py
│       │   └── exceptions.py
│       ├── infrastructure/
│       │   ├── db/
│       │   │   └── repositories.py
│       │   └── http/
│       │       └── clients.py
│       └── presentation/
│           └── api/
│               └── routes.py
├── tests/
│   ├── conftest.py           # Session/module-scoped shared fixtures
│   ├── fakes/
│   │   ├── __init__.py
│   │   ├── fake_repository.py
│   │   ├── fake_payment.py
│   │   └── fake_http_client.py
│   ├── domain/
│   │   ├── conftest.py       # Domain-specific fixtures
│   │   ├── test_models.py
│   │   └── test_use_cases.py
│   ├── infrastructure/
│   │   ├── conftest.py       # DB fixtures
│   │   └── test_repositories.py
│   └── presentation/
│       ├── conftest.py       # Client fixtures
│       └── test_routes.py
└── pyproject.toml
```

### Rules

1. `tests/` is NOT a package — no `__init__.py` at the root. This avoids import conflicts.
2. `fakes/` is a first-class directory alongside your test subdirectories. Fakes are reused across layers.
3. `conftest.py` at each level: session-scoped heavy setup at root, test-scoped cheap fixtures near the tests that use them.
4. Name test files `test_<module_name>.py`. Name test classes `TestFeatureName`. Name test functions `test_<behavior>_<condition>`.

---

## 4. pytest Configuration

### Complete pyproject.toml

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["src"]
asyncio_mode = "auto"          # All async tests run with asyncio automatically
addopts = [
    "-v",
    "--tb=short",
    "--strict-markers",         # Unknown markers = error (catches typos)
    "--strict-config",          # Unknown config keys = error
    "--cov=src",
    "--cov-report=term-missing",
    "--cov-report=xml",
    "--cov-fail-under=85",
]
markers = [
    "slow: marks tests as slow (deselect with '-m not slow')",
    "integration: tests that require external services",
    "e2e: end-to-end tests against real services",
]
filterwarnings = [
    "error",                                    # All warnings become errors
    "ignore::DeprecationWarning:botocore",      # Third-party noise
    "ignore::PendingDeprecationWarning",
]
```

### Key Settings Explained

**`asyncio_mode = "auto"`** — Used by FastAPI, SQLAlchemy, httpx, Starlette. Every `async def test_*` runs under asyncio without needing `@pytest.mark.asyncio` on each one.

**`--strict-markers`** — Prevents silently skipped tests when a marker name is misspelled. Seen in pytest, Django, and Black repos.

**`filterwarnings = ["error"]`** — Turns all warnings into errors. Forces you to fix deprecations before they become bugs. Used in Pydantic, httpx, attrs.

**`--cov-fail-under=85`** — CI fails if coverage drops below 85%. The exact number matters less than the fact that it's enforced.

---

## 5. Fixtures & conftest.py

### Fixture Scope Decision Tree

```
How expensive is setup?
├── Cheap (< 1ms, no I/O) → function scope (default)
│   └── Examples: dataclass instances, fakes, simple config
├── Moderate (DB connection, app creation) → module scope
│   └── Examples: TestClient, SQLite engine
└── Expensive (real network, process startup) → session scope
    └── Examples: Docker containers, real database, compiled regex
```

### The Canonical conftest.py

```python
# tests/conftest.py
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

# ── Database ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def engine():
    """Create in-memory SQLite engine for the entire test session."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    return engine

@pytest.fixture(scope="session")
async def create_tables(engine):
    """Create all tables once per session."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest.fixture
async def db_session(engine, create_tables):
    """
    Each test gets a session wrapped in a transaction that is rolled back.

    This pattern (used by SQLAlchemy's own test suite) means tests never
    commit to the real database and never leave debris for subsequent tests.
    """
    async with engine.begin() as conn:
        session = AsyncSession(bind=conn)
        yield session
        await session.close()
        await conn.rollback()

# ── Environment isolation ─────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def reset_env(monkeypatch):
    """
    Clear known env vars before every test.
    Pattern from pytest's own test suite: autouse=True for global reset.
    Never let one test's env mutations leak into another.
    """
    for var in ("APP_API_KEY", "APP_DATABASE_URL", "APP_DEBUG"):
        monkeypatch.delenv(var, raising=False)

# ── Settings override ─────────────────────────────────────────────────────────

@pytest.fixture
def test_settings():
    """Safe settings for tests — never real credentials."""
    return Settings(
        database_url="sqlite+aiosqlite:///:memory:",
        api_key=SecretStr("test-key-never-real"),
        debug=True,
    )
```

### Fixture Patterns from Top Repos

**Pattern 1: Yield for cleanup (universal)**

```python
# From requests, httpx, Starlette — every resource fixture
@pytest.fixture
def tmp_dir(tmp_path):
    """Use pytest's built-in tmp_path — auto-cleaned after each test."""
    work_dir = tmp_path / "work"
    work_dir.mkdir()
    yield work_dir
    # tmp_path cleanup happens automatically
```

**Pattern 2: Factory fixtures (factory_boy pattern)**

Instead of creating one specific instance, return a factory:

```python
# tests/conftest.py
@pytest.fixture
def make_order():
    """
    Return a factory function. Tests call it with only the fields they care about.
    Remaining fields get sensible defaults.
    """
    def _make(
        customer_id: str = "cust-1",
        status: OrderStatus = OrderStatus.ACTIVE,
        lines: list[OrderLine] | None = None,
    ) -> Order:
        return Order(
            id=str(uuid4()),
            customer_id=customer_id,
            status=status,
            lines=lines or [
                OrderLine(product_id="prod-1", quantity=1, unit_price=Decimal("10.00"))
            ],
            created_at=datetime(2024, 1, 15, tzinfo=UTC),
        )
    return _make

# In tests:
def test_active_order(make_order):
    order = make_order(status=OrderStatus.ACTIVE)
    # Only specifying what matters; defaults handle the rest
```

**Pattern 3: Fixture parametrization for multiple backends**

```python
# From SQLAlchemy and aiohttp test suites
@pytest.fixture(params=["sqlite", "postgres"])
def db_url(request):
    if request.param == "sqlite":
        return "sqlite+aiosqlite:///:memory:"
    return os.environ.get("TEST_POSTGRES_URL", pytest.skip("No Postgres URL"))

@pytest.fixture
async def db_session(db_url):
    engine = create_async_engine(db_url)
    # ... setup
```

**Pattern 4: `autouse` for global test isolation (pytest's own pattern)**

```python
@pytest.fixture(autouse=True)
def no_real_http(respx_mock):
    """
    Prevent any real HTTP calls in unit tests.
    If a test accidentally calls a real URL, it fails immediately.
    Tests that need HTTP must explicitly configure respx.
    """
    pass  # respx blocks all by default

@pytest.fixture(autouse=True)
def reset_global_state():
    """Reset any module-level caches between tests."""
    yield
    # Clear after
    some_module._cache.clear()
    some_module._registry.clear()
```

---

## 6. Fakes vs Mocks: The Core Principle

**Mocks verify interactions. Fakes replace behavior.**

After studying 20 repos, the pattern is clear:

- **Fakes** (handwritten in-memory implementations) are the production standard for repository, event bus, email sender, payment processor, and other stateful dependencies.
- **`unittest.mock.patch`** is acceptable for stateless, leaf-level dependencies: current time, random UUIDs, file system calls.
- **`MagicMock` for every dependency** is an anti-pattern that makes tests tightly coupled to implementation details.

### Why Fakes Beat Mocks

```python
# ❌ Mock approach — breaks when you rename a method
def test_with_mock():
    repo = MagicMock()
    repo.get_by_id.return_value = Order(...)
    service = OrderService(repo=repo, ...)

    result = service.process(order_id="1")

    repo.save.assert_called_once_with(...)  # Breaks if save() becomes persist()

# ✓ Fake approach — survives refactoring, reads clearly
def test_with_fake(make_order):
    repo = FakeOrderRepository()
    existing = make_order(id="1", status=OrderStatus.ACTIVE)
    repo.seed(existing)  # Or repo.orders["1"] = existing
    service = OrderService(repo=repo, ...)

    result = service.process(order_id="1")

    saved = await repo.get_by_id(result.id)
    assert saved.status == OrderStatus.COMPLETED  # Assert on state, not calls
```

### When to Actually Use Mocks

```python
# ✓ Mocking leaf utilities — pure functions, no state
def test_with_patched_uuid():
    with patch("myapp.domain.use_cases.uuid4", return_value=uuid.UUID("abc...")):
        result = create_order(request)
        assert result.id == "abc..."

# ✓ Mocking to test error handling
def test_handles_connection_error():
    repo = FakeOrderRepository()
    payment = MagicMock()
    payment.charge.side_effect = ConnectionError("timeout")

    with pytest.raises(ExternalServiceError, match="payment"):
        await use_case.execute(request)

# ✓ Asserting a side effect occurred (event published, email sent)
def test_publishes_event():
    events = MagicMock()
    await use_case.execute(request)
    events.publish.assert_called_once_with(OrderCreated(order_id=ANY))
```

---

## 7. Fake Patterns

### The Standard Fake Repository

```python
# tests/fakes/fake_repository.py
from __future__ import annotations
from typing import Protocol

class FakeOrderRepository:
    """
    In-memory implementation of OrderRepository.
    State is fully inspectable from tests.

    Used across all use case tests. Costs zero I/O.
    """

    def __init__(self) -> None:
        self._orders: dict[str, Order] = {}
        self.save_call_count: int = 0  # Expose call counts only for critical paths

    # ── Seeding ──────────────────────────────────────────────────────────────

    def seed(self, *orders: Order) -> None:
        """Pre-populate for test setup. Explicit and readable."""
        for order in orders:
            self._orders[order.id] = order

    # ── Interface implementation ──────────────────────────────────────────────

    async def get_by_id(self, order_id: str) -> Order | None:
        return self._orders.get(order_id)

    async def save(self, order: Order) -> Order:
        self._orders[order.id] = order
        self.save_call_count += 1
        return order

    async def list_active(self) -> list[Order]:
        return [o for o in self._orders.values() if o.status == OrderStatus.ACTIVE]

    async def delete(self, order_id: str) -> None:
        self._orders.pop(order_id, None)

    # ── Test helpers ──────────────────────────────────────────────────────────

    def all(self) -> list[Order]:
        """Direct state inspection for assertions."""
        return list(self._orders.values())

    def count(self) -> int:
        return len(self._orders)
```

### Fake with Configurable Failures

```python
# tests/fakes/fake_payment.py
@dataclass
class FakePaymentProcessor:
    """
    Fake payment processor with configurable failure modes.

    Tests the failure path without needing Stripe test mode.
    """
    should_fail: bool = False
    failure_message: str = "Payment declined"
    charge_history: list[Decimal] = field(default_factory=list)

    async def charge(self, amount: Decimal) -> PaymentResult:
        if self.should_fail:
            raise PaymentFailedError(self.failure_message)
        self.charge_history.append(amount)
        return PaymentResult(
            transaction_id=f"fake-txn-{len(self.charge_history)}",
            amount=amount,
        )

    async def refund(self, transaction_id: str) -> None:
        # No-op unless test specifically checks refunds
        pass
```

### Fake for Event Bus

```python
# tests/fakes/fake_events.py
@dataclass
class FakeEventBus:
    """Captures published events for assertion."""
    events: list[object] = field(default_factory=list)

    async def publish(self, event: object) -> None:
        self.events.append(event)

    def published_of_type(self, event_type: type) -> list:
        return [e for e in self.events if isinstance(e, event_type)]

    def assert_published_once(self, event_type: type, **attrs) -> None:
        matching = self.published_of_type(event_type)
        assert len(matching) == 1, f"Expected 1 {event_type.__name__}, got {len(matching)}"
        event = matching[0]
        for key, value in attrs.items():
            assert getattr(event, key) == value, f"event.{key}: expected {value!r}, got {getattr(event, key)!r}"

# In tests:
def test_order_created_event_published(make_order):
    events = FakeEventBus()
    use_case = CreateOrderUseCase(repo=FakeOrderRepository(), events=events, ...)

    order = await use_case.execute(request)

    events.assert_published_once(OrderCreated, order_id=order.id)
```

### Fake HTTP Client

```python
# tests/fakes/fake_http_client.py
@dataclass
class FakeHttpClient:
    """
    Replaces httpx.AsyncClient in tests.
    Configure responses per URL.
    """
    _responses: dict[str, httpx.Response] = field(default_factory=dict)
    _calls: list[tuple[str, str]] = field(default_factory=list)  # (method, url)

    def configure(self, method: str, url: str, *, status: int = 200, json: dict | None = None) -> None:
        self._responses[f"{method.upper()}:{url}"] = httpx.Response(
            status_code=status,
            json=json or {},
        )

    async def get(self, url: str, **kwargs) -> httpx.Response:
        return self._respond("GET", url)

    async def post(self, url: str, **kwargs) -> httpx.Response:
        return self._respond("POST", url)

    def _respond(self, method: str, url: str) -> httpx.Response:
        self._calls.append((method, url))
        key = f"{method}:{url}"
        if key not in self._responses:
            raise AssertionError(f"Unexpected {method} request to {url}")
        return self._responses[key]

    def assert_called_once_with(self, method: str, url: str) -> None:
        matching = [(m, u) for m, u in self._calls if m == method and u == url]
        assert len(matching) == 1, f"Expected 1 {method} {url}, got {len(matching)}"
```

### Structural Protocol Checking

All fakes should be validated against the interface they implement:

```python
# tests/fakes/fake_repository.py
from typing import runtime_checkable, Protocol

@runtime_checkable
class OrderRepository(Protocol):
    async def get_by_id(self, order_id: str) -> Order | None: ...
    async def save(self, order: Order) -> Order: ...
    async def list_active(self) -> list[Order]: ...

# In test or type checker — validates structural compatibility
def test_fake_satisfies_protocol():
    fake = FakeOrderRepository()
    assert isinstance(fake, OrderRepository), "FakeOrderRepository missing required methods"
```

---

## 8. Async Testing

### Setup: pytest-asyncio

```toml
# pyproject.toml
[tool.pytest.ini_options]
asyncio_mode = "auto"  # No @pytest.mark.asyncio needed on individual tests
```

```toml
[project.optional-dependencies]
dev = [
    "pytest-asyncio>=0.23",
    "anyio[trio]>=4.0",   # Optional: for testing with both asyncio and trio backends
]
```

### The Right Pattern (from FastAPI, httpx, Starlette)

```python
# tests/domain/test_use_cases.py
import pytest

# With asyncio_mode = "auto", all async tests just work
class TestCreateOrderUseCase:
    @pytest.fixture
    def repo(self) -> FakeOrderRepository:
        return FakeOrderRepository()

    @pytest.fixture
    def payment(self) -> FakePaymentProcessor:
        return FakePaymentProcessor()

    @pytest.fixture
    def events(self) -> FakeEventBus:
        return FakeEventBus()

    @pytest.fixture
    def use_case(self, repo, payment, events) -> CreateOrderUseCase:
        return CreateOrderUseCase(repo=repo, payment=payment, events=events)

    async def test_creates_order_successfully(self, use_case, repo):
        request = CreateOrderRequest(
            customer_id="cust-1",
            lines=[OrderLineRequest(product_id="prod-1", quantity=2, unit_price=10.0)],
        )

        order = await use_case.execute(request)

        assert order.customer_id == "cust-1"
        assert len(order.lines) == 2
        # Assert on state, not calls
        saved = await repo.get_by_id(order.id)
        assert saved is not None

    async def test_payment_failure_rolls_back(self, use_case, repo, payment):
        payment.should_fail = True
        request = CreateOrderRequest(
            customer_id="cust-1",
            lines=[OrderLineRequest(product_id="prod-1", quantity=1, unit_price=10.0)],
        )

        with pytest.raises(PaymentFailedError):
            await use_case.execute(request)

        # No order persisted
        assert repo.count() == 0
```

### Async Fixture Scope Warning

Async fixtures with `scope="session"` require a special loop setup. The standard pattern from pytest-asyncio docs and FastAPI:

```python
# conftest.py
import pytest
import asyncio

# For session-scoped async fixtures — create one event loop for the whole session
@pytest.fixture(scope="session")
def event_loop_policy():
    return asyncio.DefaultEventLoopPolicy()

# Preferred: use anyio for loop-agnostic async tests
# Then tests work under asyncio AND trio
@pytest.fixture(params=["asyncio", "trio"])
def anyio_backend(request):
    return request.param
```

### Testing Concurrent Code

```python
async def test_concurrent_requests_dont_interfere():
    """
    Test that concurrent operations on separate resources don't conflict.
    Pattern from aiohttp and httpx test suites.
    """
    repo = FakeOrderRepository()
    repo.seed(
        make_order(id="order-1"),
        make_order(id="order-2"),
    )

    async with asyncio.TaskGroup() as tg:
        t1 = tg.create_task(service.process("order-1"))
        t2 = tg.create_task(service.process("order-2"))

    assert t1.result().id == "order-1"
    assert t2.result().id == "order-2"

async def test_timeout_handled_gracefully():
    """Use asyncio.timeout for explicit timeout testing."""
    slow_service = SlowFakeService(delay=10.0)

    with pytest.raises(asyncio.TimeoutError):
        async with asyncio.timeout(0.1):
            await slow_service.process()
```

---

## 9. Database Testing

### The Transaction Rollback Pattern (SQLAlchemy's Own Test Suite)

The gold standard: each test wraps its operations in a transaction that is never committed. Rollback resets state instantly — no need to truncate tables or recreate the database.

```python
# tests/conftest.py
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, AsyncConnection
from sqlalchemy.orm import sessionmaker

@pytest.fixture(scope="session")
async def async_engine():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()

@pytest.fixture
async def db_session(async_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """
    Per-test session in a SAVEPOINT.

    The outer BEGIN never commits. Each test runs in a SAVEPOINT, which
    is rolled back at the end. The engine's connection is reused.

    This is the pattern used by SQLAlchemy's own test suite.
    """
    async with async_engine.connect() as conn:
        await conn.begin()
        # Use a nested (SAVEPOINT) transaction so the test can commit/rollback
        # its own subtransactions without affecting the outer transaction.
        await conn.begin_nested()

        session = AsyncSession(bind=conn, expire_on_commit=False)

        # Re-establish the nested transaction on each commit
        @event.listens_for(session.sync_session, "after_transaction_end")
        def reopen_nested(session, transaction):
            if not conn.sync_connection.in_nested_transaction():
                conn.sync_connection.begin_nested()

        yield session

        await session.close()
        await conn.rollback()
```

### Repository Integration Tests

```python
# tests/infrastructure/test_repositories.py

class TestPostgresOrderRepository:
    @pytest.fixture
    def repo(self, db_session) -> PostgresOrderRepository:
        # Inject the test session — same session the test uses
        return PostgresOrderRepository(session=db_session)

    async def test_save_and_retrieve(self, repo, make_order):
        order = make_order(customer_id="cust-1")

        saved = await repo.save(order)
        retrieved = await repo.get_by_id(saved.id)

        assert retrieved is not None
        assert retrieved.customer_id == "cust-1"
        assert retrieved.id == saved.id

    async def test_list_active_excludes_completed(self, repo, make_order):
        active = make_order(status=OrderStatus.ACTIVE)
        completed = make_order(status=OrderStatus.COMPLETED)
        await repo.save(active)
        await repo.save(completed)

        result = await repo.list_active()

        assert len(result) == 1
        assert result[0].id == active.id

    async def test_get_by_id_returns_none_for_missing(self, repo):
        result = await repo.get_by_id("nonexistent-id")
        assert result is None
```

### Django-Style Transactional Test Cases

For Django projects, use `TestCase` which wraps each test in a transaction:

```python
# Django pattern (from Django's own test suite)
from django.test import TestCase, TransactionTestCase

class OrderRepositoryTest(TestCase):
    """
    TestCase: each test in a transaction, rolled back automatically.
    Use for most tests — fast.
    """
    def setUp(self):
        self.order = Order.objects.create(customer_id="cust-1", status="active")

    def test_filter_active(self):
        completed = Order.objects.create(customer_id="cust-2", status="completed")
        active = Order.objects.filter(status="active")
        self.assertIn(self.order, active)
        self.assertNotIn(completed, active)

class OrderSignalTest(TransactionTestCase):
    """
    TransactionTestCase: actually commits. Use only when testing
    signals, ON COMMIT hooks, or LISTEN/NOTIFY.
    """
    def test_order_created_signal_fires(self):
        with self.assertRaises(OrderCreated):
            Order.objects.create(customer_id="cust-1", status="active")
```

---

## 10. HTTP & API Testing

### respx — The Modern httpx Mock (from httpx's Own Test Suite)

```python
# pyproject.toml
[project.optional-dependencies]
dev = ["respx>=0.20"]

# tests/infrastructure/test_clients.py
import respx
import httpx
import pytest

class TestStripeClient:
    @respx.mock  # Decorator blocks all real HTTP in this test
    async def test_successful_charge(self):
        respx.post("https://api.stripe.com/v1/charges").mock(
            return_value=httpx.Response(200, json={
                "id": "ch_123",
                "amount": 1000,
                "status": "succeeded",
            })
        )

        client = StripeClient(api_key="sk_test_fake")
        result = await client.charge(amount=1000, currency="usd")

        assert result.transaction_id == "ch_123"

    @respx.mock
    async def test_handles_rate_limit(self):
        respx.post("https://api.stripe.com/v1/charges").mock(
            return_value=httpx.Response(429, json={"error": "rate_limited"})
        )

        with pytest.raises(RateLimitError):
            await client.charge(amount=1000, currency="usd")

    @respx.mock
    async def test_retries_on_network_error(self):
        route = respx.post("https://api.stripe.com/v1/charges")
        route.side_effect = [
            httpx.ConnectError("timeout"),   # First call fails
            httpx.Response(200, json={"id": "ch_123", "status": "succeeded"}),  # Second succeeds
        ]

        result = await client.charge(amount=1000, currency="usd")

        assert route.call_count == 2
        assert result.transaction_id == "ch_123"
```

### responses — For requests-based Code

```python
# For code that uses the `requests` library (not httpx)
import responses as responses_mock

@responses_mock.activate
def test_github_api_client():
    responses_mock.add(
        responses_mock.GET,
        "https://api.github.com/users/octocat",
        json={"login": "octocat", "id": 1},
        status=200,
    )

    client = GithubClient(token="fake-token")
    user = client.get_user("octocat")

    assert user.login == "octocat"
```

### httpx Transport Pattern (from httpx's Own Test Suite)

The cleanest way to test httpx clients without external mocking libraries:

```python
class FakeTransport(httpx.AsyncBaseTransport):
    """
    Injected into AsyncClient.transport for hermetic HTTP testing.
    No network. No respx. Just pure response configuration.

    Pattern from httpx's own `_transports/mock.py`.
    """

    def __init__(self, handler) -> None:
        self._handler = handler

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        response = self._handler(request)
        if asyncio.iscoroutine(response):
            response = await response
        return response

# In tests:
def test_client_with_fake_transport():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/users/1":
            return httpx.Response(200, json={"id": 1, "name": "Alice"})
        return httpx.Response(404)

    transport = FakeTransport(handler)
    http_client = httpx.AsyncClient(transport=transport, base_url="https://api.example.com")

    # Inject the client via constructor DI
    api_client = UserApiClient(http_client=http_client)
    user = await api_client.get_user(1)

    assert user.name == "Alice"
```

---

## 11. FastAPI Testing

### The TestClient Pattern (from FastAPI and Starlette)

```python
# tests/presentation/conftest.py
import pytest
from fastapi.testclient import TestClient

from myapp.main import create_app
from myapp.di import get_order_repo, get_payment

@pytest.fixture(scope="module")
def app():
    return create_app()

@pytest.fixture
def fake_repo() -> FakeOrderRepository:
    return FakeOrderRepository()

@pytest.fixture
def client(app, fake_repo, db_session):
    """
    Override FastAPI dependencies with fakes.
    This is FastAPI's built-in testing mechanism — no patching needed.
    """
    app.dependency_overrides[get_order_repo] = lambda: fake_repo
    app.dependency_overrides[get_payment] = lambda: FakePaymentProcessor()

    with TestClient(app, raise_server_exceptions=True) as c:
        yield c

    # Always clear overrides — don't let one test's overrides leak
    app.dependency_overrides.clear()
```

### Testing Endpoints

```python
# tests/presentation/test_routes.py

class TestOrderEndpoints:
    def test_create_order_returns_201(self, client, fake_repo):
        response = client.post("/orders", json={
            "customer_id": "cust-1",
            "lines": [{"product_id": "prod-1", "quantity": 2, "unit_price": 10.0}],
        })

        assert response.status_code == 201
        data = response.json()
        assert data["customer_id"] == "cust-1"
        # Verify it was actually persisted
        assert fake_repo.count() == 1

    def test_create_order_validates_input(self, client):
        response = client.post("/orders", json={
            "customer_id": "",  # Invalid — empty string
            "lines": [],        # Invalid — empty list
        })

        assert response.status_code == 422
        errors = response.json()["detail"]
        assert any(e["loc"] == ["body", "customer_id"] for e in errors)

    def test_get_order_returns_404_for_missing(self, client):
        response = client.get("/orders/nonexistent-id")

        assert response.status_code == 404

    def test_auth_required(self, client):
        """No auth header — 401."""
        response = client.get("/orders/any-id")
        # If the endpoint requires auth:
        assert response.status_code == 401

    @pytest.mark.parametrize("method,path", [
        ("GET", "/orders"),
        ("POST", "/orders"),
        ("GET", "/orders/1"),
        ("DELETE", "/orders/1"),
    ])
    def test_requires_authentication(self, app, method, path):
        """All order endpoints require auth — test all at once."""
        unauthenticated_client = TestClient(app)
        response = unauthenticated_client.request(method, path)
        assert response.status_code in (401, 403)
```

### Async TestClient (for ASGI lifespan events)

```python
# When startup/shutdown events matter (DB pool creation, etc.)
@pytest.fixture
async def async_client(app) -> AsyncGenerator[httpx.AsyncClient, None]:
    """
    Use ASGI transport for full lifespan testing.
    Pattern from Starlette's own test suite.
    """
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client

async def test_health_check(async_client):
    response = await async_client.get("/health")
    assert response.status_code == 200
```

---

## 12. Parametrize & Test Builders

### pytest.mark.parametrize: The Right Way

```python
# ❌ Brittle — no IDs, hard to identify which case failed
@pytest.mark.parametrize("quantity,price,expected", [
    (1, Decimal("10.00"), Decimal("10.00")),
    (5, Decimal("10.00"), Decimal("50.00")),
    (0, Decimal("10.00"), None),
])

# ✓ With IDs — failure message includes the case name
@pytest.mark.parametrize("quantity,price,expected", [
    pytest.param(1, Decimal("10.00"), Decimal("10.00"), id="single-item"),
    pytest.param(5, Decimal("10.00"), Decimal("50.00"), id="five-items"),
    pytest.param(0, Decimal("10.00"), None, id="zero-quantity-invalid"),
])
def test_order_line_subtotal(quantity, price, expected):
    if expected is None:
        with pytest.raises(ValueError):
            OrderLine(product_id="p1", quantity=quantity, unit_price=price)
    else:
        line = OrderLine(product_id="p1", quantity=quantity, unit_price=price)
        assert line.subtotal == expected
```

### Parametrize for Error Cases

```python
@pytest.mark.parametrize("invalid_input,expected_error", [
    pytest.param("", "customer_id cannot be empty", id="empty-customer"),
    pytest.param("x" * 256, "customer_id too long", id="too-long-customer"),
    pytest.param(None, "customer_id is required", id="null-customer"),
], indirect=False)
def test_create_order_validation_errors(invalid_input, expected_error):
    with pytest.raises(ValidationError, match=expected_error):
        CreateOrderRequest(customer_id=invalid_input, lines=[...])
```

### Test Builders (The `make_*` Pattern)

Centralizes default values. Tests only specify what they care about.

```python
# tests/builders.py — or in conftest.py as factories

def make_order(
    *,
    id: str | None = None,
    customer_id: str = "default-customer",
    status: OrderStatus = OrderStatus.ACTIVE,
    lines: list[OrderLine] | None = None,
    created_at: datetime | None = None,
) -> Order:
    return Order(
        id=id or str(uuid4()),
        customer_id=customer_id,
        status=status,
        lines=lines or [make_order_line()],
        created_at=created_at or datetime(2024, 1, 15, 12, 0, tzinfo=UTC),
    )

def make_order_line(
    *,
    product_id: str = "prod-1",
    quantity: int = 1,
    unit_price: Decimal = Decimal("10.00"),
) -> OrderLine:
    return OrderLine(product_id=product_id, quantity=quantity, unit_price=unit_price)

# Tests become expressive:
def test_completed_order_not_in_active_list():
    order = make_order(status=OrderStatus.COMPLETED)
    # Only the relevant field differs — everything else has sensible defaults
```

### factory_boy for Django ORM

```python
# tests/factories.py
import factory
from factory.django import DjangoModelFactory

class UserFactory(DjangoModelFactory):
    class Meta:
        model = User

    username = factory.Sequence(lambda n: f"user{n}")
    email = factory.LazyAttribute(lambda obj: f"{obj.username}@example.com")
    is_active = True

class OrderFactory(DjangoModelFactory):
    class Meta:
        model = Order

    customer = factory.SubFactory(UserFactory)
    status = "active"

    class Params:
        completed = factory.Trait(status="completed")

# In tests:
def test_active_orders():
    OrderFactory.create_batch(3)                    # 3 active orders
    OrderFactory.create(status="completed")         # 1 completed
    OrderFactory.create(completed=True)             # Same as above — using Trait

    active = Order.objects.filter(status="active")
    assert active.count() == 3
```

---

## 13. Property-Based Testing with Hypothesis

Hypothesis generates hundreds of test cases from a single `@given`. It finds edge cases you never thought of.

### When to Use Hypothesis

- **Serialization/deserialization roundtrips** — encode then decode → same value
- **Sort/search invariants** — sorted output is always sorted
- **Domain constraints** — total is always sum of line items
- **Parsing** — valid input never crashes the parser
- **Value objects** — constructed value satisfies its invariants

### Basic Patterns

```python
from hypothesis import given, assume, settings, HealthCheck
from hypothesis import strategies as st

# ── Roundtrip tests ───────────────────────────────────────────────────────────

@given(st.emails())
def test_email_value_object_roundtrip(email_str):
    """Email normalizes to lowercase. Round-tripping gives the same value."""
    email = Email(email_str)
    email2 = Email(email.value)
    assert email == email2

@given(st.decimals(min_value=Decimal("0.01"), max_value=Decimal("99999.99"), places=2))
def test_order_line_subtotal_roundtrip(price):
    """Subtotal = unit_price × quantity. Must hold for all valid prices."""
    line = OrderLine(product_id="p1", quantity=1, unit_price=price)
    assert line.subtotal == price

# ── Invariant tests ───────────────────────────────────────────────────────────

@given(
    st.lists(
        st.decimals(min_value=Decimal("0.01"), max_value=Decimal("100"), places=2),
        min_size=1,
        max_size=20,
    )
)
def test_order_total_equals_sum_of_lines(prices):
    lines = [OrderLine(product_id=f"p{i}", quantity=1, unit_price=p) for i, p in enumerate(prices)]
    order = Order(id="o1", customer_id="c1", lines=tuple(lines), status=OrderStatus.ACTIVE)
    assert order.total == sum(line.subtotal for line in lines)

# ── Parsing invariants ────────────────────────────────────────────────────────

@given(st.text(min_size=1, max_size=1000))
def test_task_extractor_never_crashes(text):
    """Any text input must produce a result or raise a specific exception — never crash."""
    try:
        result = extract_task(text)
        assert isinstance(result, str)
        assert len(result) > 0
    except TaskExtractionError:
        pass  # Expected for invalid input
    # Any other exception = test failure

# ── Composite strategies ──────────────────────────────────────────────────────

order_status = st.sampled_from(OrderStatus)

@st.composite
def orders(draw):
    """Custom strategy for valid Order instances."""
    n_lines = draw(st.integers(min_value=1, max_value=10))
    prices = draw(st.lists(
        st.decimals(min_value=Decimal("0.01"), max_value=Decimal("100"), places=2),
        min_size=n_lines, max_size=n_lines,
    ))
    lines = tuple(
        OrderLine(product_id=f"p{i}", quantity=1, unit_price=p)
        for i, p in enumerate(prices)
    )
    return Order(
        id=draw(st.uuids()).hex,
        customer_id=draw(st.text(min_size=1, max_size=50)),
        lines=lines,
        status=draw(order_status),
    )

@given(orders())
def test_serialization_roundtrip(order: Order):
    """Serialize to dict and back — must be identical."""
    serialized = order_to_dict(order)
    restored = order_from_dict(serialized)
    assert restored == order
```

### Hypothesis Configuration

```python
# tests/conftest.py
from hypothesis import settings, HealthCheck

# Default profile — fast, for CI
settings.register_profile("ci", max_examples=100, suppress_health_check=[HealthCheck.too_slow])

# Thorough profile — for deeper exploration
settings.register_profile("thorough", max_examples=500)

# Default to CI profile
settings.load_profile("ci")
```

```bash
# Run with thorough profile when debugging
HYPOTHESIS_PROFILE=thorough pytest tests/
```

---

## 14. Time & Clock Testing

Never call `datetime.now()` or `time.time()` directly in business logic. Pass a clock as a dependency or use `freezegun`.

### freezegun (Universal)

```python
from freezegun import freeze_time
from datetime import datetime, UTC

@freeze_time("2024-01-15 12:00:00")
def test_order_timestamp():
    """
    freeze_time patches datetime.now(), datetime.utcnow(), time.time(),
    and date.today() globally for the duration of the test.
    """
    order = Order.create(customer_id="cust-1", lines=[...])
    assert order.created_at == datetime(2024, 1, 15, 12, 0, 0, tzinfo=UTC)

@freeze_time("2024-01-15 11:50:00")
async def test_order_expires_after_10_minutes():
    order = Order.create(customer_id="cust-1", lines=[...])

    # Advance time by 11 minutes
    with freeze_time("2024-01-15 12:01:00"):
        assert order.is_expired()

# Works as a context manager for partial-test time control:
def test_order_created_before_deadline():
    with freeze_time("2024-12-31 23:59:59"):
        order = Order.create(customer_id="cust-1", lines=[...])
    assert order.created_before_deadline(deadline=datetime(2025, 1, 1, tzinfo=UTC))
```

### Clock Protocol (Better for Type Safety)

```python
# domain/ports.py
from typing import Protocol
from datetime import datetime

class Clock(Protocol):
    def now(self) -> datetime: ...

# domain/clocks.py
class SystemClock:
    def now(self) -> datetime:
        return datetime.now(UTC)

# tests/fakes/fake_clock.py
@dataclass
class FakeClock:
    current_time: datetime = datetime(2024, 1, 15, 12, 0, 0, tzinfo=UTC)

    def now(self) -> datetime:
        return self.current_time

    def advance(self, **kwargs) -> None:
        """Advance time by a delta."""
        self.current_time += timedelta(**kwargs)

    def set(self, dt: datetime) -> None:
        self.current_time = dt

# In tests:
async def test_deferred_task_becomes_active():
    clock = FakeClock(current_time=datetime(2024, 1, 15, 12, 0, 0, tzinfo=UTC))
    repo = FakeTaskRepository()
    service = TaskService(repo=repo, clock=clock)

    task = await service.defer(task_id="1", hours=4)
    assert task.status == TaskStatus.DEFERRED

    # Advance past the defer deadline
    clock.advance(hours=5)

    due_tasks = await service.get_due_tasks()
    assert len(due_tasks) == 1
    assert due_tasks[0].id == "1"
```

---

## 15. Exception & Error Testing

### The Right Way to Assert Exceptions

```python
# ❌ Wrong — doesn't check what was raised
def test_invalid_email_raises():
    try:
        Email("")
        assert False, "Should have raised"
    except ValueError:
        pass

# ✓ With pytest.raises — cleaner, no assertion errors on success
def test_invalid_email_raises():
    with pytest.raises(ValueError):
        Email("")

# ✓ With match — verifies the message too
def test_invalid_email_message():
    with pytest.raises(ValueError, match="Invalid email"):
        Email("not-an-email")

# ✓ Inspecting the exception
def test_payment_failure_has_context():
    with pytest.raises(PaymentFailedError) as exc_info:
        PaymentService().charge(amount=Decimal("-1"))

    err = exc_info.value
    assert err.amount == Decimal("-1")
    assert "negative" in str(err).lower()

# ✓ Exception chaining — verify the cause
def test_database_error_is_wrapped():
    with pytest.raises(RepositoryError) as exc_info:
        await broken_repo.save(order)

    # Verify the original exception is chained
    assert exc_info.value.__cause__ is not None
    assert isinstance(exc_info.value.__cause__, (SQLAlchemyError, IntegrityError))
```

### Testing Custom Exception Hierarchy

```python
class TestExceptionHierarchy:
    def test_validation_error_is_app_error(self):
        err = ValidationError("bad input")
        assert isinstance(err, AppError)

    def test_not_found_error_is_app_error(self):
        err = NotFoundError("order", "order-1")
        assert isinstance(err, AppError)

    def test_external_service_error_carries_service_name(self):
        err = ExternalServiceError("stripe", "Connection refused")
        assert err.service == "stripe"
        assert "stripe" in str(err)
```

### Testing the Error Boundary (FastAPI)

```python
def test_not_found_returns_404(client):
    response = client.get("/orders/nonexistent")

    assert response.status_code == 404
    assert response.json() == {"detail": "Order not found"}

def test_validation_error_returns_422_with_details(client):
    response = client.post("/orders", json={"customer_id": ""})

    assert response.status_code == 422
    errors = response.json()["detail"]
    field_errors = {e["loc"][-1]: e["msg"] for e in errors}
    assert "customer_id" in field_errors

def test_internal_server_error_doesnt_leak_details(client):
    """Production: 500 errors must not expose internal state."""
    # Trigger an unhandled error
    response = client.get("/orders/trigger-error")

    assert response.status_code == 500
    body = response.json()
    assert "traceback" not in str(body)
    assert "sqlalchemy" not in str(body).lower()
```

---

## 16. Test Coverage

### What Coverage Means

Coverage measures which lines were _executed_, not whether the assertions are meaningful. A test with `assert True` achieves 100% coverage while testing nothing.

**Use coverage as a gap detector, not a quality metric.**

### The Right Coverage Configuration

```toml
# pyproject.toml
[tool.coverage.run]
source = ["src"]
branch = true          # Branch coverage, not just line coverage
omit = [
    "src/*/migrations/*",
    "src/*/cli.py",      # Entry points — tested via integration
    "src/*/conftest.py",
    "src/*/settings.py", # Config — tested via settings tests
]

[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "if TYPE_CHECKING:",
    "if __name__ == .__main__.:",
    "raise NotImplementedError",
    "@overload",
    "\\.\\.\\.",          # Protocol/ABC method bodies
]
fail_under = 85
```

### Branch Coverage: Why It Matters

```python
def process(order: Order) -> str:
    if order.status == OrderStatus.ACTIVE:
        return "active"
    return "inactive"
```

**Line coverage 100%:** One test with `ACTIVE` hits both lines.
**Branch coverage:** Requires both `ACTIVE` and non-`ACTIVE` to execute the branch.

Always use `branch = true`. Line-only coverage misses half the logic.

### Coverage Targets by Module

| Module | Target | Rationale |
| --- | --- | --- |
| `domain/models.py` | 95-100% | Core data — no untested paths |
| `domain/use_cases.py` | 90-100% | Business logic — every path matters |
| `infrastructure/repositories.py` | 85-90% | Integration — some paths require real DB |
| `presentation/routes.py` | 85-90% | Tested via HTTP layer |
| `infrastructure/external_clients.py` | 70-80% | Error paths hard to simulate |
| `cli/main.py` | 50-70% | Entry point — smoke-tested manually |

### Finding Untested Branches

```bash
# Show which specific lines and branches are uncovered
pytest --cov=src --cov-report=html
open htmlcov/index.html

# In CI — fail if coverage drops
pytest --cov=src --cov-fail-under=85
```

---

## 17. CI/CD Integration

### The Fast/Slow Split

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  fast:
    name: Unit & Integration Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v4
      - run: uv sync --dev
      - run: uv run pytest -m "not slow and not e2e" --cov=src --cov-fail-under=85

  slow:
    name: Slow Tests
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'  # Only on merge to main
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v4
      - run: uv sync --dev
      - run: uv run pytest -m "slow or integration" --no-cov
        env:
          TEST_DATABASE_URL: "postgresql+asyncpg://postgres:test@localhost/test"
```

### Parallelizing Tests

```bash
# Install pytest-xdist
uv add --dev pytest-xdist

# Run with 4 workers
pytest -n 4

# Auto-detect CPU count
pytest -n auto
```

**Warning:** Tests that share state (module-level caches, global DB state, fixed ports) will fail with parallelism. `autouse` fixtures that reset state are prerequisites.

### Speed Marking

```python
# Slow tests explicitly marked
@pytest.mark.slow
async def test_bulk_import_10k_records():
    ...

@pytest.mark.integration
async def test_postgres_concurrent_writes():
    ...

# Run in CI: exclude slow tests on every push
# pytest -m "not slow and not integration"

# Run slow tests on schedule or merge to main
# pytest -m "slow or integration"
```

### Pre-Commit Hooks

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.4.0
    hooks:
      - id: ruff
      - id: ruff-format

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.10.0
    hooks:
      - id: mypy
        additional_dependencies: [types-all]

  - repo: local
    hooks:
      - id: fast-tests
        name: Fast tests
        entry: pytest -m "not slow and not integration" -x -q
        language: system
        pass_filenames: false
```

---

## 18. Common Anti-Patterns

### 1. `MagicMock` for Stateful Dependencies

**Symptom:** `repo = MagicMock()` everywhere. Tests specify `return_value` but never verify the repo's final state.

**Why it's wrong:** Tests become coupled to implementation (which methods are called) rather than behavior (what state results). Rename a method → all mocks break.

**Fix:** Write a fake. 30 lines of code. Lasts forever.

---

### 2. `patch` Decorators Stacked 3+ Deep

**Symptom:**
```python
@patch("myapp.service.uuid4")
@patch("myapp.service.datetime")
@patch("myapp.service.send_email")
@patch("myapp.service.save_to_db")
def test_something(mock_db, mock_email, mock_datetime, mock_uuid):
    ...
```

**Why it's wrong:** Four patches = four implementation details the test knows about. The function signature is unreadable. Any refactor breaks everything.

**Fix:** Constructor inject all four dependencies as fakes. One argument per fake, clearly named.

---

### 3. `sleep()` in Tests

**Symptom:** `time.sleep(0.5)` or `await asyncio.sleep(0.1)` to "let things settle."

**Why it's wrong:** Slow, flaky, and wrong on fast/slow machines. Tests that sleep are tests that don't understand what they're waiting for.

**Fix:** Use `FakeClock` to advance time explicitly. Use `asyncio.wait_for` with a timeout. Use event-driven synchronization primitives (`asyncio.Event`, `asyncio.Queue`).

---

### 4. Tests That Don't Actually Assert

**Symptom:**
```python
def test_process():
    result = service.process(order)
    # No assertion
```

**Why it's wrong:** The test passes even when `process` returns `None` instead of an `Order`.

**Fix:** Every test must assert on the observable effect. At minimum: the return value, the side effect (DB state, events published), or the exception raised.

---

### 5. Testing Implementation, Not Behavior

**Symptom:**
```python
def test_process_calls_save():
    repo = MagicMock()
    service.process(order)
    repo.save.assert_called_once()  # Tests HOW, not WHAT
```

**Why it's wrong:** You can change the implementation to call `repo.upsert()` instead, and the behavior is identical — but the test breaks.

**Fix:** Test the outcome. `assert (await repo.get_by_id(order.id)) is not None`. The test passes regardless of which repo method was called.

---

### 6. One Giant `conftest.py`

**Symptom:** 500-line `conftest.py` at the root with fixtures for every layer mixed together.

**Fix:** Each test directory gets its own `conftest.py`. Root `conftest.py` has only session-scoped, genuinely shared fixtures (DB engine, settings). Domain fixtures live in `tests/domain/conftest.py`. Integration fixtures live in `tests/infrastructure/conftest.py`.

---

### 7. Skipping Tests "Until Later"

**Symptom:** `@pytest.mark.skip(reason="TODO fix later")`

**Why it's wrong:** Skipped tests are undetected failures. They accumulate.

**Fix:** Either fix it now or delete it. If the behavior it tests is genuinely incomplete, write it as `pytest.raises(NotImplementedError)` until implemented.

---

### 8. No Test for the Error Path

**Symptom:** Every test is the happy path. The error handling code is never exercised.

**Fix:** For every use case test, write at least one test where a dependency fails. `FakePaymentProcessor(should_fail=True)`, `FakeRepository(raise_on_save=True)`. The error path is where real bugs hide.

---

### 9. Global State in Fixtures

**Symptom:**
```python
_db = None

@pytest.fixture(scope="session")
def database():
    global _db
    _db = create_database()
    return _db
```

**Why it's wrong:** Session-scope fixtures that mutate module globals leave state between test runs. Tests pass in isolation, fail in suite.

**Fix:** Yield from fixtures. All state lives in the fixture's local scope. Use the transaction rollback pattern so DB state resets between tests.

---

### 10. `assert "something" in response.text`

**Symptom:** String-matching on HTML or JSON responses instead of parsing and asserting on structure.

**Why it's wrong:** Breaks on whitespace changes, unrelated text changes, i18n.

**Fix:**
```python
# Bad
assert "Order created" in response.text

# Good
data = response.json()
assert data["status"] == "created"
assert "id" in data
```

---

## 19. Projects Studied

### Frameworks & Libraries
- [pytest](https://github.com/pytest-dev/pytest) — fixture patterns, autouse isolation, `pytester`, speed tiering
- [Django](https://github.com/django/django) — `TestCase` transaction wrapping, `TransactionTestCase`, `RequestFactory`, test DB creation
- [FastAPI](https://github.com/fastapi/fastapi) — `TestClient`, `dependency_overrides`, async test patterns
- [Starlette](https://github.com/encode/starlette) — `ASGITransport` pattern, `WebSocketTestSession`
- [SQLAlchemy](https://github.com/sqlalchemy/sqlalchemy) — transaction rollback fixtures, `testing/` infrastructure, fixture composition
- [Pydantic](https://github.com/pydantic/pydantic) — strict model validation tests, `filterwarnings = ["error"]`, parametrize for validation rules
- [attrs](https://github.com/python-attrs/attrs) — `hypothesis` + `attrs` integration, `@given(st.builds(...))`

### HTTP & Async
- [httpx](https://github.com/encode/httpx) — `MockTransport`, `ASGITransport`, async fixture patterns, network blocking in CI
- [aiohttp](https://github.com/aio-libs/aiohttp) — `pytest_aiohttp`, `aiohttp.test_utils.TestClient`, server lifecycle
- [requests](https://github.com/psf/requests) — `responses` library integration, `PreparedRequest` testing

### Testing Tools
- [Hypothesis](https://github.com/HypothesisWorks/hypothesis) — `@given`, `@st.composite`, profiles, `HealthCheck`, database strategy
- [factory_boy](https://github.com/FactoryBoy/factory_boy) — `DjangoModelFactory`, `SubFactory`, `LazyAttribute`, `Trait`
- [responses](https://github.com/getsentry/responses) — `@responses.activate`, callback responses, passthrough
- [freezegun](https://github.com/spulec/freezegun) — `@freeze_time`, `tick=True`, context manager usage
- [pytest-asyncio](https://github.com/pytest-dev/pytest-asyncio) — `asyncio_mode = "auto"`, `@pytest.fixture` for async, anyio backend parametrization

### Production SDKs
- [Sentry Python SDK](https://github.com/getsentry/sentry-python) — transport mocking, `sentry_sdk.test_utils`, envelope capture
- [Stripe Python](https://github.com/stripe/stripe-python) — VCR cassette pattern, test mode fixtures, webhook signature testing
- [botocore](https://github.com/boto/botocore) — `stubber` pattern for AWS API mocking, response caching
- [Celery](https://github.com/celery/celery) — `CELERY_TASK_ALWAYS_EAGER`, worker process testing
- [Black](https://github.com/psf/black) — `--check` integration tests, `dataclasses.replace` for test variations, output determinism
