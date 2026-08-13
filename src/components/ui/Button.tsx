import { type ButtonHTMLAttributes, forwardRef } from "react";

type ButtonVariant = "primary" | "secondary" | "outline";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-on-primary hover:opacity-90 active:opacity-80 shadow-sm",
  secondary:
    "bg-secondary text-on-secondary hover:opacity-90 active:opacity-80 shadow-sm",
  outline:
    "bg-transparent text-primary border border-outline hover:bg-surface-variant active:bg-surface-container",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[var(--font-size-body-md)] gap-1.5",
  md: "h-10 px-4 text-[var(--font-size-body-lg)] gap-2",
  lg: "h-12 px-6 text-[var(--font-size-body-lg)] gap-2",
};

/**
 * Button — primary, secondary, or outline variant.
 *
 * Usage:
 *   <Button variant="primary">Save</Button>
 *   <Button variant="secondary" size="sm">Cancel</Button>
 *   <Button variant="outline">Learn more</Button>
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = "primary", size = "md", fullWidth = false, className = "", children, disabled, ...props },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={[
          // Base
          "inline-flex items-center justify-center font-semibold rounded select-none",
          "transition-all duration-150 ease-in-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2",
          "disabled:opacity-40 disabled:pointer-events-none",
          // Variant
          variantClasses[variant],
          // Size
          sizeClasses[size],
          // Width
          fullWidth ? "w-full" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
