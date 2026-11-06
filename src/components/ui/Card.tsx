import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export type CardProps = HTMLAttributes<HTMLElement> & { as?: "div" | "section" | "article" | "aside" | "li" };

/** The white surface with a hairline border and 12 px corners that holds every block of the mockup. No padding. */
export function Card({ as: Tag = "div", className, ...props }: CardProps) {
  return <Tag className={cx("rounded-xl border border-line bg-surface", className)} {...props} />;
}
