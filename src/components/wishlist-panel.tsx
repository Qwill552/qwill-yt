import { useEffect } from "react";
import { Bell, CalendarClock, Star, Trash2, Tv } from "lucide-react";
import { PriorityToggle } from "@/components/priority-toggle";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Priority } from "@/lib/queue-store";
import { cn } from "@/lib/utils";
import { wishlistDateLabel, type WishlistItem } from "@/lib/wishlist";

type WishlistStarProps = {
  count: number;
  open: boolean;
  onToggle: () => void;
};

/** Звезда в шапке, слева от переключателя темы: залита, пока панель открыта. */
export function WishlistStar({ count, open, onToggle }: WishlistStarProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={count > 0 ? `Вишлист, тайтлов: ${count}` : "Вишлист"}
      aria-expanded={open}
      title="Вишлист — аниме, которое ещё не вышло"
      className={cn(
        "relative flex size-12 shrink-0 items-center justify-center rounded-lg",
        "bg-surface-2 shadow-border",
        "transition-[background-color,box-shadow,transform,color] duration-150 ease-out",
        "hover:shadow-border-hover",
        "focus-visible:ring-2 focus-visible:ring-accent/50",
        "active:not-disabled:scale-[0.96]",
        open ? "text-medium" : "text-accent hover:text-fg",
      )}
    >
      <Star
        className="size-5 transition-[fill] duration-150 ease-out"
        strokeWidth={open ? 2.2 : 1.75}
        fill={open ? "currentColor" : "none"}
      />
      {!open && count > 0 ? (
        <span
          aria-hidden="true"
          className="absolute top-2 right-2 size-2 rounded-full bg-medium shadow-[0_0_0_2px_var(--color-surface-2)]"
        />
      ) : null}
    </button>
  );
}

type WishlistPanelProps = {
  items: WishlistItem[];
  open: boolean;
  onClose: () => void;
  onPriority: (id: string, priority: Priority) => void;
  onSubscribed: (id: string, subscribed: boolean) => void;
  onRemove: (id: string) => void;
};

/**
 * Панель вишлиста — прибита к правому краю окна, в пустом месте рядом с
 * очередью. Закрывается только звездой и Esc: приоритеты в ней меняют, листая
 * очередь рядом, и клик по странице не должен её ронять.
 */
export function WishlistPanel({
  items,
  open,
  onClose,
  onPriority,
  onSubscribed,
  onRemove,
}: WishlistPanelProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <aside
      aria-label="Вишлист"
      className={cn(
        "card-enter fixed top-24 right-4 z-40 flex flex-col sm:right-6",
        "w-[min(26rem,calc(100vw-2rem))] max-h-[calc(100dvh-8rem)]",
        "overflow-hidden rounded-lg bg-surface shadow-border",
      )}
    >
      <header className="flex items-baseline justify-between gap-3 border-border border-b px-4 py-3">
        <h2 className="font-display text-lg text-fg">Вишлист</h2>
        <span className="text-subtle text-xs">
          ещё не вышло · {items.length}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="px-6 py-10 text-center text-muted text-sm">
            Пусто. Вставьте ссылку на анонс с AnimeGO — тайтл подождёт здесь, а
            карточка появится сама в день выхода.
          </p>
        ) : (
          items.map((item) => (
            <WishlistRow
              key={item.id}
              item={item}
              onPriority={(priority) => onPriority(item.id, priority)}
              onSubscribed={(subscribed) => onSubscribed(item.id, subscribed)}
              onRemove={() => onRemove(item.id)}
            />
          ))
        )}
      </div>
    </aside>
  );
}

type WishlistRowProps = {
  item: WishlistItem;
  onPriority: (priority: Priority) => void;
  onSubscribed: (subscribed: boolean) => void;
  onRemove: () => void;
};

function WishlistRow({
  item,
  onPriority,
  onSubscribed,
  onRemove,
}: WishlistRowProps) {
  const date = wishlistDateLabel(item);

  return (
    <div className="flex gap-3 border-border border-b px-3 py-3 last:border-b-0">
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Открыть «${item.title}» на AnimeGO`}
        className="press-thumb block w-14 shrink-0 overflow-hidden rounded-sm focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        {item.thumbnail ? (
          <img
            src={item.thumbnail}
            alt=""
            loading="lazy"
            className="aspect-[5/7] w-full object-cover outline outline-1 -outline-offset-1 outline-fg/10"
          />
        ) : (
          <span className="flex aspect-[5/7] w-full items-center justify-center bg-surface-2 outline outline-1 -outline-offset-1 outline-fg/10">
            <Tv className="size-5 text-subtle" strokeWidth={1.5} />
          </span>
        )}
      </a>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="line-clamp-2 font-medium text-fg text-sm leading-snug transition-colors duration-150 hover:text-accent focus-visible:text-accent"
            >
              {item.title}
            </a>
          </TooltipTrigger>
          <TooltipContent side="top" align="start">
            {item.title}
          </TooltipContent>
        </Tooltip>

        <p className="flex items-center gap-1 text-subtle text-xs">
          <CalendarClock className="size-3.5 shrink-0" strokeWidth={1.75} />
          <span className="truncate">{date}</span>
        </p>

        <div className="mt-auto flex items-center justify-between gap-1 pt-1">
          <div className="flex items-center gap-1">
            <PriorityToggle value={item.priority} onChange={onPriority} size="sm" />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={
                item.subscribed
                  ? "Не уведомлять о выходе"
                  : "Уведомить о выходе"
              }
              title={
                item.subscribed ? "Не уведомлять о выходе" : "Уведомить о выходе"
              }
              onClick={() => onSubscribed(!item.subscribed)}
              className={cn(
                "size-10",
                item.subscribed
                  ? "text-accent hover:text-accent"
                  : "text-subtle hover:text-high",
              )}
            >
              <Bell
                className="size-4"
                strokeWidth={item.subscribed ? 2.2 : 1.8}
                fill={item.subscribed ? "currentColor" : "none"}
              />
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Убрать из вишлиста"
            title="Убрать из вишлиста"
            onClick={onRemove}
            className="size-10 text-subtle hover:text-high"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
