import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { availableEpisodes, slugFromQueueId } from "./animego";
import { useQueue, type QueueVideo } from "./queue-store";

export type AnimeNotification = {
  id: number;
  animeId: string;
  title: string;
  thumbnail: string | null;
  episodeNumber: number;
  episodeTitle: string | null;
  createdAt: string;
  readAt: string | null;
};

type SyncPayload = { notifications: AnimeNotification[]; subscribedIds: string[] };
type EpisodeUpdatedPayload = {
  animeId: string;
  episodesRaw: string | null;
  episodesAvailable: number | null;
};
type NotificationEventPayload = { notification: AnimeNotification };

function parseEvent<T>(event: Event): T | null {
  const data = (event as MessageEvent).data;
  if (typeof data !== "string") return null;
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

/**
 * Открывает один SSE-канал (/api/live-updates) на всё живое: новые серии
 * подписанных аниме патчит прямо в `useQueue`, новые уведомления и список
 * подписок держит в собственном стейте, новые карточки из почтового ящика
 * триггерят переданный колбэк (тот же, что уже вызывается при монтировании).
 */
export function useAnimeUpdates(onQueueItem: () => void) {
  const patchVideo = useQueue((state) => state.patchVideo);
  const [notifications, setNotifications] = useState<AnimeNotification[]>([]);
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set());
  const onQueueItemRef = useRef(onQueueItem);
  onQueueItemRef.current = onQueueItem;

  useEffect(() => {
    const source = new EventSource("/api/live-updates");

    source.addEventListener("sync", (event) => {
      const data = parseEvent<SyncPayload>(event);
      if (!data) return;
      setNotifications(data.notifications);
      setSubscribedIds(new Set(data.subscribedIds));
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
    });

    source.addEventListener("queue-item", () => {
      onQueueItemRef.current();
    });

    return () => source.close();
  }, [patchVideo]);

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
    const slug = slugFromQueueId(video.id);
    if (!slug) return;

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
      body: JSON.stringify({
        id: video.id,
        slug,
        url: video.url,
        title: video.title,
        studio: video.channel,
        thumbnail: video.thumbnail,
        episodesRaw: video.episodes,
        episodesAvailable: availableEpisodes(video.episodes),
        subscribed,
      }),
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

  return { notifications, subscribedIds, markRead, setSubscribed };
}
