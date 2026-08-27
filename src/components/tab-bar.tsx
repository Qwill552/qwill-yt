import { Flame, Clock } from "lucide-react";
import { CATEGORY_META, type Category } from "@/lib/queue-store";
import { cn } from "@/lib/utils";

const TAB_SIZE = 48;
const TAB_GAP = 4;
const BAR_PADDING = 6;

function AnimeGlyphIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 4 5 20M12 4l7 16M8.5 14h7" />
    </svg>
  );
}

const TABS: { key: Category; icon: typeof Flame }[] = [
  { key: "main", icon: Flame },
  { key: "background", icon: Clock },
  { key: "anime", icon: AnimeGlyphIcon },
];

type TabBarProps = {
  active: Category;
  onChange: (category: Category) => void;
};

export function TabBar({ active, onChange }: TabBarProps) {
  const activeIndex = TABS.findIndex((tab) => tab.key === active);

  return (
    <nav
      aria-label="Разделы"
      className="fixed inset-x-0 bottom-5 z-30 flex justify-center px-4"
      style={{
        bottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div
        className={cn(
          "relative flex items-center rounded-full",
          "border border-white/15 bg-white/10 backdrop-blur-2xl backdrop-saturate-150",
          "shadow-[0_1px_0_rgb(255_255_255/0.25)_inset,0_8px_32px_-4px_rgb(0_0_0/0.45)]",
        )}
        style={{ padding: BAR_PADDING, gap: TAB_GAP }}
      >
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute rounded-full bg-white/20",
            "shadow-[inset_0_1px_0_rgb(255_255_255/0.45),0_2px_12px_rgb(0_0_0/0.3)]",
            "transition-transform duration-400 ease-[cubic-bezier(0.22,1,0.36,1)]",
          )}
          style={{
            width: TAB_SIZE,
            height: TAB_SIZE,
            top: BAR_PADDING,
            left: BAR_PADDING,
            transform: `translateX(${activeIndex * (TAB_SIZE + TAB_GAP)}px)`,
          }}
        />
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              aria-label={CATEGORY_META[tab.key].label}
              aria-current={isActive}
              title={CATEGORY_META[tab.key].label}
              className={cn(
                "relative z-10 flex shrink-0 items-center justify-center rounded-full text-white",
                "transition-[transform,opacity] duration-200 ease-out",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
                isActive ? "scale-100 opacity-100" : "scale-90 opacity-60 hover:opacity-90",
              )}
              style={{ width: TAB_SIZE, height: TAB_SIZE }}
            >
              <Icon className="size-5" strokeWidth={2} />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
