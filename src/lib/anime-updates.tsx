import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { NotificationAlert } from "@/components/notification-alert";
import { availableEpisodes, slugFromQueueId } from "./animego";
import type { AnimeNotification } from "./notification-text";
import { useQueue, type QueueVideo } from "./queue-store";

export type { AnimeNotification } from "./notification-text";

type SyncPayload = { notifications: AnimeNotification[]; subscribedIds: string[] };
type EpisodeUpdatedPayload = {
  animeId: string;
  episodesRaw: string | null;
  episodesAvailable: number | null;
};
type NotificationEventPayload = { notification: AnimeNotification };

/** Один тост на все накопленные уведомления — id фиксирован, sonner обновляет его на месте. */
const ALERT_TOAST_ID = "anime-notification-alert";

/**
 * Наибольший id уведомления, о котором плашка уже показывалась. Живёт в
 * localStorage, потому что показать надо и то, что пришло, пока вкладка была
 * закрыта: серия выходит ночью, плашка ждёт до утреннего захода. Без отметки
 * она всплывала бы заново на каждый реконнект SSE.
 */
const ALERTED_KEY = "qwill-yt:alerted-notification-id";

function readAlertedId(): number {
  if (typeof window === "undefined") return 0;
  try {
    return Number(window.localStorage.getItem(ALERTED_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeAlertedId(id: number): void {
  try {
    window.localStorage.setItem(ALERTED_KEY, String(id));
  } catch {
    /* приватный режим / переполненное хранилище — плашка просто повторится */
  }
}

function parseEvent<T>(event: Event): T | null {
  const data = (event as MessageEvent).data;
  if (typeof data !== "string") return null;
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

/** Карточка очереди → тело для `/api/anime-track`; не-аниме отсеиваются. */
function toTrackItem(video: QueueVideo) {
  const slug = slugFromQueueId(video.id);
  if (!slug || video.source !== "animego") return null;
  return {
    id: video.id,
    slug,
    url: video.url,
    title: video.title,
    studio: video.channel,
    thumbnail: video.thumbnail,
    episodesRaw: video.episodes,
    episodesAvailable: availableEpisodes(video.episodes),
  };
}

/**
 * Отдаёт серверу аниме-карточки очереди, чтобы он держал их счётчик серий
 * свежим. Сервер заводит только неизвестные ему строки, так что слать весь
 * список при каждом заходе дёшево.
 */
export function trackAnimeCards(videos: QueueVideo[]): void {
  const items = videos.flatMap((video) => {
    const item = toTrackItem(video);
    return item ? [item] : [];
  });
  if (items.length === 0) return;
  fetch("/api/anime-track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items }),
  }).catch(() => {
    /* best-effort — список уедет при следующем открытии сайта */
  });
}

/** Карточку удалили из очереди — снимаем тайтл с отслеживания на сервере. */
export function untrackAnimeCard(video: QueueVideo): void {
  if (video.source !== "animego") return;
  fetch("/api/anime-untrack", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: video.id }),
  }).catch(() => {
    /* best-effort — лишняя строка сама перестанет чекаться, когда тайтл выйдет */
  });
}

/**
 * Открывает один SSE-канал (/api/live-updates) на всё живое: новые серии
 * подписанных аниме патчит прямо в `useQueue`, новые уведомления и список
 * подписок держит в собственном стейте, новые карточки из почтового ящика
 * триггерят переданный колбэк (тот же, что уже вызывается при монтировании).
 *
 * Он же заведует всплывающей плашкой: копит непоказанные уведомления и держит
 * состояние выпадающего списка колокольчика — плашка должна уметь его открыть.
 */
export function useAnimeUpdates(onQueueItem: () => void) {
  const patchVideo = useQueue((state) => state.patchVideo);
  const [notifications, setNotifications] = useState<AnimeNotification[]>([]);
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set());
  const [bellOpen, setBellOpen] = useState(false);
  const onQueueItemRef = useRef(onQueueItem);
  onQueueItemRef.current = onQueueItem;

  /** Что показано в текущей плашке, свежее первым. Чистится при её закрытии. */
  const alertItemsRef = useRef<AnimeNotification[]>([]);

  const closeAlert = useCallback(() => {
    alertItemsRef.current = [];
    // sonner доигрывает свою анимацию ухода — отдельная не нужна.
    toast.dismiss(ALERT_TOAST_ID);
  }, []);

  const openBellFromAlert = useCallback(() => {
    setBellOpen(true);
    closeAlert();
  }, [closeAlert]);

  /**
   * Добавляет уведомления в плашку и перерисовывает её. Тост с фиксированным
   * id обновляется на месте, поэтому четыре пришедшие подряд серии дают одну
   * плашку «Новых серий: 4», а не четыре отдельные.
   */
  const pushToAlert = useCallback(
    (incoming: AnimeNotification[]) => {
      if (incoming.length === 0) return;

      const known = new Set(alertItemsRef.current.map((item) => item.id));
      const fresh = incoming.filter((item) => !known.has(item.id));
      if (fresh.length === 0) return;

      alertItemsRef.current = [...fresh, ...alertItemsRef.current].sort(
        (a, b) => b.id - a.id,
      );
      writeAlertedId(Math.max(readAlertedId(), ...fresh.map((item) => item.id)));

      const items = alertItemsRef.current;
      toast.custom(
        () => (
          <NotificationAlert
            items={items}
            onOpen={openBellFromAlert}
            onClose={closeAlert}
          />
        ),
        {
          id: ALERT_TOAST_ID,
          // Закрыть можно ТОЛЬКО крестиком: ни таймаута, ни свайпа.
          duration: Number.POSITIVE_INFINITY,
          dismissible: false,
        },
      );
    },
    [closeAlert, openBellFromAlert],
  );

  useEffect(() => {
    const source = new EventSource("/api/live-updates");

    source.addEventListener("sync", (event) => {
      const data = parseEvent<SyncPayload>(event);
      if (!data) return;
      setNotifications(data.notifications);
      setSubscribedIds(new Set(data.subscribedIds));

      // Догоняем то, что пришло, пока сайт был закрыт: непрочитанное, о чём
      // плашка ещё не рассказывала. Порядок с сервера — от новых к старым.
      const alertedId = readAlertedId();
      pushToAlert(data.notifications.filter((n) => !n.readAt && n.id > alertedId));
    });

    source.addEventListener("episode-updated", (event) => {
      const data = parseEvent<EpisodeUpdatedPayload>(event);
      if (!data || data.episodesRaw == null) return;
      patchVideo(data.animeId, { episodes: data.episodesRaw });
    });

    source.addEventListener("notification", (event) => {
      const data = parseEvent<NotificationEventPayload>(event);
      if (!data) return;
      setNotifications((prev) => [data.notification, ...prev]);
      pushToAlert([data.notification]);
    });

    source.addEventListener("queue-item", () => {
      onQueueItemRef.current();
    });

    return () => source.close();
  }, [patchVideo, pushToAlert]);

  const markRead = useCallback((ids: number[]) => {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, readAt: n.readAt ?? now } : n)),
    );
    fetch("/api/anime-notifications/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch(() => {
      /* best-effort — an unread badge lingering a bit longer is harmless */
    });
  }, []);

  const setSubscribed = useCallback((video: QueueVideo, subscribed: boolean) => {
    const item = toTrackItem(video);
    if (!item) return;

    setSubscribedIds((prev) => {
      const next = new Set(prev);
      if (subscribed) next.add(video.id);
      else next.delete(video.id);
      return next;
    });

    /**
     * Откат оптимистичного колокольчика. Раньше провал глотался молча — и,
     * поскольку `fetch` резолвится и на 500, залитый колокольчик означал
     * «подписка сохранена», хотя сервер не сохранил ничего.
     */
    const revert = () => {
      setSubscribedIds((prev) => {
        const next = new Set(prev);
        if (subscribed) next.delete(video.id);
        else next.add(video.id);
        return next;
      });
    };

    fetch("/api/anime-subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...item, subscribed }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      })
      .catch((err: unknown) => {
        console.error("[anime] subscribe failed:", err);
        revert();
        toast.error(
          subscribed ? "Не удалось подписаться на тайтл" : "Не удалось снять подписку",
        );
      });
  }, []);

  return {
    notifications,
    subscribedIds,
    markRead,
    setSubscribed,
    bellOpen,
    setBellOpen,
  };
}
