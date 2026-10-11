import { type HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds a subtle 1px border using outline-variant */
  bordered?: boolean;
  /** Padding preset */
  padding?: "none" | "sm" | "md" | "lg";
  /**
   * How far off the page the card sits. 1 is the resting state for content,
   * 3 and up are for things that overlay other content.
   */
  elevation?: 0 | 1 | 2 | 3 | 4 | 5;
  /** Lifts on hover. Only for cards that are themselves a link or button. */
  interactive?: boolean;
}

const paddingClasses = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

const elevationClasses = {
  0: "",
  1: "elev-1",
  2: "elev-2",
  3: "elev-3",
  4: "elev-4",
  5: "elev-5",
} as const;

/**
 * Card — surface container with optional border and padding presets.
 *
 * Usage:
 *   <Card>…</Card>
 *   <Card bordered padding="lg">…</Card>
 *   <Card elevation={2} interactive>…</Card>
 *
 * Defaults to elevation 1 so every existing Card gains depth without being
 * touched. Pass elevation={0} to opt a card back out.
 */
export function Card({
  bordered = false,
  padding = "md",
  elevation = 1,
  interactive = false,
  className = "",
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={[
        // The lightest surface in the ramp reads as "nearest" once it has a
        // shadow under it; the old surface-container-low sat too close to the
        // page background to look raised.
        "rounded-xl bg-surface-container-lowest",
        elevationClasses[elevation],
        "surface-raised",
        interactive ? "lift cursor-pointer" : "",
        bordered ? "border border-outline-variant" : "",
        paddingClasses[padding],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

/** Convenience sub-components for semantic card sections */
export function CardHeader({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["border-b border-outline-variant pb-3 mb-3", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardFooter({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["border-t border-outline-variant pt-3 mt-3", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}
