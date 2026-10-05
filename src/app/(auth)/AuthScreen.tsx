import { ShaderBackground } from "@/components/ui/ShaderBackground";
import { ValuePropPanel } from "./ValuePropPanel";

/**
 * AuthScreen — the full-bleed dark shell behind every user auth screen.
 *
 * Deliberately not applied in (auth)/layout.tsx: that layout also wraps the
 * business sign-in routes, which are disabled for v1 and are not mine to
 * restyle. Composing a shell instead keeps this change to the five user-facing
 * screens.
 *
 * The shader spans the whole viewport and the value-prop panel sits on top of
 * it with a translucent backdrop, so the two halves read as one surface rather
 * than two panels with a seam down the middle.
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
    <div className="relative flex min-h-screen bg-[#0b0b0d]">
      <ShaderBackground />

      <section
        className={[
          "relative z-10 flex w-full items-center justify-center px-6 py-12 lg:px-16",
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
  );
}
