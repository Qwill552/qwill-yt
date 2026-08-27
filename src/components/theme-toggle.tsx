import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Включить светлую тему" : "Включить тёмную тему"}
      title={isDark ? "Светлая тема" : "Тёмная тема"}
      className={cn(
        "relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg",
        "bg-surface-2 text-accent shadow-border",
        "transition-[background-color,box-shadow,transform,color] duration-150 ease-out",
        "hover:shadow-border-hover hover:text-fg",
        "focus-visible:ring-2 focus-visible:ring-accent/50",
        "active:not-disabled:scale-[0.96]",
      )}
    >
      <span className="relative size-5">
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center",
            "transition-[opacity,filter,transform] duration-300",
            "ease-[cubic-bezier(0.2,0,0,1)]",
            isDark
              ? "scale-100 opacity-100 blur-none"
              : "scale-[0.25] opacity-0 blur-[4px]",
          )}
        >
          <Sun className="size-5" strokeWidth={1.75} />
        </span>
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center",
            "transition-[opacity,filter,transform] duration-300",
            "ease-[cubic-bezier(0.2,0,0,1)]",
            isDark
              ? "scale-[0.25] opacity-0 blur-[4px]"
              : "scale-100 opacity-100 blur-none",
          )}
        >
          <Moon className="size-5" strokeWidth={1.75} />
        </span>
      </span>
    </button>
  );
}
