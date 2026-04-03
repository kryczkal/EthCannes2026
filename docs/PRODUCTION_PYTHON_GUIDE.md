# Production-Ready Python Code: The Complete Guide

> A distilled guide for developers who can write Python but want to write Python at the level of the best teams in the world (Meta/Instagram, Stripe, Cash App, Dropbox, Google, Netflix).

---

## Table of Contents

1. [Mindset Shift](#1-mindset-shift)
2. [Project Structure](#2-project-structure)
3. [Architecture](#3-architecture)
4. [Python Discipline](#4-python-discipline)
5. [State Management](#5-state-management)
6. [Dependency Injection](#6-dependency-injection)
7. [Networking & APIs](#7-networking--apis)
8. [Local Storage & ORM](#8-local-storage--orm)
9. [Configuration](#9-configuration)
10. [Concurrency](#10-concurrency)
11. [Error Handling](#11-error-handling)
12. [Logging & Observability](#12-logging--observability)
13. [Testing](#13-testing)
14. [Build Configuration & Tooling](#14-build-configuration--tooling)
15. [Code Quality & Hygiene](#15-code-quality--hygiene)
16. [Performance](#16-performance)
17. [Security](#17-security)
18. [Common Anti-Patterns](#18-common-anti-patterns)
19. [Projects Studied](#19-projects-studied)

---

## 1. Mindset Shift

Amateur Python code _works_. Production Python code works **reliably, type-safely, testably, and maintainably at scale**.

| Amateur | Production |
| --- | --- |
| "It works on my machine" | "It passes mypy strict, tests on 3.11-3.13, and deploys in Docker" |
| No type hints | mypy strict on all new code |
| `except Exception: pass` | Custom exception hierarchies with structured logging |
| `pip install` into global | `uv` with lockfiles and reproducible environments |
| Mutable state everywhere | Frozen dataclasses, immutable by default |
| `print()` debugging | structlog with JSON output and trace correlation |
| "I'll add tests later" | Tests are part of the definition of done |
| `requirements.txt` | `pyproject.toml` as single source of truth |
| One giant `app.py` | Clean architecture with domain/application/infrastructure layers |
| Django/Flask conventions only | Protocols + constructor injection, framework-agnostic core |

The production Python mindset: **type everything, validate at boundaries, keep domain logic pure, and make impossible states unrepresentable.**

---

## 2. Project Structure

### The src Layout (Production Standard)

The `src` layout prevents accidental imports of uninstalled packages and ensures only installed code runs in tests. Flask, Click, requests, pytest, Poetry, and Black all use it.

```
myproject/
├── src/
│   └── myproject/
│       ├── __init__.py
│       ├── py.typed                # PEP 561 — type checker support
│       ├── domain/                 # Business logic, entities, value objects
│       │   ├── __init__.py
│       │   ├── models.py           # Domain models (frozen dataclasses)
│       │   ├── events.py           # Domain events
│       │   ├── exceptions.py       # Domain exceptions
│       │   └── ports/              # Interfaces (Protocols)
│       │       ├── __init__.py
│       │       └── repositories.py
│       ├── application/            # Use cases, orchestration
│       │   ├── __init__.py
│       │   └── use_cases/
│       │       ├── __init__.py
│       │       └── create_order.py
│       ├── infrastructure/         # Adapters (concrete implementations)
│       │   ├── __init__.py
│       │   ├── persistence/
│       │   │   ├── __init__.py
│       │   │   ├── postgres_repo.py
│       │   │   └── in_memory_repo.py
│       │   └── external/
│       │       ├── __init__.py
│       │       └── stripe_client.py
│       ├── presentation/           # API layer
│       │   ├── __init__.py
│       │   ├── api/
│       │   │   ├── __init__.py
│       │   │   ├── routes.py
│       │   │   └── schemas.py      # Pydantic request/response models
│       │   └── cli/
│       │       └── __init__.py
│       ├── _types.py               # Centralized type aliases
│       ├── _compat.py              # Version compatibility shims
│       └── config.py               # pydantic-settings
├── tests/
│   ├── conftest.py                 # Shared fixtures
│   ├── unit/
│   │   ├── conftest.py
│   │   └── test_models.py
│   ├── integration/
│   │   ├── conftest.py
│   │   └── test_repositories.py
│   └── e2e/
│       └── test_api.py
├── pyproject.toml                  # Single source of truth
├── uv.lock                        # Dependency lock file
├── Dockerfile
├── .pre-commit-config.yaml
└── .github/
    └── workflows/
        └── ci.yml
```

### Key Rules

1. **`src` layout is the default.** Prevents "it works in dev but not when installed" bugs. The Python Packaging User Guide recommends it for publishable packages.

2. **Domain layer has zero external dependencies.** No framework imports, no database imports, no HTTP imports. Pure Python.

3. **Dependencies point inward.** `presentation → application → domain`. Never the reverse. Infrastructure implements domain Protocols.

4. **Co-locate tests.** `tests/unit/` mirrors `src/myproject/domain/`. Integration tests mirror the infrastructure layer.

5. **`pyproject.toml` is the single source of truth.** Project metadata, dependencies, tool configuration (ruff, mypy, pytest) — all in one file.

6. **`py.typed` marker file.** Required for PEP 561 compliance. Every production Python package ships this.

7. **Centralized type aliases in `_types.py`.** HTTPX, FastAPI, Click, and PDM all follow this pattern — one file for all type aliases.

8. **Max 3-4 levels of nesting.** `src/myproject/infrastructure/persistence/postgres_repo.py` is fine. `src/myproject/features/orders/infrastructure/persistence/impl/v2/postgres_repo.py` is not.

### Module Layout Patterns from Top Projects

**Small Libraries (< 25 files):** Flat package, one file per concern:

```
httpx/
    __init__.py          # Public API with __all__
    _client.py           # Core implementation (private)
    _exceptions.py       # Exception hierarchy
    _types.py            # Type aliases
    _utils.py            # Internal utilities
    py.typed
```

**Large Frameworks (50+ files):** Domain-driven subpackages:

```
django/
    core/           # Core framework
    db/             # Database layer
    http/           # HTTP handling
    middleware/     # Middleware pipeline
    contrib/        # Reusable apps
```

---

## 3. Architecture

### The Production Consensus: Clean Architecture + Dependency Inversion

After studying FastAPI, Django, Celery, Dramatiq, SQLAlchemy, and patterns from Instagram, Stripe, and Cash App, the pattern is clear: **Clean Architecture layers with Protocol-based boundaries and constructor injection.**

```
┌─────────────────────────────────────┐
│  Presentation Layer (API/CLI)       │  FastAPI routes, CLI commands
├─────────────────────────────────────┤
│  Application Layer (Use Cases)      │  Orchestrates domain operations
├─────────────────────────────────────┤
│  Domain Layer (Models, Ports)       │  Pure Python, zero dependencies
├─────────────────────────────────────┤
│  Infrastructure Layer (Adapters)    │  Database, external APIs, queues
└─────────────────────────────────────┘
```

### The Dependency Rule

Dependencies point **inward** only. Domain knows nothing about infrastructure or presentation. Infrastructure implements domain Protocols.

```python
# domain/ports/repositories.py — Protocol, no implementation details
from typing import Protocol

class OrderRepository(Protocol):
    async def get_by_id(self, order_id: str) -> Order | None: ...
    async def save(self, order: Order) -> Order: ...
    async def list_active(self) -> list[Order]: ...

# infrastructure/persistence/postgres_repo.py — concrete, knows about DB
class PostgresOrderRepository:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def get_by_id(self, order_id: str) -> Order | None:
        async with self._session_factory() as session:
            entity = await session.get(OrderEntity, order_id)
            return entity.to_domain() if entity else None

    async def save(self, order: Order) -> Order:
        async with self._session_factory() as session:
            entity = OrderEntity.from_domain(order)
            session.add(entity)
            await session.commit()
            return order
```

### Use Case Pattern

Use cases are the application's entry points. They orchestrate domain operations and are the unit that gets tested:

```python
# application/use_cases/create_order.py
@dataclass(frozen=True)
class CreateOrderUseCase:
    repo: OrderRepository
    payment: PaymentProcessor
    events: EventPublisher

    async def execute(self, request: CreateOrderRequest) -> Order:
        order = Order.create(
            customer_id=request.customer_id,
            lines=[OrderLine.from_request(line) for line in request.lines],
        )

        payment_result = await self.payment.charge(order.total)
        if isinstance(payment_result, PaymentError):
            raise PaymentFailedError(payment_result.message)

        saved = await self.repo.save(order)
        await self.events.publish(OrderCreated(order_id=saved.id))
        return saved
```

### Protocol vs ABC Decision Tree

```
Can it be satisfied by structural subtyping (duck typing)?
├── Yes → Use Protocol (testable, no inheritance required, type-checker friendly)
└── No → Do you control the class hierarchy and want runtime enforcement?
    ├── Yes → Use ABC (abstract methods raise TypeError on instantiation)
    └── No → Use Protocol anyway
```

**Use Protocol when:** Defining interfaces for dependency injection, testing with fakes, cross-module boundaries.

**Use ABC when:** Base classes with shared implementation (e.g., Django's `View`, SQLAlchemy's `DeclarativeBase`, Dramatiq's `Middleware`).

### Component Sizing Guidelines

- **Functions < 20 lines:** Ideal
- **Functions 20-50 lines:** Acceptable for complex logic
- **Functions 50+ lines:** Almost certainly needs decomposition
- **Classes < 100 lines:** Ideal
- **Classes 100-200 lines:** Acceptable for coordinators
- **Classes 200+ lines:** Extract use cases or split responsibilities
- **Modules < 300 lines:** Ideal
- **Modules 500+ lines:** Split into a subpackage

---

## 4. Python Discipline

### Non-Negotiable Rules

**1. No `Any`.** Use `unknown` patterns, generics, or unions. `Any` silences the type checker — production code doesn't need it.

```python
# Bad — type checker gives up
def process(data: Any) -> Any:
    return data["key"]

# Good — explicit types
def process(data: dict[str, str]) -> str:
    return data["key"]

# Good — when type is truly unknown at definition time, use TypeVar
T = TypeVar("T")
def first(items: Sequence[T]) -> T:
    return items[0]
```

**2. No bare `except`.** Always catch specific exceptions. Bare `except` catches `KeyboardInterrupt`, `SystemExit`, and `MemoryError`.

```python
# Bad — hides bugs, swallows Ctrl+C
try:
    do_something()
except:
    pass

# Bad — still too broad
try:
    do_something()
except Exception:
    pass

# Good — specific exceptions
try:
    response = await client.get(url)
except (httpx.ConnectError, httpx.TimeoutException) as e:
    logger.warning("Request failed", url=url, error=str(e))
    raise ExternalServiceError("api", str(e)) from e
```

**3. Frozen dataclasses for domain models.** Immutable by default. Use `slots=True` for memory efficiency.

```python
# Bad — mutable, no type safety
class Order:
    def __init__(self, id, customer_id, total):
        self.id = id
        self.customer_id = customer_id
        self.total = total

# Good — immutable, hashable, memory-efficient
@dataclass(frozen=True, slots=True)
class Order:
    id: str
    customer_id: str
    lines: tuple[OrderLine, ...]
    status: OrderStatus

    @property
    def total(self) -> Decimal:
        return sum(line.subtotal for line in self.lines)
```

**4. Union types for state.** Make impossible states unrepresentable.

```python
# Bad — can be loading AND have an error simultaneously
@dataclass
class PageState:
    is_loading: bool = False
    data: list[Item] | None = None
    error: str | None = None

# Good — exactly one state at a time
type PageState = Loading | Success | Empty | Error

@dataclass(frozen=True)
class Loading:
    pass

@dataclass(frozen=True)
class Success:
    data: list[Item]

@dataclass(frozen=True)
class Empty:
    pass

@dataclass(frozen=True)
class Error:
    message: str
    cause: Exception | None = None
```

**5. `__all__` for public API.** Explicitly declare what's exported from your package.

```python
# __init__.py
__all__ = [
    "Client",
    "AsyncClient",
    "Request",
    "Response",
    "HTTPError",
    "TimeoutError",
]
```

**6. Use `typing.Protocol` for interfaces, `dataclass` for data.** Protocol for abstractions with multiple implementations. Dataclass for plain data containers.

**7. Prefer `tuple` over `list` for immutable collections.** Lists are mutable — use tuples for data that shouldn't change after creation.

```python
# Domain model — tuple, not list
@dataclass(frozen=True, slots=True)
class Order:
    lines: tuple[OrderLine, ...]  # Immutable

# Builder/accumulator — list is fine
items: list[OrderLine] = []
items.append(new_line)
order = Order(lines=tuple(items))
```

---

## 5. State Management

### Pydantic at Boundaries, Dataclasses in Core

The production pattern: Pydantic validates external data at system boundaries (APIs, configs, file I/O). Frozen dataclasses model internal state.

```python
# Boundary layer — validates and coerces external input
from pydantic import BaseModel, Field

class CreateOrderRequest(BaseModel):
    customer_id: str = Field(min_length=1)
    lines: list[OrderLineRequest] = Field(min_length=1)

class OrderLineRequest(BaseModel):
    product_id: str
    quantity: int = Field(gt=0)
    unit_price: float = Field(gt=0)

# Domain layer — immutable, fast, no validation overhead
@dataclass(frozen=True, slots=True)
class OrderLine:
    product_id: str
    quantity: int
    unit_price: Decimal

    @property
    def subtotal(self) -> Decimal:
        return self.unit_price * self.quantity

    @classmethod
    def from_request(cls, req: OrderLineRequest) -> OrderLine:
        return cls(
            product_id=req.product_id,
            quantity=req.quantity,
            unit_price=Decimal(str(req.unit_price)),
        )
```

### Value Objects with Validation

```python
@dataclass(frozen=True)
class Email:
    value: str

    def __post_init__(self) -> None:
        if "@" not in self.value:
            raise ValueError(f"Invalid email: {self.value}")
        object.__setattr__(self, "value", self.value.lower())

@dataclass(frozen=True)
class OrderId:
    value: str

    def __post_init__(self) -> None:
        if not self.value:
            raise ValueError("OrderId cannot be empty")
```

### Performance: Dataclasses vs Pydantic

| Metric | `@dataclass(frozen=True, slots=True)` | Pydantic v2 `BaseModel` |
| --- | --- | --- |
| Construction (100k instances) | ~50ms | ~200ms |
| Memory (1M instances) | ~120MB | Higher |
| Use case | Domain models, hot paths | API boundaries, config |

**Rule:** Pydantic at the edges, dataclasses at the core.

---

## 6. Dependency Injection

Python does DI differently from Java/Kotlin — constructor injection with Protocols is the idiomatic approach, not annotation-driven frameworks.

### Constructor Injection (Primary Pattern)

```python
class OrderService:
    def __init__(
        self,
        repo: OrderRepository,
        payment: PaymentProcessor,
        events: EventPublisher,
    ) -> None:
        self._repo = repo
        self._payment = payment
        self._events = events

    async def create_order(self, request: CreateOrderRequest) -> Order:
        order = Order.create(request)
        await self._payment.charge(order.total)
        saved = await self._repo.save(order)
        await self._events.publish(OrderCreated(saved.id))
        return saved
```

### Composition Root

Wire everything at the application entry point — no service locator, no magic:

```python
# main.py — composition root
def create_app() -> FastAPI:
    app = FastAPI()
    settings = Settings()

    # Infrastructure
    engine = create_async_engine(settings.database_url)
    session_factory = async_sessionmaker(engine)

    # Repositories
    order_repo = PostgresOrderRepository(session_factory)
    user_repo = PostgresUserRepository(session_factory)

    # Services
    payment = StripePaymentProcessor(settings.stripe_key)
    events = RedisEventPublisher(settings.redis_url)
    order_service = OrderService(order_repo, payment, events)

    # Routes
    app.include_router(create_order_router(order_service))
    return app
```

### FastAPI's Built-in DI

FastAPI has the best framework-level DI in the Python ecosystem:

```python
from fastapi import Depends
from typing import Annotated

async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with session_factory() as session:
        yield session

async def get_order_repo(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PostgresOrderRepository:
    return PostgresOrderRepository(session)

async def get_order_service(
    repo: Annotated[OrderRepository, Depends(get_order_repo)],
) -> OrderService:
    return OrderService(repo, payment, events)

@app.post("/orders")
async def create_order(
    request: CreateOrderRequest,
    service: Annotated[OrderService, Depends(get_order_service)],
) -> OrderResponse:
    order = await service.create_order(request)
    return OrderResponse.from_domain(order)
```

### Rules

1. **Constructor injection over service location.** Pass dependencies through constructors, not global lookups.
2. **Protocols for contracts.** All dependencies are typed with Protocols, not concrete classes.
3. **Composition root at the entry point.** One place where everything is wired together. The rest of the code receives its dependencies.
4. **When to use a DI container:** When the dependency graph becomes too complex to wire manually (50+ components). Use `dependency-injector` in that case.

---

## 7. Networking & APIs

### httpx for HTTP Clients

httpx is the production standard for HTTP clients — async and sync in one library, with 100% test coverage.

```python
# infrastructure/external/api_client.py
class ApiClient:
    def __init__(self, base_url: str, api_key: str) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0),
        )

    async def get_user(self, user_id: str) -> ApiResult[UserDto]:
        return await self._safe_request(
            lambda: self._client.get(f"/users/{user_id}")
        )

    async def _safe_request(
        self, request: Callable[[], Awaitable[httpx.Response]]
    ) -> ApiResult[T]:
        try:
            response = await request()
            response.raise_for_status()
            return ApiResult.success(response.json())
        except httpx.HTTPStatusError as e:
            return ApiResult.http_error(e.response.status_code, str(e))
        except httpx.TransportError as e:
            return ApiResult.network_error(e)

    async def close(self) -> None:
        await self._client.aclose()
```

### FastAPI for HTTP Servers

```python
# presentation/api/routes.py
router = APIRouter(prefix="/orders", tags=["orders"])

@router.post("/", status_code=201)
async def create_order(
    request: CreateOrderRequest,
    service: Annotated[OrderService, Depends(get_order_service)],
) -> OrderResponse:
    order = await service.create_order(request)
    return OrderResponse.from_domain(order)

@router.get("/{order_id}")
async def get_order(
    order_id: str,
    service: Annotated[OrderService, Depends(get_order_service)],
) -> OrderResponse:
    order = await service.get_order(order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return OrderResponse.from_domain(order)
```

### Structured API Results

```python
# domain/result.py
@dataclass(frozen=True)
class ApiResult(Generic[T]):
    data: T | None = None
    error: ApiError | None = None

    @staticmethod
    def success(data: T) -> ApiResult[T]:
        return ApiResult(data=data)

    @staticmethod
    def http_error(code: int, message: str) -> ApiResult[Never]:
        return ApiResult(error=ApiError(code=code, message=message))

    @staticmethod
    def network_error(cause: Exception) -> ApiResult[Never]:
        return ApiResult(error=ApiError(code=0, message=str(cause), cause=cause))

    @property
    def is_success(self) -> bool:
        return self.error is None

@dataclass(frozen=True)
class ApiError:
    code: int
    message: str
    cause: Exception | None = None
```

### Data Transfer Objects

Always separate DTOs from domain models. DTOs match the API schema; domain models match your business logic.

```python
# presentation/api/schemas.py — Pydantic models for API
class OrderResponse(BaseModel):
    id: str
    customer_id: str
    total: float
    status: str
    created_at: datetime

    @classmethod
    def from_domain(cls, order: Order) -> OrderResponse:
        return cls(
            id=order.id,
            customer_id=order.customer_id,
            total=float(order.total),
            status=order.status.value,
            created_at=order.created_at,
        )
```

---

## 8. Local Storage & ORM

### SQLAlchemy 2.0 (The Production Standard)

SQLAlchemy 2.0 uses `Mapped[T]` and `mapped_column()` for type-safe ORM models:

```python
# infrastructure/persistence/models.py
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

class Base(DeclarativeBase):
    pass

class OrderEntity(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(primary_key=True)
    customer_id: Mapped[str]
    status: Mapped[str] = mapped_column(default="pending")
    created_at: Mapped[datetime] = mapped_column(default_factory=datetime.utcnow)
    lines: Mapped[list["OrderLineEntity"]] = relationship(back_populates="order")

    def to_domain(self) -> Order:
        return Order(
            id=self.id,
            customer_id=self.customer_id,
            status=OrderStatus(self.status),
            lines=tuple(line.to_domain() for line in self.lines),
            created_at=self.created_at,
        )

    @classmethod
    def from_domain(cls, order: Order) -> OrderEntity:
        return cls(
            id=order.id,
            customer_id=order.customer_id,
            status=order.status.value,
            lines=[OrderLineEntity.from_domain(line) for line in order.lines],
        )
```

### Async Sessions

```python
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

engine = create_async_engine(
    "postgresql+asyncpg://user:pass@localhost/db",
    pool_size=20,
    max_overflow=10,
    pool_recycle=3600,
    pool_pre_ping=True,  # Test connections before checkout
)

session_factory = async_sessionmaker(engine, expire_on_commit=False)
```

### Repository Pattern

```python
class PostgresOrderRepository:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def get_by_id(self, order_id: str) -> Order | None:
        async with self._session_factory() as session:
            entity = await session.get(OrderEntity, order_id)
            return entity.to_domain() if entity else None

    async def save(self, order: Order) -> Order:
        async with self._session_factory() as session:
            entity = OrderEntity.from_domain(order)
            merged = await session.merge(entity)
            await session.commit()
            return merged.to_domain()

    async def list_active(self) -> list[Order]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(OrderEntity).where(OrderEntity.status == "active")
            )
            return [entity.to_domain() for entity in result.scalars()]
```

### Key Rule: Never Expose ORM Entities to Application/Presentation

The application layer never sees `OrderEntity` or SQLAlchemy types. Repositories map to domain models at the boundary.

---

## 9. Configuration

### pydantic-settings (The Standard)

12-factor app configuration with full type validation at startup:

```python
# config.py
from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="APP_",
        case_sensitive=False,
    )

    # Required — app crashes immediately if missing
    database_url: str
    api_key: SecretStr                  # Never printed in logs/repr

    # Optional with defaults
    debug: bool = False
    log_level: str = "INFO"
    max_connections: int = Field(default=10, gt=0, le=100)
    allowed_origins: list[str] = ["http://localhost:3000"]
```

Load precedence: **Environment variables > .env file > Defaults**.

### Nested Configuration

```python
class DatabaseSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="DB_")
    host: str = "localhost"
    port: int = 5432
    name: str
    user: str
    password: SecretStr

class RedisSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="REDIS_")
    url: str = "redis://localhost:6379"
    max_connections: int = 20

class Settings(BaseSettings):
    db: DatabaseSettings = DatabaseSettings()
    redis: RedisSettings = RedisSettings()
    debug: bool = False
```

### Rules

1. **Fail fast.** Missing required config crashes at startup, not at 3am when the codepath is first hit.
2. **`SecretStr` for sensitive values.** Prevents accidental logging — `repr()` shows `SecretStr('**********')`.
3. **No secrets in code.** Ever. Use `SecretStr`, env vars, or secret management services.
4. **One `Settings` class.** The composition root creates it once and passes it down via constructor injection.

---

## 10. Concurrency

### Structured Concurrency with TaskGroup (Python 3.11+)

`asyncio.TaskGroup` replaces `asyncio.gather` for production code. If any task fails, all remaining tasks are cancelled automatically.

```python
async def fetch_all_users(user_ids: list[int]) -> list[User]:
    async with asyncio.TaskGroup() as tg:
        tasks = [
            tg.create_task(fetch_user(uid), name=f"fetch-user-{uid}")
            for uid in user_ids
        ]
    return [task.result() for task in tasks]
```

### Exception Handling with `except*`

TaskGroup raises `ExceptionGroup`, handled with `except*`:

```python
try:
    async with asyncio.TaskGroup() as tg:
        tg.create_task(sometimes_fails("one"))
        tg.create_task(sometimes_fails("two"))
except* ValueError as eg:
    for e in eg.exceptions:
        logger.error("ValueError in task", error=str(e))
except* ConnectionError as eg:
    for e in eg.exceptions:
        logger.error("Connection failed", error=str(e))
```

### Concurrency Limiting with Semaphore

```python
async def fetch_with_limit(
    urls: list[str], max_concurrent: int = 10
) -> list[bytes]:
    semaphore = asyncio.Semaphore(max_concurrent)

    async def throttled_fetch(url: str) -> bytes:
        async with semaphore:
            async with httpx.AsyncClient() as client:
                response = await client.get(url)
                return response.content

    async with asyncio.TaskGroup() as tg:
        tasks = [tg.create_task(throttled_fetch(url)) for url in urls]
    return [t.result() for t in tasks]
```

### Async Context Managers for Resource Management

```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def managed_db_pool(dsn: str):
    pool = await asyncpg.create_pool(dsn)
    try:
        yield pool
    finally:
        await pool.close()

# Usage
async with managed_db_pool("postgresql://...") as pool:
    async with pool.acquire() as conn:
        result = await conn.fetchrow("SELECT * FROM users WHERE id = $1", 1)
```

### Timeout Handling

```python
# Modern — Python 3.11+
async with asyncio.timeout(5.0):
    response = await client.get(url)

# With cleanup
try:
    async with asyncio.timeout(5.0):
        data = await slow_operation()
except TimeoutError:
    logger.warning("Operation timed out after 5s")
    data = cached_fallback()
```

### Rules

1. **TaskGroup over gather.** Gather doesn't cancel siblings on failure. TaskGroup does.
2. **Semaphore for rate limiting.** Don't launch 10,000 concurrent HTTP requests.
3. **Always use `async with` for resources.** Connections, files, sessions — context managers guarantee cleanup.
4. **Never `asyncio.run()` inside async code.** Use `await` instead.
5. **Name your tasks.** `tg.create_task(work(), name="fetch-user-42")` makes debugging traceable.

---

## 11. Error Handling

### Custom Exception Hierarchy

Every production application defines a base exception and category-level exceptions:

```python
# domain/exceptions.py
class AppError(Exception):
    """Base exception for the entire application."""
    def __init__(self, message: str, code: str | None = None) -> None:
        self.code = code
        super().__init__(message)

class ValidationError(AppError):
    """Input validation failures."""
    pass

class NotFoundError(AppError):
    """Requested resource does not exist."""
    pass

class AuthenticationError(AppError):
    """Caller is not authenticated."""
    pass

class AuthorizationError(AppError):
    """Caller lacks permission."""
    pass

class ExternalServiceError(AppError):
    """Upstream dependency failure."""
    def __init__(self, service: str, message: str) -> None:
        self.service = service
        super().__init__(f"{service}: {message}", code="EXTERNAL_ERROR")
```

### Exception Chaining

Always use `from` to preserve the original traceback:

```python
try:
    result = await external_api.call(payload)
except httpx.ConnectError as e:
    raise ExternalServiceError("payment-api", "Connection failed") from e
```

### Error Classification

| | Recoverable | Non-Recoverable |
| --- | --- | --- |
| **You detect it** | Fix locally, no exception | Raise custom exception |
| **Bubbled up** | Catch specific, recover | Let it propagate — do NOT catch |

### Top-Level Error Boundary

```python
# main.py
async def main() -> None:
    try:
        await run_application()
    except KeyboardInterrupt:
        logger.info("Shutting down gracefully")
    except Exception:
        logger.exception("Unhandled error")
        sys.exit(1)
```

### Rules

1. **Never bare except.** Always catch specific exceptions.
2. **Catch at the right level.** If you can't recover, don't catch.
3. **Always chain with `from`.** `raise NewError(...) from original_error`.
4. **Rich error messages.** Include what you were doing and what went wrong.
5. **Top-level catch only at the boundary.** FastAPI exception handlers, CLI entry points.

---

## 12. Logging & Observability

### structlog (The Production Standard)

structlog produces structured JSON logs with context binding:

```python
import structlog

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    logger_factory=structlog.stdlib.LoggerFactory(),
)
```

### Context Binding

```python
log = structlog.get_logger()

# Bind context that persists across all subsequent calls
log = log.bind(request_id="abc-123", user_id=42)
log.info("processing_order", order_id=99, total=150.00)
# {"event": "processing_order", "request_id": "abc-123",
#  "user_id": 42, "order_id": 99, "total": 150.0,
#  "timestamp": "2026-01-15T10:30:00Z", "level": "info"}
```

### OpenTelemetry Trace Correlation

```python
from opentelemetry import trace

def add_trace_context(
    logger: Any, method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    span = trace.get_current_span()
    if span and span.is_recording():
        ctx = span.get_span_context()
        event_dict["trace_id"] = format(ctx.trace_id, "032x")
        event_dict["span_id"] = format(ctx.span_id, "016x")
    return event_dict
```

### Rules

1. **JSON in production.** Machine-parseable, indexable by log aggregators.
2. **Context binding over string interpolation.** `log.info("order_created", order_id=42)` not `log.info(f"Order {order_id} created")`.
3. **Never log secrets.** Use `SecretStr` and filter sensitive fields.
4. **Trace IDs on every request.** Correlate logs across services with OpenTelemetry.

---

## 13. Testing

### The Testing Trophy for Python

```
          ╱  E2E Tests  ╲            (Few — critical user journeys)
         ╱  Integration   ╲          (Many — how layers work together)
        ╱   Unit Tests     ╲         (Some — pure logic, use cases)
       ╱  Static Analysis   ╲        (Always on — mypy, ruff)
```

### pytest Configuration

```toml
# pyproject.toml
[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["src"]
asyncio_mode = "auto"
addopts = "-v --tb=short --strict-markers --cov=src --cov-report=term-missing"
markers = [
    "slow: marks tests as slow",
    "integration: marks integration tests",
]
filterwarnings = [
    "error",
    "ignore::DeprecationWarning:third_party_lib",
]
```

### Fixtures and conftest.py

```python
# tests/conftest.py — shared fixtures
@pytest.fixture(scope="session")
def db_engine():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()

@pytest.fixture
def db_session(db_engine):
    connection = db_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    yield session
    session.close()
    transaction.rollback()
    connection.close()
```

### Fakes Over Mocks

Production teams prefer explicit fakes for clearer test intent:

```python
class FakeOrderRepository:
    def __init__(self) -> None:
        self.orders: dict[str, Order] = {}

    async def get_by_id(self, order_id: str) -> Order | None:
        return self.orders.get(order_id)

    async def save(self, order: Order) -> Order:
        self.orders[order.id] = order
        return order

    async def list_active(self) -> list[Order]:
        return [o for o in self.orders.values() if o.status == OrderStatus.ACTIVE]
```

### Unit Tests (Pure Logic)

```python
class TestCreateOrderUseCase:
    @pytest.fixture
    def repo(self) -> FakeOrderRepository:
        return FakeOrderRepository()

    @pytest.fixture
    def payment(self) -> FakePaymentProcessor:
        return FakePaymentProcessor()

    @pytest.fixture
    def use_case(self, repo, payment) -> CreateOrderUseCase:
        return CreateOrderUseCase(repo=repo, payment=payment, events=FakeEvents())

    async def test_creates_order(self, use_case, repo):
        request = CreateOrderRequest(
            customer_id="cust-1",
            lines=[OrderLineRequest(product_id="prod-1", quantity=2, unit_price=10.0)],
        )
        order = await use_case.execute(request)

        assert order.customer_id == "cust-1"
        assert len(order.lines) == 1
        assert await repo.get_by_id(order.id) is not None

    async def test_fails_on_payment_error(self, use_case, payment):
        payment.should_fail = True
        request = CreateOrderRequest(
            customer_id="cust-1",
            lines=[OrderLineRequest(product_id="prod-1", quantity=1, unit_price=10.0)],
        )
        with pytest.raises(PaymentFailedError):
            await use_case.execute(request)
```

### Integration Tests (Layers Together)

```python
# Testing API with real FastAPI TestClient
@pytest.fixture
def client(db_session):
    app.dependency_overrides[get_session] = lambda: db_session
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()

def test_create_order_endpoint(client):
    response = client.post("/orders", json={
        "customer_id": "cust-1",
        "lines": [{"product_id": "prod-1", "quantity": 2, "unit_price": 10.0}],
    })
    assert response.status_code == 201
    assert response.json()["customer_id"] == "cust-1"
```

### Parametrized Tests

```python
@pytest.mark.parametrize("quantity,expected_total", [
    (1, Decimal("10.00")),
    (5, Decimal("50.00")),
    (0, pytest.raises(ValidationError)),
])
def test_order_total(quantity, expected_total):
    if isinstance(expected_total, Decimal):
        line = OrderLine(product_id="p1", quantity=quantity, unit_price=Decimal("10.00"))
        assert line.subtotal == expected_total
```

### Property-Based Testing with Hypothesis

```python
from hypothesis import given, settings
from hypothesis import strategies as st

@given(st.lists(st.integers(), min_size=1, max_size=100))
def test_sorted_output_is_sorted(input_list):
    result = my_sort(input_list)
    assert all(result[i] <= result[i + 1] for i in range(len(result) - 1))

@given(st.text(min_size=1, max_size=50, alphabet=st.characters(whitelist_categories=("L",))))
def test_email_roundtrip(name):
    email = Email(f"{name}@example.com")
    assert email.value == f"{name}@example.com".lower()
```

### Coverage Targets

- **80-90%** for the project overall
- **90-100%** for critical modules (auth, payments, data integrity)
- **Focus on test quality over percentage** — meaningful assertions beat trivial coverage

---

## 14. Build Configuration & Tooling

### pyproject.toml (Complete Example)

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "myapp"
version = "1.0.0"
description = "A production application"
readme = "README.md"
license = { text = "MIT" }
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115.0",
    "sqlalchemy>=2.0",
    "pydantic>=2.0",
    "pydantic-settings>=2.0",
    "httpx>=0.27.0",
    "structlog>=24.0",
    "uvicorn[standard]>=0.30.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-cov>=6.0",
    "pytest-asyncio>=0.24",
    "pytest-mock>=3.14",
    "hypothesis>=6.100",
    "ruff>=0.11.0",
    "mypy>=1.16",
    "pre-commit>=4.0",
    "pip-audit>=2.7",
]

[project.scripts]
myapp = "myapp.__main__:main"

[tool.ruff]
target-version = "py312"
line-length = 88
src = ["src"]

[tool.ruff.lint]
select = [
    "E",     # pycodestyle errors
    "W",     # pycodestyle warnings
    "F",     # pyflakes
    "I",     # isort
    "B",     # flake8-bugbear
    "C4",    # flake8-comprehensions
    "UP",    # pyupgrade
    "ARG",   # flake8-unused-arguments
    "SIM",   # flake8-simplify
    "TCH",   # flake8-type-checking
    "RUF",   # Ruff-specific rules
    "S",     # flake8-bandit (security)
    "PT",    # flake8-pytest-style
    "RET",   # flake8-return
    "DTZ",   # flake8-datetimez
]
ignore = ["E501"]

[tool.ruff.lint.per-file-ignores]
"tests/**/*.py" = ["S101", "ARG", "S106"]
"__init__.py" = ["F401"]

[tool.ruff.lint.isort]
known-first-party = ["myapp"]

[tool.ruff.format]
quote-style = "double"
docstring-code-format = true

[tool.mypy]
python_version = "3.12"
strict = true
warn_unreachable = true

[[tool.mypy.overrides]]
module = ["tests.*"]
disallow_untyped_defs = false

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["src"]
asyncio_mode = "auto"
addopts = "-v --tb=short --strict-markers"
markers = [
    "slow: marks tests as slow",
    "integration: marks integration tests",
]

[tool.coverage.run]
source = ["src"]
branch = true
omit = ["*/tests/*", "*/migrations/*"]

[tool.coverage.report]
show_missing = true
fail_under = 80
exclude_lines = [
    "pragma: no cover",
    "if TYPE_CHECKING:",
    "raise NotImplementedError",
    "\\.\\.\\.",
]
```

### uv (Package Manager)

uv is the 2025-2026 standard — 10-100x faster than pip, cross-platform lockfiles, built-in Python version management:

```bash
uv init myproject               # Create project with pyproject.toml
uv add fastapi sqlalchemy       # Add dependencies
uv add --dev pytest ruff mypy   # Add dev dependencies
uv sync                         # Install from lock file
uv run pytest                   # Run in managed environment
uv lock                         # Generate/update uv.lock
```

### Pre-commit Hooks

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v5.0.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-toml
      - id: check-added-large-files
      - id: check-merge-conflict
      - id: debug-statements

  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.11.0
    hooks:
      - id: ruff-check
        args: [--fix]
      - id: ruff-format

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.16.0
    hooks:
      - id: mypy
        additional_dependencies: [types-requests, pydantic]
```

### Docker

```dockerfile
# Multi-stage build — reduces image size by 60-80%
FROM python:3.12-slim-bookworm AS builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-editable
COPY src/ ./src/

FROM python:3.12-slim-bookworm AS runtime

RUN groupadd -r appuser && useradd -r -g appuser appuser
WORKDIR /app

COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/src /app/src

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

USER appuser
CMD ["python", "-m", "myapp"]
```

### CI Pipeline

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - run: uv sync --dev
      - run: uv run ruff check .
      - run: uv run ruff format --check .

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - run: uv sync --dev
      - run: uv run mypy src/

  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ["3.11", "3.12", "3.13"]
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - run: uv python install ${{ matrix.python-version }}
      - run: uv sync --dev
      - run: uv run pytest -v --cov=src --cov-report=xml

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - run: uv sync --dev
      - run: uv run pip-audit --strict
```

---

## 15. Code Quality & Hygiene

### Naming Conventions

```
Files & Packages:
  src/myapp/domain/models.py       (snake_case for modules)
  src/myapp/infrastructure/        (snake_case for packages)

Classes & Protocols:
  class OrderService                (PascalCase, nouns)
  class OrderRepository(Protocol)   (PascalCase, nouns)
  class OrderStatus(Enum)           (PascalCase, nouns)

Functions & Methods:
  def create_order()                (snake_case, verbs)
  async def get_by_id()             (snake_case, verbs)

Variables & Parameters:
  order_id: str                     (snake_case)
  _session_factory                  (underscore prefix for private)

Constants:
  MAX_RETRY_COUNT = 5               (UPPER_SNAKE_CASE)
  DEFAULT_TIMEOUT = 30.0            (UPPER_SNAKE_CASE)

Type Variables:
  T = TypeVar("T")                  (single uppercase letter)
  ModelT = TypeVar("ModelT")        (descriptive with T suffix)
```

### Code Review Checklist

Before merging any Python code:

- [ ] No `Any` types (use proper generics, unions, or `object`)
- [ ] No bare `except` — always catch specific exceptions
- [ ] All functions have type annotations (mypy strict passes)
- [ ] Domain models are frozen dataclasses, not mutable classes
- [ ] ORM entities are not exposed beyond the repository layer
- [ ] Async code uses structured concurrency (TaskGroup, not bare tasks)
- [ ] Errors use custom exception hierarchy, not generic `Exception`
- [ ] New code has tests in `tests/`
- [ ] No hardcoded secrets or config values
- [ ] No mutable default arguments
- [ ] Resources use context managers (`with`/`async with`)
- [ ] Imports are explicit (no wildcard `from x import *`)

### mypy Strict Configuration

```toml
[tool.mypy]
python_version = "3.12"
strict = true
warn_unreachable = true
enable_error_code = ["ignore-without-code", "redundant-cast"]
```

What `strict = true` enforces:

| Setting | What it catches |
| --- | --- |
| `disallow_untyped_defs` | Functions without type annotations |
| `no_implicit_optional` | `def f(x: int = None)` — must write `int \| None` |
| `strict_optional` | Accessing `.attr` on `T \| None` without a None check |
| `warn_return_any` | Functions that silently return `Any` |
| `disallow_any_generics` | Bare `list` instead of `list[int]` |

---

## 16. Performance

### Profiling First, Optimizing Second

**cProfile** (development):

```python
import cProfile
import pstats

with cProfile.Profile() as pr:
    result = expensive_function()

stats = pstats.Stats(pr)
stats.sort_stats("cumulative")
stats.print_stats(20)
```

**py-spy** (production — attaches to running processes without overhead):

```bash
py-spy record -o profile.svg -- python myapp/main.py
py-spy top --pid 12345  # Live view
```

### Connection Pooling

```python
engine = create_async_engine(
    "postgresql+asyncpg://user:pass@localhost/db",
    pool_size=20,           # Steady-state connections
    max_overflow=10,        # Extra connections under load
    pool_recycle=3600,      # Recycle after 1 hour
    pool_pre_ping=True,     # Test before checkout
)
```

### Caching Patterns

```python
# In-process caching
from functools import lru_cache

@lru_cache(maxsize=256)
def get_config_value(key: str) -> str:
    return db.query(Config).filter_by(key=key).first().value
```

### Memory Optimization

- Use `__slots__` on classes with many instances
- Use `@dataclass(slots=True)` (Python 3.10+) — reduces memory by ~65%
- Use generators instead of lists for large sequences
- Profile with `tracemalloc` or Bloomberg's `memray`

### When to Use Rust/Cython Extensions

**Use when:** CPU-bound numeric computation, parsing binary formats, hot loops with millions of iterations.

**Don't use when:** I/O-bound code (async is sufficient), code that mostly manipulates Python objects, functions that are already fast enough.

---

## 17. Security

### Input Validation at Every Boundary

```python
from pydantic import BaseModel, Field, field_validator

class UserInput(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: str

    @field_validator("username")
    @classmethod
    def no_special_chars(cls, v: str) -> str:
        if not v.isalnum():
            raise ValueError("Username must be alphanumeric")
        return v
```

### Parameterized Queries (Never String Interpolation)

```python
# WRONG — SQL injection
cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")

# RIGHT — parameterized
cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))

# RIGHT — SQLAlchemy
session.execute(select(User).where(User.id == user_id))
```

### Security Tooling

- **Ruff `S` rules** — Bandit security checks, 10-100x faster
- **pip-audit** — Audit dependencies against vulnerability databases
- **`SecretStr`** — Prevents accidental logging of secrets
- **Never use `exec()`, `eval()`, or `pickle.loads()` on untrusted input**

---

## 18. Common Anti-Patterns

### 1. Mutable Default Arguments

**Symptom:** Function accumulates state across calls.

```python
# WRONG — list is shared across all calls
def add_item(item: str, items: list[str] = []) -> list[str]:
    items.append(item)
    return items
# add_item("a") -> ["a"]
# add_item("b") -> ["a", "b"]  ← BUG

# RIGHT
def add_item(item: str, items: list[str] | None = None) -> list[str]:
    if items is None:
        items = []
    items.append(item)
    return items
```

### 2. Bare Except

**Symptom:** Silently swallows `KeyboardInterrupt`, `SystemExit`, real bugs.
**Fix:** Always catch specific exceptions. If you must catch broadly, catch `Exception`, not bare `except`.

### 3. Global Mutable State

**Symptom:** Module-level dicts/lists used as caches. Hidden dependencies, race conditions, untestable.
**Fix:** Inject caches via constructor. Use `functools.lru_cache` for simple memoization.

### 4. Import Side Effects

**Symptom:** `import mymodule` connects to a database.
**Fix:** Defer initialization to explicit function calls or constructor injection.

### 5. God Classes

**Symptom:** `UserManager` with `create_user`, `send_email`, `generate_report`, `validate_payment`.
**Fix:** Single Responsibility Principle. `UserService`, `EmailService`, `ReportService`.

### 6. Not Using Context Managers

**Symptom:** `f = open("data.txt"); data = f.read(); f.close()` — resource leak on exception.
**Fix:** `with open("data.txt") as f:` — always.

### 7. Wildcard Imports

**Symptom:** `from os import *` — pollutes namespace, hides dependencies.
**Fix:** `from os import path, getcwd` — explicit imports.

### 8. Exposing ORM Entities to Business Logic

**Symptom:** FastAPI routes directly return SQLAlchemy model instances.
**Fix:** Map to domain models at the repository boundary. API returns Pydantic schemas.

### 9. `type()` Instead of `isinstance()`

**Symptom:** `if type(obj) == dict` — breaks with inheritance.
**Fix:** `if isinstance(obj, dict)`.

### 10. No Exception Hierarchy

**Symptom:** `raise Exception("something went wrong")` everywhere.
**Fix:** Define `AppError` base, category exceptions, specific exceptions. Catch at the right level.

### 11. String-Based Configuration

**Symptom:** `config["DATABASE_URL"]` with no validation, crashes at runtime when key is missing.
**Fix:** `pydantic-settings` with typed fields. Crashes at startup if config is invalid.

### 12. Synchronous I/O in Async Code

**Symptom:** `open()` or `requests.get()` inside an `async def` — blocks the event loop.
**Fix:** Use `aiofiles` for file I/O, `httpx.AsyncClient` for HTTP, `asyncpg` for database.

---

## 19. Projects Studied

### Open Source Repositories

| # | Project | URL | What's Notable | Key Takeaway |
| --- | --- | --- | --- | --- |
| 1 | **FastAPI** | [fastapi/fastapi](https://github.com/fastapi/fastapi) | Type-driven validation, DI system, auto-generated docs | Gold standard for Python API design |
| 2 | **Django** | [django/django](https://github.com/django/django) | 15,000+ tests, batteries-included, domain-driven packages | How to structure a large Python framework |
| 3 | **Flask** | [pallets/flask](https://github.com/pallets/flask) | Minimal core (~20 files), `sansio/` protocol separation | Extension-based architecture |
| 4 | **requests** | [psf/requests](https://github.com/psf/requests) | "For humans" API design, flat structure | API simplicity as a feature |
| 5 | **HTTPX** | [encode/httpx](https://github.com/encode/httpx) | 100% coverage, sync+async, MockTransport | How to build a testable HTTP client |
| 6 | **Pydantic** | [pydantic/pydantic](https://github.com/pydantic/pydantic) | Rust core, `_internal/` split, TypeAdapter | Runtime validation done right |
| 7 | **SQLAlchemy** | [sqlalchemy/sqlalchemy](https://github.com/sqlalchemy/sqlalchemy) | Dual-layer (Core + ORM), dialect system, `Mapped[T]` | Type-safe ORM with 2.0 |
| 8 | **Celery** | [celery/celery](https://github.com/celery/celery) | Domain-driven packages, bootsteps lifecycle, canvas API | Task queue architecture |
| 9 | **Dramatiq** | [Bogdanp/dramatiq](https://github.com/Bogdanp/dramatiq) | Middleware-as-architecture, ~20 source files | Small, focused task queue |
| 10 | **Click** | [pallets/click](https://github.com/pallets/click) | Decorator-based CLI, `CliRunner` testing, composable groups | CLI framework design |
| 11 | **Typer** | [tiangolo/typer](https://github.com/tiangolo/typer) | Type-hint-driven CLI (inspired by FastAPI) | Type hints as API surface |
| 12 | **pytest** | [pytest-dev/pytest](https://github.com/pytest-dev/pytest) | Self-hosting, hook-based plugins, fixture DI | Plugin architecture done right |
| 13 | **Rich** | [Textualize/rich](https://github.com/Textualize/rich) | Protocol-based renderability, ~80 flat modules | Duck typing with Protocols |
| 14 | **Textual** | [Textualize/textual](https://github.com/Textualize/textual) | CSS-in-Python, SVG snapshot testing, public/private split | Terminal UI framework architecture |
| 15 | **Black** | [psf/black](https://github.com/psf/black) | Opinionated (zero config), AST-based transformation | Tool design philosophy |
| 16 | **Ruff** | [astral-sh/ruff](https://github.com/astral-sh/ruff) | Rust for 100x speed, replaces 6+ tools | Performance via language choice |
| 17 | **Poetry** | [python-poetry/poetry](https://github.com/python-poetry/poetry) | 17 domain-driven subpackages, plugin system | Package manager architecture |
| 18 | **PDM** | [pdm-project/pdm](https://github.com/pdm-project/pdm) | Clean layer separation, `_types.py` + `signals.py` | Modern Python packaging |
| 19 | **Starlette** | [encode/starlette](https://github.com/encode/starlette) | ASGI framework, middleware pipeline | FastAPI's foundation |
| 20 | **uvicorn** | [encode/uvicorn](https://github.com/encode/uvicorn) | Protocol implementations, loop abstraction | ASGI server design |

### Production Case Studies (Closed Source)

| Company | What They Use Python For | Key Lesson |
| --- | --- | --- |
| **Instagram/Meta** | Millions of lines of Python; built Pyre, then Pyrefly type checkers | Static analysis at scale is mandatory — they built two type checkers for it |
| **Stripe** | Backend services, payment processing | Strict typing, Pydantic-style validation at every API boundary |
| **Dropbox** | Desktop client, server backend; contributed to mypy | Invested in mypy development because type safety was critical at scale |
| **Netflix** | Recommendation engine, internal tools | Async Python with structured concurrency for high-throughput services |
| **Google** | Internal tools, AI/ML infrastructure | Google Python Style Guide is one of the most referenced standards |
| **Cash App** | Backend services alongside KMP mobile | Python for backend microservices with strict typing |

---

## Sources & Further Reading

### Architecture & Patterns
- [Python Design Patterns for Clean Architecture — Glukhov](https://www.glukhov.org/post/2025/11/python-design-patterns-for-clean-architecture/)
- [Dependency Injection: a Python Way — Glukhov](https://www.glukhov.org/post/2025/12/dependency-injection-in-python)
- [Google Python Style Guide](https://google.github.io/styleguide/pyguide.html)
- [faif/python-patterns](https://github.com/faif/python-patterns)
- [python-patterns.guide](https://python-patterns.guide/)

### Type System
- [MyPy Configuration for Strict Typing — Hrekov](https://hrekov.com/blog/mypy-configuration-for-strict-typing)
- [Mastering Type-Safe Python: Pydantic + Mypy — Toolshelf](https://toolshelf.tech/blog/mastering-type-safe-python-pydantic-mypy-2025/)
- [PEP 544 — Protocols: Structural Subtyping](https://peps.python.org/pep-0544/)
- [Open-sourcing Pyrefly — Meta Engineering](https://engineering.fb.com/2025/05/15/developer-tools/open-sourcing-pyrefly-a-faster-python-type-checker-written-in-rust/)

### Error Handling
- [The Ultimate Guide to Error Handling in Python — Miguel Grinberg](https://blog.miguelgrinberg.com/post/the-ultimate-guide-to-error-handling-in-python)
- [Python Errors as Values — Inngest](https://www.inngest.com/blog/python-errors-as-values)
- [Result Types — returns library](https://returns.readthedocs.io/en/latest/pages/result.html)

### Concurrency
- [Mastering Python Async Patterns 2026 — DEV Community](https://dev.to/shehzan/mastering-python-async-patterns-a-complete-guide-to-asyncio-in-2026-10o6)
- [Structured Concurrency with TaskGroup — Billy Poon](https://billypoon.com/insights/structured-concurrency-in-python-with-taskgroup-writing-async-code-that-doesn-t-break)
- [Limit Concurrency with Semaphore — Rednafi](https://rednafi.com/python/limit-concurrency-with-semaphore/)

### Testing
- [pytest Fixtures Documentation](https://docs.pytest.org/en/stable/how-to/fixtures.html)
- [Hypothesis Documentation](https://hypothesis.readthedocs.io/)
- [Static vs Unit vs Integration vs E2E — Kent C. Dodds](https://kentcdodds.com/blog/static-vs-unit-vs-integration-vs-e2e-tests)

### Tooling & Packaging
- [Ruff Documentation](https://docs.astral.sh/ruff/)
- [uv Documentation](https://docs.astral.sh/uv/)
- [Modern Python Code Quality Setup: uv, ruff, mypy — Carolini](https://simone-carolini.medium.com/modern-python-code-quality-setup-uv-ruff-and-mypy-8038c6549dcc)
- [Python Packaging User Guide](https://packaging.python.org/en/latest/guides/writing-pyproject-toml/)

### Logging & Observability
- [Python Logging with structlog — Last9](https://last9.io/blog/python-logging-with-structlog/)
- [Pydantic Settings Documentation](https://docs.pydantic.dev/latest/concepts/pydantic_settings/)

### Security
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [Python and OWASP Top 10 — Qwiet](https://qwiet.ai/appsec-resources/python-and-owasp-top-10-a-developers-guide/)

### Anti-Patterns
- [The Little Book of Python Anti-Patterns](https://docs.quantifiedcode.com/python-anti-patterns/)
- [Static Analysis at Scale: An Instagram Story — Meta Engineering](https://instagram-engineering.com/static-analysis-at-scale-an-instagram-story-8f498ab71a0c)
- [Writing and Linting Python at Scale — Meta Engineering](https://engineering.fb.com/2023/11/21/production-engineering/writing-linting-python-at-scale-meta/)

### Performance
- [py-spy Profiler](https://github.com/benfred/py-spy)
- [Memray Memory Profiler — Bloomberg](https://github.com/bloomberg/memray)
- [Cython vs Rust Python Extensions — Python Speed](https://pythonspeed.com/articles/rust-cython-python-extensions/)
