import { MeshBackground } from "@/components/ui/MeshBackground";

/**
 * AuthScreen — the shell behind every sign-in screen, user and business.
 *
 * One centred card on the entry screen's mesh background, and nothing else.
 *
 * It used to carry a desktop-only panel describing the product and the
 * magnetic cursor from the entry screen. Both are gone: by the time someone is
 * on a sign-in form they have already decided, so the pitch was repeating
 * itself, and the cursor was a front-door flourish that only made the form
 * harder to aim at. The entry screen keeps both.
 */
export function AuthScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-surface px-gutter py-12">
      <MeshBackground />
      <div className="relative z-10 flex w-full justify-center">{children}</div>
    </div>
  );
}
