# Production-Ready Frontend Code: The Complete Guide

> A distilled guide for developers who can code but want to write frontend code at the level of the best teams in the world (Vercel, Linear, Stripe, Cal.com, shadcn/ui).

---

## Table of Contents

1. [Mindset Shift](#1-mindset-shift)
2. [Project Structure](#2-project-structure)
3. [Component Architecture](#3-component-architecture)
4. [TypeScript Discipline](#4-typescript-discipline)
5. [CSS & Styling Architecture](#5-css--styling-architecture)
6. [Design Tokens & Theming](#6-design-tokens--theming)
7. [Accessibility (a11y)](#7-accessibility-a11y)
8. [Performance](#8-performance)
9. [SEO](#9-seo)
10. [Error Handling](#10-error-handling)
11. [Testing](#11-testing)
12. [Code Quality & Hygiene](#12-code-quality--hygiene)
13. [Common Anti-Patterns](#13-common-anti-patterns)
14. [Audit of This Codebase](#14-audit-of-this-codebase)

---

## 1. Mindset Shift

Amateur frontend code _works_. Production frontend code works **reliably, accessibly, performantly, and maintainably**.

The core differences:

| Amateur                       | Production                                                    |
| ----------------------------- | ------------------------------------------------------------- |
| "It looks right on my screen" | "It works on every screen, browser, and assistive technology" |
| Styles scattered across files | Design tokens → semantic tokens → component styles            |
| `!important` to fix things    | Understanding specificity and fixing the root cause           |
| Hardcoded colors/sizes        | Token-based system with clear hierarchy                       |
| "It loads"                    | LCP < 2.5s, CLS < 0.1, INP < 200ms                            |
| No keyboard navigation        | Full keyboard + screen reader support                         |
| "I'll add tests later"        | Tests are part of the definition of done                      |
| Copy-paste between themes     | One source of truth with theme variants                       |

---

## 2. Project Structure

### The Feature-Based Approach

Organize by **what the code does**, not what type of file it is. This is the pattern used by Bulletproof React and most high-quality codebases:

```
src/
├── components/          # Shared, reusable UI primitives
│   ├── ui/              # Base components (Button, Input, Card)
│   ├── layout/          # Layout components (Header, Footer, Sidebar)
│   └── [ComponentName]/
│       ├── ComponentName.tsx
│       ├── ComponentName.test.tsx
│       └── index.ts
├── features/            # Feature-specific code (grouped together)
│   └── blog/
│       ├── components/
│       ├── hooks/
│       ├── utils/
│       └── types.ts
├── layouts/             # Page-level layout templates
├── pages/               # Route entry points (thin — just compose)
├── styles/              # Global styles, tokens, reset
│   ├── tokens.css       # Design tokens (single source of truth)
│   ├── reset.css        # CSS reset/normalize
│   └── global.css       # Base styles, imports tokens
├── lib/                 # Shared utilities, helpers
├── data/                # Static data, config, constants
├── types/               # Shared TypeScript types
└── content/             # CMS content (markdown, MDX, etc.)
```

### Key Rules

1. **Pages are thin.** A page file should compose components and layouts, not contain logic or styling. Think of pages as wiring diagrams.
2. **Co-locate related files.** Tests, styles, and types live next to the component they belong to, not in a separate `__tests__/` folder tree.
3. **No cross-feature imports.** Features should not import from each other. If two features need the same thing, extract it to `components/` or `lib/`.
4. **Max 3-4 levels of nesting.** If you're deeper than that, you're overcomplicating things.
5. **Avoid barrel files (index.ts re-exports) in large projects.** They break tree-shaking in Vite/Rollup and cause circular dependency issues. Import directly.

---

## 3. Component Architecture

### Principles

**Single Responsibility:** Each component does one thing. If a component handles layout, data fetching, and presentation, break it up.

**Composition over Configuration:** Instead of a component with 15 props to control every variation, compose smaller components:

```astro
<!-- Bad: God component -->
<Card
  title="..."
  subtitle="..."
  image="..."
  imagePosition="left"
  showBadge={true}
  badgeText="New"
  onClick={...}
  variant="outlined"
/>

<!-- Good: Composition -->
<Card variant="outlined">
  <Card.Image src="..." />
  <Card.Body>
    <Badge>New</Badge>
    <Card.Title>...</Card.Title>
    <Card.Subtitle>...</Card.Subtitle>
  </Card.Body>
</Card>
```

**Props Interface:** Every component gets a typed props interface. Even in Astro:

```astro
---
interface Props {
  /** The heading text displayed in the card */
  title: string;
  /** ISO date string for the publication date */
  date: Date;
  /** URL-safe slug for generating the post link */
  slug: string;
  /** Optional CSS class to override default styling */
  class?: string;
}

const { title, date, slug, class: className } = Astro.props;
---
```

### Component Sizing Guidelines

- **< 50 lines:** Ideal for a leaf component
- **50-150 lines:** Acceptable for a composite component
- **150-300 lines:** Consider breaking it up
- **300+ lines:** Almost certainly needs decomposition

### Separation of Concerns

```
Presentational components  →  How things LOOK (pure UI, takes props)
Container components       →  How things WORK (data, state, logic)
Layout components          →  WHERE things go (grid, spacing, positioning)
```

---

## 4. TypeScript Discipline

### Non-Negotiable Rules

1. **No `any`.** Ever. Use `unknown` if you truly don't know the type, then narrow it.
2. **No type assertions (`as`)** unless you genuinely know better than the compiler. If you're using `as` to silence errors, you have a design problem.
3. **Prefer `interface` for objects, `type` for unions/intersections.**
4. **Use `const` assertions for literal objects:**

```typescript
// Bad - types are widened
const themes = { dark: "#000", light: "#fff" };
// themes.dark is `string`

// Good - types are exact
const themes = { dark: "#000", light: "#fff" } as const;
// themes.dark is `'#000'`
```

1. **Use discriminated unions for state:**

```typescript
// Bad
interface State {
  loading: boolean;
  error: string | null;
  data: Post[] | null;
}

// Good - impossible states are unrepresentable
type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "success"; data: Post[] };
```

1. **Extract and name your types.** Don't inline complex types.

```typescript
// Bad
function getPost(id: string): Promise<{ title: string; body: string; date: Date; author: { name: string; avatar: string } }> { ... }

// Good
interface Author {
  name: string;
  avatar: string;
}

interface Post {
  title: string;
  body: string;
  date: Date;
  author: Author;
}

function getPost(id: string): Promise<Post> { ... }
```

---

## 5. CSS & Styling Architecture

### The Specificity Problem

The #1 sign of amateur CSS is `!important` everywhere. Production CSS has a clear specificity strategy:

```
Layer 1: Reset/Normalize        (lowest specificity)
Layer 2: Design tokens           (CSS custom properties)
Layer 3: Base/element styles      (body, h1-h6, a, p)
Layer 4: Layout utilities         (grid, flex, spacing)
Layer 5: Component styles         (scoped to component)
Layer 6: Variant/state modifiers  (hover, active, theme)
```

### Using CSS Layers (Modern Best Practice)

```css
@layer reset, tokens, base, layout, components, utilities;

@layer reset {
  *,
  *::before,
  *::after {
    box-sizing: border-box;
    margin: 0;
  }
}

@layer tokens {
  :root {
    --color-primary: #7c3aed;
    --space-4: 1rem;
  }
}

@layer base {
  body {
    font-family: var(--font-body);
  }
}

@layer components {
  .card {
    /* ... */
  }
}
```

This eliminates specificity wars entirely. Later layers override earlier ones regardless of selector specificity.

### Tailwind Best Practices

Tailwind is excellent, but production usage requires discipline:

1. **Extract repeated patterns into components**, not `@apply` classes. `@apply` defeats the purpose of utility-first CSS.
2. **Use your `tailwind.config` / `@theme` for tokens**, not arbitrary values like `text-[#a78bfa]` scattered everywhere.
3. **Keep class lists readable.** If a class string is > 80 chars, break it across lines or extract a component.
4. **Use consistent ordering:** layout → sizing → spacing → typography → colors → effects → states.

```html
<!-- Consistent order makes scanning easy -->
<div
  class="flex items-center gap-4 px-6 py-4 text-sm text-zinc-600 bg-surface rounded-lg hover:bg-surface-elevated transition-colors"
></div>
```

### Scoping Styles

In Astro, use `<style>` tags (auto-scoped) or CSS Modules. Avoid global styles bleeding across components. When global styles are needed, be explicit:

```astro
<!-- Scoped by default in Astro -->
<style>
  .card { /* only affects this component */ }
</style>

<!-- When you need global (rare) -->
<style is:global>
  .prose h2 { /* intentionally global */ }
</style>
```

---

## 6. Design Tokens & Theming

### Token Hierarchy

Production design systems use a **three-tier token architecture**:

```
Tier 1: Primitive tokens (raw values)
    --gray-900: #0a0a0a;
    --purple-500: #7c3aed;
    --space-4: 1rem;

Tier 2: Semantic tokens (purpose-driven, reference primitives)
    --color-surface: var(--gray-900);
    --color-primary: var(--purple-500);
    --spacing-element: var(--space-4);

Tier 3: Component tokens (component-specific, reference semantic)
    --card-bg: var(--color-surface);
    --card-padding: var(--spacing-element);
    --button-bg: var(--color-primary);
```

### Theming Done Right

**The Wrong Way (what most rushed code does):**

- Copy-paste every selector per theme with `!important` overrides
- Hardcoded hex values scattered through theme-specific selectors
- Theme-specific classes targeting utility classes (`.bg-variant-x .text-zinc-500`)

**The Right Way:**

- Define themes as sets of semantic token overrides
- Components reference only semantic tokens
- Theme switching changes token values, not component styles

```css
/* Tokens — one place to define all themes */
:root,
[data-theme="original"] {
  --color-bg: #000000;
  --color-text: #f0f0f5;
  --color-text-secondary: #a0a0b8;
  --color-text-muted: #6b6b80;
  --color-accent: #a78bfa;
  --color-border: #2a2a40;
  --color-surface: #0d0d0d;
  --color-header-bg: rgba(0, 0, 0, 0.85);
}

[data-theme="washi"] {
  --color-bg: #f4f0e8;
  --color-text: #1a1a1a;
  --color-text-secondary: #3d3d3d;
  --color-text-muted: #888;
  --color-accent: #5b21b6;
  --color-border: rgba(0, 0, 0, 0.08);
  --color-surface: #f4f0e8;
  --color-header-bg: rgba(244, 240, 232, 0.85);
}

/* Components — reference tokens, never raw colors */
.post-content h2 {
  color: var(--color-text);
}

.post-content p {
  color: var(--color-text-secondary);
}

header {
  background: var(--color-header-bg);
  border-color: var(--color-border);
}
```

**This reduces 1000+ lines of theme CSS to ~50 lines of token definitions + components that just work with any theme.**

### Theme Switching

```html
<!-- Use data-attribute, not class juggling -->
<html data-theme="washi"></html>
```

```javascript
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("theme", theme);
}
```

---

## 7. Accessibility (a11y)

Accessibility is not optional. It's a legal requirement in the EU (European Accessibility Act, June 2025) and a moral obligation everywhere.

### The 80/20 of Accessibility

These practices catch ~80% of accessibility issues:

#### Semantic HTML

```html
<!-- Bad: div soup -->
<div class="header">
  <div class="nav">
    <div onclick="navigate()">Home</div>
  </div>
</div>

<!-- Good: semantic elements -->
<header>
  <nav aria-label="Main navigation">
    <a href="/">Home</a>
  </nav>
</header>
```

**Use the right element:**

- `<button>` for actions (not `<div onclick>`)
- `<a>` for navigation (not `<button>` that calls `window.location`)
- `<nav>` for navigation regions
- `<main>` for primary content
- `<article>` for self-contained content
- `<aside>` for tangentially related content
- `<header>` / `<footer>` for page/section headers/footers
- `<section>` for thematic groupings (with a heading)
- `<h1>`-`<h6>` in proper order (never skip levels)

#### Keyboard Navigation

Every interactive element must be:

1. **Focusable** (via Tab or arrow keys)
2. **Operable** (via Enter, Space, Escape)
3. **Visibly focused** (never `outline: none` without a replacement)

```css
/* Bad */
:focus {
  outline: none;
}

/* Good */
:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```

#### ARIA — The Rules

1. **First rule of ARIA: Don't use ARIA** if native HTML can do it.
2. If you must use ARIA:
   - `aria-label` for elements without visible text
   - `aria-expanded` for toggleable content (dropdowns, accordions)
   - `aria-current="page"` for current navigation item
   - `aria-live="polite"` for dynamic content updates
   - `role="listbox"` / `role="option"` only when native `<select>` won't work

#### Color & Contrast

- Text contrast ratio: **4.5:1** minimum (WCAG AA)
- Large text (18px+ bold or 24px+ regular): **3:1** minimum
- Don't convey information through color alone

#### Images

```html
<!-- Decorative: hide from screen readers -->
<img src="bg-pattern.svg" alt="" aria-hidden="true" />

<!-- Informative: describe the content -->
<img
  src="architecture-diagram.png"
  alt="System architecture showing the bootloader chain from BIOS to kernel"
/>
```

#### Skip Links

```html
<a href="#main-content" class="sr-only focus:not-sr-only">
  Skip to main content
</a>
```

### Accessibility Checklist

- [ ] All interactive elements are keyboard-accessible
- [ ] Focus order follows visual order
- [ ] Focus indicators are visible
- [ ] Images have appropriate alt text
- [ ] Headings follow proper hierarchy (h1 → h2 → h3)
- [ ] Color contrast meets WCAG AA (4.5:1 for text)
- [ ] Form inputs have associated labels
- [ ] Error messages are programmatically associated with inputs
- [ ] Page has a `<main>` landmark
- [ ] Navigation has proper `<nav>` with `aria-label`
- [ ] Dynamic content changes are announced (`aria-live`)
- [ ] Language is set (`<html lang="en">`)

---

## 8. Performance

### Core Web Vitals Targets

| Metric                          | Good    | Needs Improvement | Poor    |
| ------------------------------- | ------- | ----------------- | ------- |
| LCP (Largest Contentful Paint)  | ≤ 2.5s  | ≤ 4.0s            | > 4.0s  |
| INP (Interaction to Next Paint) | ≤ 200ms | ≤ 500ms           | > 500ms |
| CLS (Cumulative Layout Shift)   | ≤ 0.1   | ≤ 0.25            | > 0.25  |

### Font Loading

Fonts are one of the biggest performance killers. Do it right:

```html
<!-- 1. Preconnect to font origins -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />

<!-- 2. Use font-display: swap (or optional) -->
<style>
  @font-face {
    font-family: "Cabinet Grotesk";
    font-display: swap; /* Show fallback immediately, swap when loaded */
    src: url("/fonts/cabinet-grotesk.woff2") format("woff2");
  }
</style>

<!-- 3. Self-host when possible (eliminates third-party dependency) -->
```

**Self-hosting fonts** eliminates DNS lookups, connection overhead, and third-party reliability risk. Production sites should:

1. Download the WOFF2 files
2. Put them in `public/fonts/`
3. Define `@font-face` rules directly

### Image Optimization

```html
<!-- Always specify dimensions to prevent CLS -->
<img
  src="/images/hero.webp"
  alt="..."
  width="1200"
  height="630"
  loading="lazy"
  decoding="async"
/>

<!-- For LCP images: eager load + fetchpriority -->
<img
  src="/images/hero.webp"
  alt="..."
  width="1200"
  height="630"
  loading="eager"
  fetchpriority="high"
/>
```

Use modern formats: **WebP** (93% browser support) or **AVIF** (85%) with `<picture>` fallbacks.

### JavaScript Budget

- **Inline critical JS** (theme switching, FOUC prevention) — keep under 1KB
- **Defer everything else** (`<script defer>` or Astro's default behavior)
- **Avoid render-blocking scripts** in `<head>`
- For static sites (like Astro): most pages should ship **0KB of JavaScript** to the client

### CSS Performance

- Avoid `backdrop-filter` on large areas (GPU-intensive)
- `will-change` should be used sparingly and only on elements that actually animate
- Prefer `transform` and `opacity` for animations (composited, doesn't trigger layout)
- `background-attachment: fixed` causes repaint on scroll on mobile — avoid it

### Reduce Layout Shifts

1. **Always set width/height on images and videos**
2. **Reserve space for dynamic content** (ads, embeds, lazy-loaded sections)
3. **Use `font-display: optional`** if you'd rather avoid font-swap flash
4. **Don't inject content above existing content** after page load

---

## 9. SEO

### Technical SEO Checklist

```html
<head>
  <!-- Essential meta -->
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Descriptive Page Title — Site Name</title>
  <meta
    name="description"
    content="Unique, compelling 150-160 char description"
  />
  <link rel="canonical" href="https://example.com/current-page/" />

  <!-- Open Graph -->
  <meta property="og:title" content="Page Title" />
  <meta property="og:description" content="Page description" />
  <meta property="og:image" content="https://example.com/og-image.jpg" />
  <meta property="og:url" content="https://example.com/current-page/" />
  <meta property="og:type" content="article" />

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />

  <!-- Structured data (JSON-LD) for blog posts -->
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": "Post Title",
      "datePublished": "2025-01-15",
      "author": { "@type": "Person", "name": "Author Name" }
    }
  </script>
</head>
```

### Content SEO

- One `<h1>` per page
- Headings in logical order (`h1` → `h2` → `h3`, never skip levels)
- Descriptive link text (not "click here")
- `alt` text on all informative images
- Proper `<html lang="en">` attribute
- XML sitemap (`/sitemap.xml`) — use `@astrojs/sitemap`
- `robots.txt`

---

## 10. Error Handling

### Graceful Degradation

```astro
---
// Handle data fetching errors at the page level
let posts = [];
try {
  posts = await getCollection("posts");
} catch (error) {
  console.error("Failed to load posts:", error);
  // Page still renders with empty state
}
---

{posts.length > 0 ? (
  posts.map(post => <PostCard {...post} />)
) : (
  <EmptyState message="No posts available." />
)}
```

### For Interactive Components

```typescript
// Always handle edge cases
function formatDate(date: Date | undefined): string {
  if (!date || isNaN(date.getTime())) {
    return "Date unavailable";
  }
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}
```

### Client-Side Error Boundaries

For any client-side JavaScript, wrap risky operations:

```javascript
// Don't let one broken feature crash the whole page
try {
  initThemeSwitcher();
} catch (error) {
  console.error("Theme switcher failed to initialize:", error);
  // Page still works, just without theme switching
}
```

---

## 11. Testing

### The Testing Trophy (Kent C. Dodds Model)

```
           ╱  E2E Tests  ╲         (Few — critical user journeys)
          ╱  Integration   ╲       (Many — how components work together)
         ╱   Unit Tests     ╲      (Some — pure logic, utilities)
        ╱  Static Analysis   ╲     (Always on — TypeScript, ESLint)
```

### What to Test at Each Level

**Static Analysis (Always On)**

- TypeScript strict mode
- ESLint with recommended rules
- Prettier for formatting

**Unit Tests (Pure Functions)**

- Date formatting utilities
- Data transformation functions
- URL slug generation
- Any function with clear input → output

**Integration Tests (Components in Context)**

- Component renders correct HTML structure
- Components respond to prop changes correctly
- Interactive components handle user events
- Page compositions render all expected sections

**E2E Tests (Critical Paths)**

- Homepage loads and displays posts
- Post page renders content correctly
- Theme switcher persists preference
- Navigation works between pages

### Recommended Stack for Astro

- **Static**: TypeScript + ESLint
- **Unit/Integration**: Vitest
- **E2E**: Playwright
- **Visual Regression**: Playwright screenshots or Chromatic

---

## 12. Code Quality & Hygiene

### Naming Conventions

```
Files:
  components/PostCard.astro      (PascalCase for components)
  utils/format-date.ts           (kebab-case for utilities)
  styles/tokens.css              (kebab-case for styles)
  data/site.ts                   (kebab-case for data)

CSS Custom Properties:
  --color-primary                (kebab-case, descriptive)
  --font-heading                 (category-property pattern)
  --space-4                      (category-scale pattern)

CSS Classes:
  .post-card                     (kebab-case, noun-based)
  .post-card--featured           (BEM modifier when needed)
  .is-active                     (state prefix)

JavaScript:
  const formattedDate            (camelCase for variables)
  function formatDate()          (camelCase for functions)
  interface PostProps             (PascalCase for types/interfaces)
  const STORAGE_KEY              (UPPER_SNAKE for constants)
```

### Code Review Checklist

Before shipping any frontend code:

- [ ] No hardcoded colors, sizes, or spacing — use tokens
- [ ] No `!important` unless overriding third-party styles
- [ ] All images have `width`, `height`, and `alt`
- [ ] Interactive elements are keyboard-accessible
- [ ] Component is responsive (check at 320px, 768px, 1024px, 1440px)
- [ ] No console.log/debugger statements
- [ ] TypeScript has no `any` types
- [ ] Animations use `transform`/`opacity` only
- [ ] Fonts have `font-display` set
- [ ] No layout shifts on load

### Linting & Formatting Config

Production projects enforce consistency automatically:

```json
// .eslintrc.json (essentials)
{
  "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "no-console": "warn",
    "prefer-const": "error"
  }
}
```

```json
// .prettierrc
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 100
}
```

---

## 13. Common Anti-Patterns

### 1. The `!important` Cascade

**Symptom:** Adding `!important` to override another `!important`.
**Root Cause:** No specificity strategy, styles fighting each other.
**Fix:** Use CSS layers, scoped styles, or design tokens.

### 2. Theme-Class Shotgun Surgery

**Symptom:** Adding 50+ selectors per theme that override utility classes.
**Example from this codebase:** `.bg-variant-washi .text-zinc-500 { color: #888 !important; }`
**Fix:** Components use semantic tokens (`var(--color-text-muted)`), themes only override token values.

### 3. Div Soup

**Symptom:** Everything is a `<div>` with classes.
**Fix:** Use semantic HTML (`<article>`, `<nav>`, `<header>`, `<section>`, `<aside>`, `<main>`).

### 4. God Component

**Symptom:** A single component file > 300 lines that does everything.
**Fix:** Decompose into focused sub-components.

### 5. Magic Numbers

**Symptom:** `padding: 47px; margin-top: 23px;` with no explanation.
**Fix:** Use spacing tokens from your design system (`--space-6`, `py-6`).

### 6. Inline Styles for Layout

**Symptom:** `style="padding-top: max(16vh, 6rem); padding-bottom: 2rem;"` in templates.
**Fix:** Create utility classes or component-scoped styles. Inline styles are hard to maintain, can't be overridden by themes, and don't respond to breakpoints.

### 7. Font Loading Performance

**Symptom:** Multiple `<link>` tags to external font services blocking render.
**Fix:** Self-host fonts as WOFF2, use `font-display: swap`, preload critical fonts.

### 8. Copy-Paste Components

**Symptom:** Two layout files that are 90% identical (e.g., `PostLayout.astro` and `PrototypePostLayout.astro`).
**Fix:** One layout with variant props or slots for the differing parts.

### 9. Global `<script>` for Component Logic

**Symptom:** `<script>` tags that query the DOM with `getElementById` to set up component behavior.
**Fix:** In Astro, this is sometimes necessary, but scope selectors, clean up event listeners, and prefer `<script>` within the component that owns the DOM. For complex interactivity, use framework islands (React, Svelte, etc.).

### 10. No Error States

**Symptom:** Component assumes data always exists and is always valid.
**Fix:** Handle loading, error, and empty states explicitly.

---

## 14. Audit of This Codebase

Here's a candid analysis of the alkOS Blog against the standards described above.

### What's Done Well

- **Clean Astro setup** with content collections and typed schemas
- **Design tokens defined** in `global.css` `@theme` block
- **Good component decomposition** (Header, Footer, PostCard, TableOfContents, ThemeSwitcher)
- **Proper TypeScript interfaces** on all components
- **Good SEO basics** (meta tags, Open Graph, Twitter cards, sitemap)
- **Theme switcher** has proper ARIA attributes (`aria-haspopup`, `aria-expanded`, `role="listbox"`)
- **FOUC prevention** with inline script for theme

### What Needs Improvement

#### Critical (Breaks maintainability or accessibility)

1. **`themes.css` is 1100+ lines of `!important` overrides.** Each of 7 themes copy-pastes ~150 lines of selectors overriding Tailwind utility classes. This should be ~60 lines of CSS custom property overrides per theme using the token-based approach described in Section 6.

2. **No skip-to-content link.** Keyboard users have no way to bypass the header.

3. **Header starts invisible and inaccessible for 2.5 seconds** (`opacity-0 pointer-events-none` with a `setTimeout`). During this time, navigation is completely unavailable — a significant accessibility issue.

4. **Layout duplication.** `PostLayout.astro` and `PrototypePostLayout.astro` are nearly identical. Should be one layout with a variant mechanism.

5. **Inline styles for spacing** (`style="padding-top: max(16vh, 6rem)"`) in multiple places. Not responsive-aware, hard to maintain, can't be themed.

#### Important (Performance and quality)

1. **External font loading from two different services** (Fontshare + Google Fonts). Three network connections on every page load. Self-host the WOFF2 files instead.

2. **No CSS reset/normalize.** Relying on Tailwind's preflight, which is fine, but the `html { font-size: 120% }` is a blunt instrument — it affects `rem` calculations everywhere and is the kind of global side effect that creates hard-to-debug sizing issues.

3. **`background-attachment: fixed`** in themes.css. This causes jank on mobile Safari and triggers full-page repaints on scroll.

4. **No `robots.txt`**.

5. **No structured data** (JSON-LD) for blog posts.

6. **No ESLint or Prettier config.** Code style is enforced by convention only.

#### Minor (Polish)

1. **No favicon** defined in `<head>`.

2. **`og:url` uses the site root** instead of the current page URL.

3. **Theme data is duplicated** between the `ThemeSwitcher.astro` frontmatter and the `<script>` block (`THEME_META` object mirrors the `themes` array).

4. **Prose styles in `prose.css` hardcode font families** instead of using the `var(--font-heading)` and `var(--font-body)` tokens already defined in `global.css`.

---

## Sources & Further Reading

### Architecture & Patterns

- [Bulletproof React — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- [Patterns.dev — Design Patterns for Modern Web Apps](https://www.patterns.dev/)
- [Frontend Architecture Patterns 2026](https://dev.to/sizan_mahmud0_e7c3fd0cb68/the-complete-guide-to-frontend-architecture-patterns-in-2026-3ioo)
- [React Folder Structure in 5 Steps](https://www.robinwieruch.de/react-folder-structure/)

### CSS & Design Tokens

- [Tailwind CSS Best Practices: Design Tokens & Patterns](https://www.frontendtools.tech/blog/tailwind-css-best-practices-design-system-patterns)
- [CSS Variables Guide: Design Tokens & Theming](https://www.frontendtools.tech/blog/css-variables-guide-design-tokens-theming-2025)
- [Scalable CSS Architecture — Feature-Sliced Design](https://feature-sliced.design/blog/scalable-css-architecture)
- [Design Systems & Design Tokens Complete Guide](https://design.dev/guides/design-systems/)

### Accessibility

- [ARIA Authoring Practices Guide (W3C)](https://www.w3.org/WAI/ARIA/apg/)
- [WebAIM WCAG 2 Checklist](https://webaim.org/standards/wcag/checklist)
- [The Frontend Developer's Accessibility Checklist](https://blog.tsd.digital/the-frontend-developers-accessibility-checklist/)

### Performance

- [Optimize Largest Contentful Paint — web.dev](https://web.dev/articles/optimize-lcp)
- [Core Web Vitals Optimization Guide 2025](https://www.digitalapplied.com/blog/core-web-vitals-optimization-guide-2025)
- [Frontend Performance Checklist 2025](https://strapi.io/blog/frontend-performance-checklist)

### Testing

- [Static vs Unit vs Integration vs E2E — Kent C. Dodds](https://kentcdodds.com/blog/static-vs-unit-vs-integration-vs-e2e-tests)
- [Frontend Testing Guide — Chromatic](https://www.chromatic.com/frontend-testing-guide)

### Code Quality

- [Code Smells and Anti-Patterns — Codacy](https://blog.codacy.com/code-smells-and-anti-patterns)
- [Awesome Codebases — alan2207](https://github.com/alan2207/awesome-codebases)
