import { Tv, X } from "lucide-react";
import {
  describeNotification,
  pluralTitles,
  type AnimeNotification,
} from "@/lib/notification-text";
import { cn } from "@/lib/utils";

type NotificationAlertProps = {
  /** Накопленные с прошлого закрытия уведомления, свежие первыми. */
  items: AnimeNotification[];
  onOpen: () => void;
  onClose: () => void;
};

/**
 * Плашка внизу экрана: «пришло новое». Живёт в тосте sonner с
 * `duration: Infinity` и `dismissible: false`, поэтому исчезает только по
 * крестику или по клику (тогда же открывается колокольчик) — свайпом и
 * таймаутом её не сбить.
 *
 * Несколько уведомлений схлопываются в одну плашку: четыре отдельные закрывать
 * по одной было бы утомительно, а весь список всё равно в колокольчике.
 */
export function NotificationAlert({ items, onOpen, onClose }: NotificationAlertProps) {
  const newest = items[0];
  if (!newest) return null;

  const rest = items.length - 1;
  const allEpisodes = items.every((item) => item.kind === "episode");
  const heading =
    items.length === 1
      ? newest.title
      : allEpisodes
        ? `Новых серий: ${items.length}`
        : `Новых уведомлений: ${items.length}`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "relative flex w-full cursor-pointer items-center gap-3 pr-7 text-left",
        "focus-visible:outline-none",
      )}
    >
      <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface">
        {newest.thumbnail ? (
          <img src={newest.thumbnail} alt="" className="size-full object-cover" />
        ) : (
          <Tv className="size-6 text-subtle" strokeWidth={1.5} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-fg text-sm">{heading}</p>
        <p className="truncate text-muted text-xs">
          {items.length === 1 ? describeNotification(newest) : newest.title}
        </p>
        {rest > 0 ? (
          <p className="truncate text-subtle text-xs">и ещё {pluralTitles(rest)}</p>
        ) : null}
      </div>

      <button
        type="button"
        aria-label="Закрыть"
        // Крестик — единственный способ убрать плашку, не открывая список,
        // поэтому клик до карточки-обёртки не доходит.
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        className={cn(
          "absolute -top-1 -right-1 flex size-7 items-center justify-center rounded-md",
          "text-subtle transition-colors duration-150 hover:bg-surface hover:text-fg",
          "focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none",
        )}
      >
        <X className="size-4" strokeWidth={2} />
      </button>
    </div>
  );
}
