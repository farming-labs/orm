import React from "react";
import { cn } from "@/lib/utils";
import styles from "./pattern-text.module.css";

type PatternTextProps = {
  text?: string;
  className?: string;
  as?: "p" | "span" | "div";
} & Omit<React.ComponentPropsWithoutRef<"p">, "children">;

export function PatternText({
  text = "Text",
  className,
  as: Tag = "p",
  ...props
}: PatternTextProps) {
  return (
    <Tag className={cn(styles.wrap, className)} {...props}>
      <span className={styles.fxLayer} aria-hidden>
        {text}
      </span>
      <span className={styles.fgLayer}>{text}</span>
    </Tag>
  );
}
