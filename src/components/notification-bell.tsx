import { useEffect, useMemo, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { formatDistanceToNow, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { Bell, Tv } from "lucide-react";
import type { AnimeNotification } from "@/lib/anime-updates";
import { cn } from "@/lib/utils";

const MARK_READ_DELAY_MS = 1500;

type NotificationBellProps = {
  notifications: AnimeNotification[];
  onMarkRead: (ids: number[]) => void;
};

export function NotificationBell({ notifications, onMarkRead }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const markReadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.readAt).length,
    [notifications],
  );

  useEffect(() => {
    if (!open || unreadCount === 0) return;
    const idsToMark = notifications.filter((n) => !n.readAt).map((n) => n.id);
    markReadTimer.current = setTimeout(() => onMarkRead(idsToMark), MARK_READ_DELAY_MS);
    return () => {
      if (markReadTimer.current) clearTimeout(markReadTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-arm when the dropdown opens
  }, [open]);

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={
            unreadCount > 0 ? `Уведомления, непрочитанных: ${unreadCount}` : "Уведомления"
          }
          title="Уведомления"
          className={cn(
            "relative flex size-12 shrink-0 items-center justify-center rounded-lg",
            "bg-surface-2 text-accent shadow-border",
            "transition-[background-color,box-shadow,transform,color] duration-150 ease-out",
            "hover:shadow-border-hover hover:text-fg",
            "focus-visible:ring-2 focus-visible:ring-accent/50",
            "active:not-disabled:scale-[0.96]",
          )}
        >
          <Bell className="size-5" strokeWidth={1.75} />
          {unreadCount > 0 ? (
            <span
              aria-hidden="true"
              className="absolute top-2 right-2 size-2 rounded-full bg-high shadow-[0_0_0_2px_var(--color-surface-2)]"
            />
          ) : null}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={8}
          className={cn(
            "z-40 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg",
            "bg-surface shadow-border",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <div className="max-h-[70vh] overflow-y-auto py-1.5">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-muted text-sm">Уведомлений пока нет</p>
            ) : (
              notifications.map((notification, index) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  showDivider={index === unreadCount && unreadCount > 0}
                />
              ))
            )}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function NotificationRow({
  notification,
  showDivider,
}: {
  notification: AnimeNotification;
  showDivider: boolean;
}) {
  const when = formatWhen(notification.createdAt);
  return (
    <>
      {showDivider ? (
        <div className="my-1 flex items-center gap-2 px-4">
          <span className="h-px flex-1 bg-border" />
          <span className="text-subtle text-xs uppercase tracking-kicker">Ранее</span>
          <span className="h-px flex-1 bg-border" />
        </div>
      ) : null}
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-2.5",
          !notification.readAt && "bg-accent/5",
        )}
      >
        <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-2">
          {notification.thumbnail ? (
            <img
              src={notification.thumbnail}
              alt=""
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            <Tv className="size-5 text-subtle" strokeWidth={1.5} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-fg text-sm">{notification.title}</p>
          <p className="truncate text-muted text-xs">
            {notification.episodeTitle ?? `${notification.episodeNumber} серия`}
            {when ? ` · ${when}` : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-xs bg-surface-2 px-1.5 py-0.5 font-medium text-fg text-xs tabular-nums">
          {notification.episodeNumber}
        </span>
      </div>
    </>
  );
}

function formatWhen(iso: string): string | null {
  const parsed = parseISO(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatDistanceToNow(parsed, { locale: ru, addSuffix: true });
}
