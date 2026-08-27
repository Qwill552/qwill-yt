import { type InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, type = "text", ...props }, ref) => {
  return (
    <input
      type={type}
      suppressHydrationWarning
      className={cn(
        "h-12 w-full min-w-0 rounded-md bg-surface px-4 text-base text-fg shadow-border outline-none",
        "placeholder:text-subtle",
        "transition-[box-shadow,background-color] duration-150 ease-out",
        "focus-visible:shadow-border-hover focus-visible:ring-2 focus-visible:ring-accent/35",
        "disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});

Input.displayName = "Input";
