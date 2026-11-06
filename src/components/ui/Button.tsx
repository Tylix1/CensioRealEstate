import Link from "next/link";
import type { ComponentProps } from "react";
import { cx } from "./cx";

/**
 * Buttons as in the mockup: brand green for the main action, white with a grey border for the others, violet for
 * the valuer's own actions (Send note & revalue). Every size keeps a touch target of at least 44 px.
 */
export type ButtonVariant = "primary" | "secondary" | "valuer" | "ghost";
export type ButtonSize = "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-[#094c3e]",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-subtle",
  valuer: "bg-valuer text-white hover:bg-[#4a2fa8]",
  ghost: "text-ink-2 hover:bg-subtle hover:text-ink",
};

const SIZES: Record<ButtonSize, string> = {
  md: "min-h-11 px-3.5 py-2.5 text-sm leading-5",
  lg: "min-h-12 px-5 py-3 text-[15px] leading-5",
};

/** The classes of a button, e.g. for a link that looks like one. */
export function buttonClasses(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string): string {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-lg text-center font-semibold no-underline transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export type ButtonProps = ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize };

/** A real `<button>`; `type` defaults to "button" so it never submits a form by accident. */
export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />;
}

export type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize };

/** A Next.js link styled as a button, for actions that only navigate. */
export function ButtonLink({ variant, size, className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}
