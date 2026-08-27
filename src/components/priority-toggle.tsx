import { Circle, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRIORITY_META, type Priority } from "@/lib/queue-store";

const OPTIONS: Array<{
  value: Priority;
  Icon: typeof Flame;
  filled?: boolean;
}> = [
  { value: "high", Icon: Flame },
  { value: "medium", Icon: Circle, filled: true },
  { value: "low", Icon: Circle },
];

type PriorityToggleProps = {
  value: Priority;
  onChange: (value: Priority) => void;
  size?: "md" | "sm";
};

export function PriorityToggle({
  value,
  onChange,
  size = "md",
}: PriorityToggleProps) {
  const compact = size === "sm";

  return (
    <div
      role="radiogroup"
      aria-label="Приоритет"
      className={cn(
        "flex items-center rounded-md bg-surface-2 p-1 shadow-border",
        compact ? "gap-0.5" : "gap-1",
      )}
    >
      {OPTIONS.map(({ value: option, Icon, filled }) => {
        const active = value === option;
        const meta = PRIORITY_META[option];
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${meta.label} — ${meta.hint}`}
            title={`${meta.label} — ${meta.hint}`}
            onClick={() => onChange(option)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-sm font-medium transition-[background-color,color,transform] duration-150 ease-out",
              "focus-visible:ring-2 focus-visible:ring-accent/50",
              "active:not-disabled:scale-[0.96]",
              compact ? "size-10" : "h-10 min-h-10 px-3",
              active && option === "high" && "bg-high/15 text-high",
              active && option === "medium" && "bg-medium/15 text-medium",
              active && option === "low" && "bg-low/15 text-low",
              !active && "text-subtle hover:text-muted",
            )}
          >
            <Icon
              className={compact ? "size-4" : "size-3.5"}
              strokeWidth={active ? 2.4 : 1.8}
              fill={filled && active ? "currentColor" : "none"}
            />
            {!compact ? <span>{meta.label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
