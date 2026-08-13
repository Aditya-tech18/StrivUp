import { type HTMLAttributes } from "react";

type BadgeVariant = "default" | "primary" | "secondary" | "success" | "error" | "outline";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default:   "bg-surface-container text-on-surface-variant",
  primary:   "bg-primary-container text-on-primary-container",
  secondary: "bg-secondary-container text-on-secondary-container",
  success:   "bg-tertiary-fixed text-on-tertiary-container",
  error:     "bg-error-container text-error",
  outline:   "bg-transparent text-on-surface-variant border border-outline-variant",
};

/**
 * Badge — compact label chip for status, categories, or counts.
 *
 * Usage:
 *   <Badge>New</Badge>
 *   <Badge variant="secondary">Beta</Badge>
 *   <Badge variant="error">Error</Badge>
 */
export function Badge({
  variant = "default",
  className = "",
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2 py-0.5",
        "type-label-caps whitespace-nowrap",
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </span>
  );
}
