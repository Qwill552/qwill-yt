import { useEffect, useMemo, useRef } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { formatDistanceToNow, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { Bell, Tv } from "lucide-react";
import { describeNotification, type AnimeNotification } from "@/lib/notification-text";
import { cn } from "@/lib/utils";

const MARK_READ_DELAY_MS = 1500;

type NotificationBellProps = {
  notifications: AnimeNotification[];
  onMarkRead: (ids: number[]) => void;
  /** Список управляется снаружи: его открывает и клик по всплывающей плашке. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NotificationBell({
  notifications,
  onMarkRead,
  open,
  onOpenChange,
}: NotificationBellProps) {
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
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange}>
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
            // 660×380 — размер, заданный вручную: постер и шрифты внутри
            // увеличены вдвое против прежней узкой панели.
            "z-40 w-[660px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg",
            "bg-surface shadow-border",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <div className="max-h-[380px] overflow-y-auto py-2">
            {notifications.length === 0 ? (
              <p className="px-8 py-12 text-center text-2xl text-muted">
                Уведомлений пока нет
              </p>
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
  const completed = notification.kind === "completed";

  return (
    <>
      {showDivider ? (
        <div className="my-2 flex items-center gap-3 px-5">
          <span className="h-px flex-1 bg-border" />
          <span className="text-subtle text-base uppercase tracking-kicker">Ранее</span>
          <span className="h-px flex-1 bg-border" />
        </div>
      ) : null}
      <div
        className={cn(
          "flex items-center gap-5 px-5 py-3",
          !notification.readAt && "bg-accent/5",
        )}
      >
        <div className="flex size-22 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2">
          {notification.thumbnail ? (
            <img
              src={notification.thumbnail}
              alt=""
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            <Tv className="size-10 text-subtle" strokeWidth={1.5} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-[1.75rem] text-fg leading-tight">
            {notification.title}
          </p>
          <p className="truncate text-2xl text-muted">
            {describeNotification(notification)}
            {when ? ` · ${when}` : ""}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-sm px-3 py-1 font-medium text-2xl tabular-nums",
            completed
              ? "bg-accent text-accent-fg tracking-kicker"
              : "bg-surface-2 text-fg",
          )}
        >
          {completed ? "ФУЛЛ" : notification.episodeNumber}
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
