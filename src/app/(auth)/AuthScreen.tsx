import { MagneticCursor } from "@/components/ui/MagneticCursor";
import { MeshBackground } from "@/components/ui/MeshBackground";
import { ValuePropPanel } from "./ValuePropPanel";

/**
 * AuthScreen — the shell behind every user auth screen.
 *
 * Shares the entry screen's mesh background and magnetic cursor, so signing in
 * is visibly the same product as the page that sent you there. The cursor was
 * previously mounted only on the entry screen, which made it look broken the
 * moment anyone clicked through to /login.
 *
 * Deliberately not applied in (auth)/layout.tsx: that layout also wraps the
 * business sign-in routes, which are disabled for v1 and are not mine to
 * restyle. Composing a shell instead keeps this to the user-facing screens.
 */
export function AuthScreen({
  children,
  /** Desktop-only right panel. Off for the short single-purpose screens. */
  showPanel = true,
}: {
  children: React.ReactNode;
  showPanel?: boolean;
}) {
  return (
    <MagneticCursor>
      <div className="relative isolate flex min-h-screen overflow-hidden bg-surface">
        <MeshBackground />

        <section
          className={[
            "relative z-10 flex w-full items-center justify-center px-gutter py-12 lg:px-16",
            showPanel ? "lg:w-1/2" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {children}
        </section>

        {showPanel ? (
          <div className="relative z-10 hidden lg:block lg:w-1/2">
            <ValuePropPanel />
          </div>
        ) : null}
      </div>
    </MagneticCursor>
  );
}
