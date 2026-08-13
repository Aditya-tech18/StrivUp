# Striv Design System

> Token source of truth: [`src/app/globals.css`](../src/app/globals.css) — `@theme` block.  
> Primitives: [`src/components/ui/`](../src/components/ui/)  
> Review route: `http://localhost:3000/dev/components`

---

## Color Tokens

All colors are defined as Tailwind v4 `@theme` CSS custom properties and generate utility classes automatically (e.g. `bg-primary`, `text-on-primary`).

### Primary (Black / Navy)

| Token | Value | Tailwind class |
|---|---|---|
| `primary` | `#000000` | `bg-primary` / `text-primary` |
| `on-primary` | `#ffffff` | `text-on-primary` |
| `primary-container` | `#0d1c32` (dark navy) | `bg-primary-container` |
| `on-primary-container` | `#76849f` | `text-on-primary-container` |
| `primary-fixed` | `#d6e3ff` | `bg-primary-fixed` |
| `primary-fixed-dim` | `#b9c7e4` | `bg-primary-fixed-dim` |

> **Note:** `primary` is pure black (#000000) — intentional, not a Stitch default.  
> `primary-container` is the dark navy #0d1c32 used for elevated surfaces and overlays.

### Secondary (Brand Blue)

| Token | Value | Tailwind class |
|---|---|---|
| `secondary` | `#1d4ed8` | `bg-secondary` / `text-secondary` |
| `on-secondary` | `#ffffff` | `text-on-secondary` |
| `secondary-container` | `#4069f2` | `bg-secondary-container` |
| `on-secondary-container` | `#fffbff` | `text-on-secondary-container` |
| `secondary-fixed` | `#dce1ff` | `bg-secondary-fixed` |
| `secondary-fixed-dim` | `#b7c4ff` | `bg-secondary-fixed-dim` |

### Background & Surface

| Token | Value | Notes |
|---|---|---|
| `background` / `surface` | `#fbf9fb` | Same value — body background |
| `on-background` / `on-surface` | `#1b1b1d` | Body text |
| `surface-variant` | `#e4e2e4` | Chip / input backgrounds |
| `on-surface-variant` | `#44474d` | Secondary text, placeholders |
| `surface-container-lowest` | `#ffffff` | Input fill, pure white |
| `surface-container-low` | `#f5f3f5` | Card background |
| `surface-container` | `#efedef` | Elevated card |
| `surface-container-high` | `#eae7ea` | Overlay / dropdown |
| `surface-container-highest` | `#e4e2e4` | Highest elevation |
| `surface-dim` | `#dbd9db` | Scrim / dimmed surface |
| `surface-bright` | `#fbf9fb` | Bright surface |

### Outline

| Token | Value |
|---|---|
| `outline` | `#75777e` — borders on interactive elements |
| `outline-variant` | `#c5c6cd` — dividers, subtle borders |

### Tertiary & Error

| Token | Value |
|---|---|
| `tertiary-fixed` | `#6ffbbe` — success tint |
| `on-tertiary-container` | `#009668` — success text |
| `error` | `#ba1a1a` |
| `error-container` | `#ffdad6` |

---

## Typography

Font: **Inter** loaded via `next/font/google`, weights 400/500/600/700/800.  
Use the semantic `.type-*` CSS utility classes — they bundle size + line-height + weight + tracking.

| Class | Size / LH | Weight | Tracking |
|---|---|---|---|
| `.type-display-lg` | 32px / 40px | 700 | −0.02em |
| `.type-headline-md` | 24px / 32px | 600 | −0.01em |
| `.type-headline-sm` | 20px / 28px | 600 | — |
| `.type-body-lg` | 16px / 24px | 400 | — |
| `.type-body-md` | 14px / 20px | 400 | — |
| `.type-label-caps` | 12px / 16px | 600 | +0.05em, uppercase |
| `.type-stat-value` | 28px / 32px | 700 | −0.01em |

```tsx
<h1 className="type-display-lg">Title</h1>
<p className="type-body-lg text-on-surface-variant">Subtitle</p>
```

---

## Spacing

| Token (CSS var) | Value | Usage |
|---|---|---|
| `--spacing-unit` | 4px | Base grid unit |
| `--spacing-stack-gap-sm` | 8px | Tight stacks |
| `--spacing-stack-gap-md` | 16px | Standard stacks |
| `--spacing-stack-gap-lg` | 24px | Loose stacks |
| `--spacing-container-padding` | 20px | Horizontal page gutters |
| `--spacing-section-margin` | 32px | Between page sections |

Use via inline style or Tailwind arbitrary: `gap-[var(--spacing-stack-gap-md)]`  
Or use standard Tailwind spacing (grid unit = 4px = Tailwind `1`): `gap-4` = 16px.

---

## Border Radius

| Name | Value | Tailwind class |
|---|---|---|
| default | 4px | `rounded` |
| lg | 8px | `rounded-lg` |
| xl | 12px | `rounded-xl` |
| full | 9999px | `rounded-full` |

---

## Icons

Two icon systems in use:

### Material Symbols Outlined (primary)
Variable font loaded from Google Fonts in `globals.css`.

```tsx
<span
  className="material-symbols-outlined"
  style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}
  aria-hidden="true"
>
  home
</span>
```

FILL: 0 = outlined, 1 = filled. Animate between states for active indicators.

### lucide-react (fallback)
Used where a direct Material Symbol equivalent doesn't exist or for typed React components.

```tsx
import { Search } from "lucide-react";
<Search size={20} className="text-on-surface-variant" />
```

---

## Component Primitives

All in `src/components/ui/` — import from the barrel:

```ts
import { Button, Input, Card, CardHeader, CardFooter, Badge, BottomNav } from "@/components/ui";
```

### Button

```tsx
<Button variant="primary">Save</Button>
<Button variant="secondary" size="sm">Cancel</Button>
<Button variant="outline" fullWidth>Learn more</Button>
```

| Prop | Type | Default |
|---|---|---|
| `variant` | `"primary" \| "secondary" \| "outline"` | `"primary"` |
| `size` | `"sm" \| "md" \| "lg"` | `"md"` |
| `fullWidth` | `boolean` | `false` |

### Input

```tsx
<Input label="Email" type="email" hint="We'll keep this private." />
<Input label="Search" leadingIcon={<Search size={16} />} />
<Input label="Password" error="Required." />
```

| Prop | Type |
|---|---|
| `label` | `string` |
| `hint` | `string` |
| `error` | `string` |
| `leadingIcon` | `React.ReactNode` |

### Card

```tsx
<Card bordered padding="lg">
  <CardHeader><h2 className="type-headline-sm">Title</h2></CardHeader>
  <p>Body content</p>
  <CardFooter><Button size="sm">Action</Button></CardFooter>
</Card>
```

| Prop | Type | Default |
|---|---|---|
| `bordered` | `boolean` | `false` |
| `padding` | `"none" \| "sm" \| "md" \| "lg"` | `"md"` |

### Badge

```tsx
<Badge variant="success">Completed</Badge>
<Badge variant="error">Failed</Badge>
```

Variants: `default` `primary` `secondary` `success` `error` `outline`

### BottomNav

```tsx
<BottomNav items={[
  { href: "/feed",    icon: "home",   label: "Feed"    },
  { href: "/search",  icon: "search", label: "Search"  },
  { href: "/profile", icon: "person", label: "Profile" },
]} />
```

- Active state derived from `usePathname()` — no manual prop needed.
- Icons use Material Symbols Outlined with FILL animation on active.
- Hidden on `md+` via `md:hidden`; the desktop sidebar handles navigation above that breakpoint.
- Place inside the `(app)` layout shell.
