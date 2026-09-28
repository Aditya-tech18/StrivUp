"use client";

/**
 * global-error.tsx — last line of defence.
 *
 * Catches errors thrown in the root layout itself, which the (app) boundary
 * cannot reach. Because it replaces the root layout when it renders, it MUST
 * supply its own <html> and <body>, and it cannot rely on anything the root
 * layout normally provides — no Inter font variable, no globals.css cascade
 * guarantees. So the styling here is intentionally self-contained inline CSS
 * rather than Tailwind classes.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#fbf9f9",
          color: "#1b1c1c",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "26rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "19px", fontWeight: 700, margin: 0 }}>
            StrivUp didn&apos;t load
          </h1>
          <p
            style={{
              marginTop: "8px",
              fontSize: "14px",
              lineHeight: 1.6,
              color: "#4c4546",
            }}
          >
            Something broke before the app could start. Reloading usually fixes
            it. If it keeps happening, let us know and quote the reference
            below.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "24px",
              height: "40px",
              padding: "0 20px",
              borderRadius: "9999px",
              border: "none",
              backgroundColor: "#000000",
              color: "#ffffff",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>

          {error.digest ? (
            <p
              style={{
                marginTop: "32px",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "11px",
                color: "#7e7576",
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
