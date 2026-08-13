/**
 * /dev/components — design-system component review page.
 *
 * This route renders every UI primitive variant for visual inspection.
 * It is intentionally unstyled at the page level; only token-based
 * component styles are used.
 *
 * Production guard: this page 404s in any non-development environment,
 * regardless of what proxy.ts does. The route still builds so the
 * TypeScript compiler and static analysis remain happy.
 */

import { notFound } from "next/navigation";
import { Search } from "lucide-react";
import { Badge, BottomNav, Button, Card, CardFooter, CardHeader, Input } from "@/components/ui";

export default function ComponentsPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background p-[var(--spacing-container-padding)]">
      <div className="mx-auto max-w-2xl space-y-[var(--spacing-section-margin)]">

        {/* ── Header ── */}
        <header>
          <p className="type-label-caps text-on-surface-variant mb-1">Design System</p>
          <h1 className="type-display-lg text-on-background">Component Review</h1>
          <p className="type-body-lg text-on-surface-variant mt-2">
            All primitive variants rendered from{" "}
            <code className="rounded bg-surface-container px-1 py-0.5 text-sm font-mono text-on-surface">
              src/components/ui/
            </code>
          </p>
        </header>

        {/* ── Color Palette ── */}
        <section aria-labelledby="palette-heading">
          <h2 id="palette-heading" className="type-headline-md mb-[var(--spacing-stack-gap-md)]">
            Color Tokens
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              { name: "primary",           bg: "bg-primary",                    text: "text-on-primary"           },
              { name: "primary-container", bg: "bg-primary-container",          text: "text-on-primary-container" },
              { name: "secondary",         bg: "bg-secondary",                  text: "text-on-secondary"         },
              { name: "secondary-container", bg: "bg-secondary-container",      text: "text-on-secondary-container" },
              { name: "surface",           bg: "bg-surface",                    text: "text-on-surface border border-outline-variant" },
              { name: "surface-variant",   bg: "bg-surface-variant",            text: "text-on-surface-variant"   },
              { name: "error",             bg: "bg-error",                      text: "text-on-primary"           },
              { name: "error-container",   bg: "bg-error-container",            text: "text-error"                },
              { name: "tertiary-fixed",    bg: "bg-tertiary-fixed",             text: "text-on-tertiary-container" },
            ].map(({ name, bg, text }) => (
              <div key={name} className={`rounded-lg p-3 ${bg}`}>
                <p className={`type-label-caps ${text}`}>{name}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Typography ── */}
        <section aria-labelledby="type-heading">
          <h2 id="type-heading" className="type-headline-md mb-[var(--spacing-stack-gap-md)]">
            Typography Scale
          </h2>
          <Card bordered padding="lg">
            <div className="space-y-4">
              <p className="type-display-lg">display-lg — 32/40 700 −2%</p>
              <p className="type-headline-md">headline-md — 24/32 600 −1%</p>
              <p className="type-headline-sm">headline-sm — 20/28 600</p>
              <p className="type-body-lg">body-lg — 16/24 400</p>
              <p className="type-body-md">body-md — 14/20 400</p>
              <p className="type-label-caps">label-caps — 12/16 600 +5% uppercase</p>
              <p className="type-stat-value">28 stat-value 700 −1%</p>
            </div>
          </Card>
        </section>

        {/* ── Button ── */}
        <section aria-labelledby="button-heading">
          <h2 id="button-heading" className="type-headline-md mb-[var(--spacing-stack-gap-md)]">
            Button
          </h2>
          <Card bordered padding="lg">
            <div className="space-y-[var(--spacing-stack-gap-md)]">
              {/* Variants */}
              <div>
                <p className="type-label-caps text-on-surface-variant mb-2">Variants</p>
                <div className="flex flex-wrap gap-3">
                  <Button variant="primary">Primary</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="outline">Outline</Button>
                </div>
              </div>
              {/* Sizes */}
              <div>
                <p className="type-label-caps text-on-surface-variant mb-2">Sizes</p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm">Small</Button>
                  <Button size="md">Medium</Button>
                  <Button size="lg">Large</Button>
                </div>
              </div>
              {/* Disabled */}
              <div>
                <p className="type-label-caps text-on-surface-variant mb-2">Disabled</p>
                <div className="flex flex-wrap gap-3">
                  <Button variant="primary" disabled>Primary</Button>
                  <Button variant="secondary" disabled>Secondary</Button>
                  <Button variant="outline" disabled>Outline</Button>
                </div>
              </div>
              {/* Full width */}
              <div>
                <p className="type-label-caps text-on-surface-variant mb-2">Full Width</p>
                <Button fullWidth>Full Width Button</Button>
              </div>
            </div>
          </Card>
        </section>

        {/* ── Input ── */}
        <section aria-labelledby="input-heading">
          <h2 id="input-heading" className="type-headline-md mb-[var(--spacing-stack-gap-md)]">
            Input
          </h2>
          <Card bordered padding="lg">
            <div className="space-y-[var(--spacing-stack-gap-md)]">
              <Input label="Default" placeholder="Enter text…" />
              <Input
                label="With hint"
                placeholder="Enter email…"
                type="email"
                hint="We'll never share your email."
              />
              <Input
                label="With leading icon"
                placeholder="Search…"
                leadingIcon={<Search size={16} />}
              />
              <Input
                label="Error state"
                defaultValue="bad input"
                error="This field is required."
              />
              <Input label="Disabled" placeholder="Cannot edit…" disabled />
            </div>
          </Card>
        </section>

        {/* ── Card ── */}
        <section aria-labelledby="card-heading">
          <h2 id="card-heading" className="type-headline-md mb-[var(--spacing-stack-gap-md)]">
            Card
          </h2>
          <div className="space-y-3">
            <Card padding="md">
              <p className="type-body-md text-on-surface-variant">Default card — no border, md padding</p>
            </Card>
            <Card bordered padding="md">
              <p className="type-body-md text-on-surface-variant">Bordered card</p>
            </Card>
            <Card bordered padding="lg">
              <CardHeader>
                <p className="type-headline-sm">Card with header &amp; footer</p>
              </CardHeader>
              <p className="type-body-lg">Card body content goes here.</p>
              <CardFooter>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm">Cancel</Button>
                  <Button variant="primary" size="sm">Confirm</Button>
                </div>
              </CardFooter>
            </Card>
          </div>
        </section>

        {/* ── Badge ── */}
        <section aria-labelledby="badge-heading">
          <h2 id="badge-heading" className="type-headline-md mb-[var(--spacing-stack-gap-md)]">
            Badge
          </h2>
          <Card bordered padding="md">
            <div className="flex flex-wrap gap-2">
              <Badge>Default</Badge>
              <Badge variant="primary">Primary</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="error">Error</Badge>
              <Badge variant="outline">Outline</Badge>
            </div>
          </Card>
        </section>

        {/* ── BottomNav ── */}
        <section aria-labelledby="bottomnav-heading">
          <h2 id="bottomnav-heading" className="type-headline-md mb-[var(--spacing-stack-gap-md)]">
            BottomNav
          </h2>
          <Card bordered padding="none">
            <p className="type-body-md text-on-surface-variant p-4 pb-0">
              Preview (static — actual component is{" "}
              <code className="font-mono text-sm">position:fixed</code> on mobile):
            </p>
            {/* Static mock — not fixed, just for visual preview */}
            <div className="relative overflow-hidden rounded-b-lg">
              <nav
                aria-label="Bottom navigation preview"
                className="flex h-16 items-stretch border-t border-outline-variant bg-surface-container-low"
              >
                {[
                  { icon: "home",    label: "Feed",    active: true  },
                  { icon: "search",  label: "Search",  active: false },
                  { icon: "add_box", label: "Post",    active: false },
                  { icon: "person",  label: "Profile", active: false },
                ].map(({ icon, label, active }) => (
                  <div
                    key={icon}
                    className={[
                      "flex flex-1 flex-col items-center justify-center gap-0.5",
                      active ? "text-secondary" : "text-on-surface-variant",
                    ].join(" ")}
                  >
                    <span
                      className="material-symbols-outlined text-[24px] leading-none"
                      style={{
                        fontVariationSettings: active
                          ? "'FILL' 1, 'wght' 500"
                          : "'FILL' 0, 'wght' 400",
                      }}
                      aria-hidden="true"
                    >
                      {icon}
                    </span>
                    <span className="text-[10px] font-semibold tracking-wide">
                      {label}
                    </span>
                  </div>
                ))}
              </nav>
            </div>
          </Card>
          <p className="type-body-md text-on-surface-variant mt-2">
            The live <code className="font-mono text-sm">{"<BottomNav />"}</code> component
            is fixed to the viewport bottom and hidden on{" "}
            <code className="font-mono text-sm">md+</code> screens.
          </p>
        </section>

        {/* ── Spacing ── */}
        <section aria-labelledby="spacing-heading">
          <h2 id="spacing-heading" className="type-headline-md mb-[var(--spacing-stack-gap-md)]">
            Spacing Tokens
          </h2>
          <Card bordered padding="md">
            <div className="space-y-3">
              {[
                { name: "stack-gap-sm (8px)",        width: "w-2"    },
                { name: "stack-gap-md (16px)",        width: "w-4"    },
                { name: "stack-gap-lg (24px)",        width: "w-6"    },
                { name: "container-padding (20px)",   width: "w-5"    },
                { name: "section-margin (32px)",      width: "w-8"    },
              ].map(({ name, width }) => (
                <div key={name} className="flex items-center gap-3">
                  <div className={`${width} h-4 rounded bg-secondary-container flex-shrink-0`} />
                  <p className="type-body-md text-on-surface-variant">{name}</p>
                </div>
              ))}
            </div>
          </Card>
        </section>

        {/* ── Border Radius ── */}
        <section aria-labelledby="radius-heading">
          <h2 id="radius-heading" className="type-headline-md mb-[var(--spacing-stack-gap-md)]">
            Border Radius
          </h2>
          <Card bordered padding="md">
            <div className="flex flex-wrap gap-4 items-end">
              {[
                { name: "default (4px)", cls: "rounded"      },
                { name: "lg (8px)",      cls: "rounded-lg"   },
                { name: "xl (12px)",     cls: "rounded-xl"   },
                { name: "full",          cls: "rounded-full"  },
              ].map(({ name, cls }) => (
                <div key={name} className="flex flex-col items-center gap-1">
                  <div
                    className={`w-12 h-12 bg-primary-container ${cls}`}
                  />
                  <p className="type-label-caps text-on-surface-variant">{name}</p>
                </div>
              ))}
            </div>
          </Card>
        </section>

      </div>
    </div>
  );
}
