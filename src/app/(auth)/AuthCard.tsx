import Link from "next/link";
import { BrandMark } from "@/components/ui";

/**
 * The card shell on its own, for screens that bring their own header — the
 * business sign-in forms render their own logo and headline, so they use this
 * rather than <AuthCard>.
 */
export const authCardCls = [
  "w-full max-w-sm rounded-3xl border border-outline-variant",
  "bg-surface-container-lowest p-5 sm:p-8 elev-2",
].join(" ");

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
    <div className={`${authCardCls} space-y-7`}>
      <div className="space-y-4 text-center">
        <div className="flex justify-center">
          <Link
            href="/"
            aria-label="StrivUp home"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-secondary/10 px-3 font-display text-base font-extrabold text-secondary transition-colors hover:bg-secondary/15"
          >
            <span aria-hidden="true"><BrandMark variant="mark" height={22} priority /></span>
            StrivUp
          </Link>
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-on-surface">{title}</h1>
          {subtitle ? <p className="text-body-md text-on-surface-variant">{subtitle}</p> : null}
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-error-outline bg-error-container px-4 py-3 text-body-md text-on-error-container"
        >
          {error}
        </div>
      ) : null}

      {children}

      {footer ? (
        <p className="text-center text-body-md text-on-surface-variant">{footer}</p>
      ) : null}
    </div>
  );
}

/**
 * AuthField — a floating-label input.
 *
 * The label starts sitting on the field and lifts away once there is a value
 * or focus. It works off the `placeholder-shown` state, so the placeholder
 * must stay a single space — that is load-bearing, not a typo. The lift itself
 * lives in .float-label in globals.css; see the note there on why it is one
 * CSS rule rather than a pair of Tailwind peer variants.
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
            "text-body-lg text-on-surface",
            "transition-colors duration-200 focus:outline-none focus:ring-0",
            error
              ? "border-error focus:border-error"
              : "border-outline-variant focus:border-secondary",
            "disabled:opacity-40",
          ]
            .filter(Boolean)
            .join(" ")}
          {...props}
        />
        <label
          htmlFor={id}
          // Positioning and the lift live in .float-label (globals.css).
          className="float-label text-body-md text-on-surface-variant"
        >
          {icon ? <span className="mr-1.5 inline-block align-middle">{icon}</span> : null}
          {label}
        </label>
        {trailing ? (
          <span className="absolute right-0 top-1/2 -translate-y-1/2">{trailing}</span>
        ) : null}
      </div>

      {error ? (
        <p id={`${id}-error`} role="alert" className="text-body-md text-error">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-label-sm text-on-surface-variant">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** The Google button, identical on login and signup. */
export const authSocialBtnCls = [
  "w-full flex items-center justify-center gap-3 h-11 px-4 rounded-xl",
  "border border-outline-variant bg-surface-container-lowest hover:bg-surface-container",
  "text-body-lg font-semibold text-on-surface",
  "transition-colors duration-150",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2",
  "disabled:opacity-50 disabled:cursor-not-allowed",
].join(" ");

/** The primary submit button, in the brand's action blue. */
export const authSubmitBtnCls = [
  "group w-full flex items-center justify-center gap-2 h-11 px-4 rounded-xl",
  "bg-secondary text-on-secondary text-body-lg font-semibold hover:opacity-90",
  "elev-brand transition-all duration-200",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2",
  "disabled:opacity-50 disabled:cursor-not-allowed",
].join(" ");
