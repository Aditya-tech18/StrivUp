import { type InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  /** Lucide or Material Symbol icon rendered on the left */
  leadingIcon?: React.ReactNode;
}

/**
 * Input — labelled text field with optional leading icon, hint, and error state.
 *
 * Usage:
 *   <Input label="Email" type="email" placeholder="you@example.com" />
 *   <Input label="Search" leadingIcon={<Search size={16} />} />
 *   <Input label="Password" error="Too short" />
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, leadingIcon, className = "", id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    const hasError = Boolean(error);

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={inputId}
            className="type-body-md font-medium text-on-surface"
          >
            {label}
          </label>
        )}

        <div className="relative flex items-center">
          {leadingIcon && (
            <span className="absolute left-3 text-on-surface-variant pointer-events-none flex items-center">
              {leadingIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={[
              "w-full rounded border bg-surface-container-lowest",
              "text-on-surface placeholder:text-on-surface-variant",
              "text-[var(--font-size-body-lg)] leading-6",
              "transition-colors duration-150",
              "h-10 px-3",
              leadingIcon ? "pl-9" : "",
              hasError
                ? "border-error focus:ring-error/30 focus:border-error"
                : "border-outline-variant focus:border-secondary focus:ring-secondary/20",
              "focus:outline-none focus:ring-2",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              className,
            ]
              .filter(Boolean)
              .join(" ")}
            aria-invalid={hasError}
            aria-describedby={
              error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
            }
            {...props}
          />
        </div>

        {error && (
          <p id={`${inputId}-error`} className="type-body-md text-error" role="alert">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${inputId}-hint`} className="type-body-md text-on-surface-variant">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
