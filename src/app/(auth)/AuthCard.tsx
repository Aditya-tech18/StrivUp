import Link from "next/link";
import { Flame } from "lucide-react";

/**
 * AuthCard — the glass panel every auth screen sits in.
 *
 * Dark-on-dark by design. The right-hand ValuePropPanel was already
 * near-black (primary-container) with white/10 glass cards, so making the form
 * side match turns the auth screen into one continuous dark surface instead of
 * a white rectangle bolted to a black one.
 *
 * Colours come from the existing tokens — primary-container for the ink,
 * secondary (#1d4ed8) for the action — not from the reference's raw blues.
 */
export function AuthCard({
  title,
  subtitle,
  error,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  /** Rendered as an alert banner above the content when present. */
  error?: string | null;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-sm space-y-7 rounded-2xl border border-white/15 bg-white/10 p-8 elev-5 backdrop-blur-lg">
      <div className="space-y-4 text-center">
        <div className="flex justify-center">
          <Link
            href="/"
            aria-label="StrivUp home"
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 transition-colors hover:bg-white/15"
          >
            <Flame size={24} className="text-secondary-fixed" aria-hidden="true" />
          </Link>
        </div>
        <div className="space-y-1">
          <h1 className="text-headline-lg-mobile text-on-primary">{title}</h1>
          {subtitle ? (
            <p className="text-body-md text-on-primary-container">{subtitle}</p>
          ) : null}
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-error-outline/40 bg-error/20 px-4 py-3 text-body-md text-white"
        >
          {error}
        </div>
      ) : null}

      {children}

      {footer ? (
        <p className="text-center text-body-md text-on-primary-container">{footer}</p>
      ) : null}
    </div>
  );
}

/**
 * AuthField — a floating-label input for the glass panel.
 *
 * The label starts sitting on the field and lifts away once there is a value
 * or focus, which is the pattern in the reference design. It works off the
 * `placeholder-shown` state, so the placeholder must stay a single space —
 * that is load-bearing, not a typo.
 *
 * The label is a real <label htmlFor>, so clicking it focuses the input and
 * screen readers announce it normally; the icon inside is decorative.
 */
export function AuthField({
  id,
  label,
  icon,
  error,
  hint,
  trailing,
  ...props
}: {
  id: string;
  label: string;
  icon?: React.ReactNode;
  error?: string;
  hint?: string;
  /** Rendered against the right edge — the password show/hide toggle. */
  trailing?: React.ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="space-y-1">
      <div className="relative">
        <input
          id={id}
          // Load-bearing: the floating label keys off :placeholder-shown.
          placeholder=" "
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={[
            "float-field block w-full appearance-none border-0 border-b-2 bg-transparent px-0 pt-5 pb-2",
            trailing ? "pr-9" : "",
            "text-body-lg text-on-primary",
            "transition-colors duration-200 focus:outline-none focus:ring-0",
            error
              ? "border-error-outline focus:border-error-outline"
              : "border-white/25 focus:border-secondary-fixed-dim",
            "disabled:opacity-40",
          ]
            .filter(Boolean)
            .join(" ")}
          {...props}
        />
        <label
          htmlFor={id}
          // Positioning and the lift live in .float-label (globals.css) —
          // see the note there on why this is not a set of peer variants.
          className="float-label text-body-md text-on-primary-container"
        >
          {icon ? <span className="mr-1.5 inline-block align-middle">{icon}</span> : null}
          {label}
        </label>
        {trailing ? (
          <span className="absolute right-0 top-1/2 -translate-y-1/2">{trailing}</span>
        ) : null}
      </div>

      {error ? (
        <p id={`${id}-error`} role="alert" className="text-body-md text-error-outline">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-label-sm text-on-primary-container">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** The Google button, identical on login and signup. */
export const authSocialBtnCls = [
  "w-full flex items-center justify-center gap-3 h-11 px-4 rounded-xl",
  "bg-white/90 hover:bg-white text-body-lg font-semibold text-[#1b1c1c]",
  "transition-colors duration-150",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-fixed-dim focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
  "disabled:opacity-50 disabled:cursor-not-allowed",
].join(" ");

/** The primary submit button, in the brand's action blue. */
export const authSubmitBtnCls = [
  "group w-full flex items-center justify-center gap-2 h-11 px-4 rounded-xl",
  "bg-secondary hover:bg-secondary-container text-on-secondary text-body-lg font-semibold",
  "transition-all duration-200",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-fixed-dim focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
  "disabled:opacity-50 disabled:cursor-not-allowed",
].join(" ");
