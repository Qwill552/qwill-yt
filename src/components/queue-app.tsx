import { useEffect, useMemo, useState } from "react";
import { Flame, Circle, Clapperboard } from "lucide-react";
import { toast, Toaster } from "sonner";
import { AddBar } from "@/components/add-bar";
import { TabBar } from "@/components/tab-bar";
import { ThemeToggle } from "@/components/theme-toggle";
import { useTheme } from "@/components/theme-provider";
import { VideoCard } from "@/components/video-card";
import {
  CATEGORY_META,
  PRIORITY_META,
  type Category,
  type Priority,
  type QueueVideo,
  useQueue,
} from "@/lib/queue-store";
import {
  fetchYoutubeMeta,
  fetchYoutubePublishedAt,
} from "@/lib/youtube.functions";
import {
  extractVideoId,
  probeYoutubeDuration,
  thumbnailUrl,
  watchUrl,
} from "@/lib/youtube";
import { animegoQueueId, extractAnimegoSlug } from "@/lib/animego";
import { fetchAnimegoMeta } from "@/lib/animego.functions";

type PendingIngestItem = {
  videoId: string;
  url: string;
  title: string;
  channel: string;
  thumbnail: string;
  durationSeconds: number | null;
  publishedAt: string | null;
  priority: Priority;
  addedAt: number;
};

const SECTIONS: Priority[] = ["high", "medium", "low"];

const SECTION_ICON = {
  high: Flame,
  medium: Circle,
  low: Circle,
} as const;

export function QueueApp() {
  const { theme } = useTheme();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState<Category>("main");
  const videos = useQueue((state) => state.videos);
  const addVideo = useQueue((state) => state.addVideo);
  const removeVideo = useQueue((state) => state.removeVideo);
  const setPriority = useQueue((state) => state.setPriority);
  const patchVideo = useQueue((state) => state.patchVideo);

  useEffect(() => {
    useQueue.persist.rehydrate();
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    fetch("/api/queue-ingest")
      .then((res) => (res.ok ? res.json() : []))
      .then((items: PendingIngestItem[]) => {
        if (cancelled || !Array.isArray(items) || items.length === 0) return;
        for (const item of items) {
          addVideo({
            id: item.videoId,
            url: item.url,
            title: item.title,
            channel: item.channel,
            durationSeconds: item.durationSeconds,
            episodes: null,
            publishedAt: item.publishedAt,
            thumbnail: item.thumbnail,
            source: "youtube",
            priority: item.priority,
            category: "main",
            addedAt: item.addedAt,
          });
        }
        toast.success(
          items.length === 1
            ? "Прилетела ссылка с YouTube"
            : `Прилетело ссылок с YouTube: ${items.length}`,
        );
      })
      .catch(() => {
        /* best-effort inbox sync — a normal page load must not depend on it */
      });

    return () => {
      cancelled = true;
    };
  }, [ready, addVideo]);

  const categoryVideos = useMemo(
    () => videos.filter((video) => video.category === category),
    [videos, category],
  );

  const grouped = useMemo(() => {
    const buckets: Record<Priority, QueueVideo[]> = {
      high: [],
      medium: [],
      low: [],
    };
    for (const video of categoryVideos) {
      buckets[video.priority].push(video);
    }
    for (const key of SECTIONS) {
      buckets[key].sort((a, b) => b.addedAt - a.addedAt);
    }
    return buckets;
  }, [categoryVideos]);

  async function handleAddAnime(slug: string, url: string, priority: Priority) {
    const id = animegoQueueId(slug);
    if (videos.some((item) => item.id === id)) {
      toast("Это аниме уже в очереди");
      return;
    }

    setBusy(true);
    try {
      const meta = await fetchAnimegoMeta({ data: { url } });
      addVideo({
        id,
        url: meta.url,
        title: meta.title,
        channel: meta.studio,
        durationSeconds: null,
        episodes: meta.episodes,
        publishedAt: meta.publishedAt,
        thumbnail: meta.thumbnail,
        source: "animego",
        priority,
        category: "anime",
        addedAt: Date.now(),
      });
      toast.success(
        category === "anime"
          ? "Карточка добавлена"
          : "Аниме добавлено в раздел «Аниме»",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось добавить аниме",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd(url: string, priority: Priority) {
    const animegoSlug = extractAnimegoSlug(url);
    if (animegoSlug) {
      await handleAddAnime(animegoSlug, url, priority);
      return;
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      toast.error("Не похоже на ссылку YouTube или AnimeGO");
      return;
    }
    if (videos.some((item) => item.id === videoId)) {
      toast("Это видео уже в очереди");
      return;
    }

    setBusy(true);
    try {
      let meta: Awaited<ReturnType<typeof fetchYoutubeMeta>>;
      try {
        meta = await fetchYoutubeMeta({ data: { url } });
      } catch {
        meta = {
          videoId,
          url: watchUrl(videoId),
          title: "Видео YouTube",
          channel: "YouTube",
          thumbnail: thumbnailUrl(videoId, "hq"),
          durationSeconds: null,
          publishedAt: null,
        };
      }

      addVideo({
        id: meta.videoId,
        url: meta.url,
        title: meta.title,
        channel: meta.channel,
        durationSeconds: meta.durationSeconds,
        episodes: null,
        publishedAt: meta.publishedAt,
        thumbnail: meta.thumbnail,
        source: "youtube",
        priority,
        category,
        addedAt: Date.now(),
      });
      toast.success("Карточка добавлена");

      const patch: Partial<QueueVideo> = {};

      if (meta.durationSeconds == null) {
        const duration = await probeYoutubeDuration(meta.videoId);
        if (duration != null) {
          patch.durationSeconds = duration;
        }
      }

      if (meta.publishedAt == null) {
        try {
          const publishedAt = await fetchYoutubePublishedAt({
            data: { videoId: meta.videoId },
          });
          if (publishedAt) {
            patch.publishedAt = publishedAt;
          }
        } catch {
          /* keep card without date rather than failing the add */
        }
      }

      if (Object.keys(patch).length > 0) {
        patchVideo(meta.videoId, patch);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось добавить видео",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-dvh">
      <div className="app-backdrop" />
      {ready ? (
        <Toaster
          theme={theme}
          position="bottom-center"
          toastOptions={{
            className:
              "!bg-surface-2 !text-fg !border-border !shadow-border !font-sans",
          }}
        />
      ) : null}

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 pt-10 pb-32 sm:px-6 sm:pt-14">
        <header className="flex flex-col gap-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-3">
              <p className="text-subtle text-xs font-medium uppercase tracking-kicker">
                Очередь просмотра
              </p>
              <h1
                key={category}
                className="card-enter font-display text-4xl font-medium tracking-tight text-fg sm:text-5xl"
              >
                {CATEGORY_META[category].label}
              </h1>
              <p className="max-w-xl text-muted">
                Вставьте ссылку на YouTube или AnimeGO — появится карточка с
                названием, каналом или студией, длительностью или числом серий
                и датой выхода. Сортировка всегда от важного к тому, что можно
                отложить.
              </p>
            </div>
            <ThemeToggle />
          </div>

          <AddBar busy={busy} onAdd={handleAdd} />

          <dl key={category} className="card-enter grid grid-cols-3 gap-2 sm:gap-3">
            {SECTIONS.map((key) => {
              const Icon = SECTION_ICON[key];
              return (
                <div
                  key={key}
                  className="rounded-lg bg-surface px-3 py-3 shadow-border sm:px-4"
                >
                  <dt className="flex items-center gap-1.5 text-subtle text-xs sm:text-sm">
                    <Icon
                      className={
                        key === "high"
                          ? "size-3.5 text-high"
                          : key === "medium"
                            ? "size-3.5 fill-medium text-medium"
                            : "size-3.5 text-low"
                      }
                      strokeWidth={2}
                    />
                    {PRIORITY_META[key].label}
                  </dt>
                  <dd className="mt-1 font-display text-2xl tabular-nums text-fg">
                    {ready ? grouped[key].length : "—"}
                  </dd>
                </div>
              );
            })}
          </dl>
        </header>

        {!ready ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-72 animate-pulse rounded-xl bg-surface shadow-border"
              />
            ))}
          </div>
        ) : categoryVideos.length === 0 ? (
          <div key={category} className="card-enter">
            <EmptyState />
          </div>
        ) : (
          <div key={category} className="card-enter flex flex-col gap-12">
            {SECTIONS.map((key) => {
              const items = grouped[key];
              if (items.length === 0) return null;
              const Icon = SECTION_ICON[key];
              return (
                <section key={key} className="flex flex-col gap-4">
                  <div className="flex items-baseline justify-between gap-3 border-border border-b pb-3">
                    <h2 className="flex items-center gap-2 font-display text-xl text-fg">
                      <Icon
                        className={
                          key === "high"
                            ? "size-4 text-high"
                            : key === "medium"
                              ? "size-4 fill-medium text-medium"
                              : "size-4 text-low"
                        }
                      />
                      {PRIORITY_META[key].label}
                      <span className="text-subtle text-sm font-sans font-normal">
                        · {PRIORITY_META[key].hint}
                      </span>
                    </h2>
                    <span className="text-muted text-sm tabular-nums">
                      {items.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {items.map((video, index) => (
                      <VideoCard
                        key={video.id}
                        video={video}
                        index={index}
                        onPriority={(priority) =>
                          setPriority(video.id, priority)
                        }
                        onRemove={() => removeVideo(video.id)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>

      <TabBar active={category} onChange={setCategory} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl bg-surface px-6 py-16 text-center shadow-border">
      <Clapperboard className="size-8 text-subtle" strokeWidth={1.5} />
      <h2 className="font-display text-2xl text-fg">Пока пусто</h2>
      <p className="max-w-sm text-muted">
        Вставьте ссылку на видео — карточка соберётся сама и встанет в очередь
        по выбранному приоритету.
      </p>
    </div>
  );
}
