import { create } from "zustand";
import { persist } from "zustand/middleware";
import { thumbnailUrl, watchUrl } from "./youtube";

export type Priority = "high" | "medium" | "low";

export type Category = "main" | "background" | "anime";

export const CATEGORIES: Category[] = ["main", "background", "anime"];

export const CATEGORY_META: Record<Category, { label: string }> = {
  main: { label: "Главная" },
  background: { label: "На фон" },
  anime: { label: "Аниме" },
};

export type QueueSource = "youtube" | "animego";

export type QueueVideo = {
  id: string;
  url: string;
  title: string;
  /** канал YouTube или студия-аниматор */
  channel: string;
  /** ссылка на канал YouTube — только для source: "youtube" */
  channelUrl: string | null;
  durationSeconds: number | null;
  /** количество серий для аниме: «19 / 24», «52» */
  episodes: string | null;
  /** сколько серий уже просмотрено — правится прямо в карточке */
  watchedEpisodes: number;
  publishedAt: string | null;
  thumbnail: string;
  source: QueueSource;
  priority: Priority;
  category: Category;
  addedAt: number;
};

export const PRIORITY_RANK: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export const PRIORITY_META: Record<
  Priority,
  { label: string; hint: string }
> = {
  high: { label: "Важно", hint: "смотреть сейчас" },
  medium: { label: "Средне", hint: "когда будет время" },
  low: { label: "Позже", hint: "можно отложить" },
};

const SEED: QueueVideo[] = [
  {
    id: "jNQXAC9IVRw",
    url: watchUrl("jNQXAC9IVRw"),
    title: "Me at the zoo",
    channel: "jawed",
    channelUrl: null,
    durationSeconds: 19,
    episodes: null,
    watchedEpisodes: 0,
    publishedAt: "2005-04-23",
    thumbnail: thumbnailUrl("jNQXAC9IVRw"),
    source: "youtube",
    priority: "high",
    category: "main",
    addedAt: 6,
  },
  {
    id: "DHjqpvDnNGE",
    url: watchUrl("DHjqpvDnNGE"),
    title: "JavaScript in 100 Seconds",
    channel: "Fireship",
    channelUrl: null,
    durationSeconds: 148,
    episodes: null,
    watchedEpisodes: 0,
    publishedAt: "2022-01-13",
    thumbnail: thumbnailUrl("DHjqpvDnNGE"),
    source: "youtube",
    priority: "high",
    category: "main",
    addedAt: 5,
  },
  {
    id: "aqz-KE-bpKQ",
    url: watchUrl("aqz-KE-bpKQ"),
    title: "Big Buck Bunny 60fps 4K — Official Blender Foundation Short Film",
    channel: "Blender",
    channelUrl: null,
    durationSeconds: 635,
    episodes: null,
    watchedEpisodes: 0,
    publishedAt: "2014-11-10",
    thumbnail: thumbnailUrl("aqz-KE-bpKQ"),
    source: "youtube",
    priority: "medium",
    category: "main",
    addedAt: 4,
  },
  {
    id: "kJQP7kiw5Fk",
    url: watchUrl("kJQP7kiw5Fk"),
    title: "Luis Fonsi — Despacito ft. Daddy Yankee",
    channel: "LuisFonsiVEVO",
    channelUrl: null,
    durationSeconds: 282,
    episodes: null,
    watchedEpisodes: 0,
    publishedAt: "2017-01-12",
    thumbnail: thumbnailUrl("kJQP7kiw5Fk"),
    source: "youtube",
    priority: "medium",
    category: "main",
    addedAt: 3,
  },
  {
    id: "9bZkp7q19f0",
    url: watchUrl("9bZkp7q19f0"),
    title: "PSY — GANGNAM STYLE M/V",
    channel: "officialpsy",
    channelUrl: null,
    durationSeconds: 252,
    episodes: null,
    watchedEpisodes: 0,
    publishedAt: "2012-07-15",
    thumbnail: thumbnailUrl("9bZkp7q19f0"),
    source: "youtube",
    priority: "low",
    category: "main",
    addedAt: 2,
  },
  {
    id: "dQw4w9WgXcQ",
    url: watchUrl("dQw4w9WgXcQ"),
    title: "Rick Astley — Never Gonna Give You Up (Official Video) (4K Remaster)",
    channel: "Rick Astley",
    channelUrl: null,
    durationSeconds: 213,
    episodes: null,
    watchedEpisodes: 0,
    publishedAt: "2009-10-25",
    thumbnail: thumbnailUrl("dQw4w9WgXcQ"),
    source: "youtube",
    priority: "low",
    category: "main",
    addedAt: 1,
  },
];

type QueueState = {
  videos: QueueVideo[];
  addVideo: (video: QueueVideo) => void;
  removeVideo: (id: string) => void;
  setPriority: (id: string, priority: Priority) => void;
  patchVideo: (id: string, patch: Partial<QueueVideo>) => void;
  /** Новый порядок карточек одной секции: они встают на занятые ими места. */
  reorderVideos: (ids: string[]) => void;
};

export const useQueue = create<QueueState>()(
  persist(
    (set) => ({
      videos: SEED,
      addVideo: (video) =>
        set((state) => {
          if (state.videos.some((item) => item.id === video.id)) return state;
          return { videos: [video, ...state.videos] };
        }),
      removeVideo: (id) =>
        set((state) => ({
          videos: state.videos.filter((item) => item.id !== id),
        })),
      // Порядок массива и есть порядок карточек на экране, поэтому карточка
      // со сменённым приоритетом уходит в начало — наверх новой секции.
      setPriority: (id, priority) =>
        set((state) => {
          const target = state.videos.find((item) => item.id === id);
          if (!target || target.priority === priority) return state;
          return {
            videos: [
              { ...target, priority },
              ...state.videos.filter((item) => item.id !== id),
            ],
          };
        }),
      patchVideo: (id, patch) =>
        set((state) => ({
          videos: state.videos.map((item) =>
            item.id === id ? { ...item, ...patch } : item,
          ),
        })),
      reorderVideos: (ids) =>
        set((state) => {
          const moving = new Set(ids);
          const byId = new Map(state.videos.map((item) => [item.id, item]));
          const ordered = ids.flatMap((id) => byId.get(id) ?? []);
          let next = 0;
          return {
            videos: state.videos.map((item) =>
              moving.has(item.id) ? ordered[next++] : item,
            ),
          };
        }),
    }),
    {
      name: "ochered-queue",
      skipHydration: true,
      version: 5,
      migrate: (persisted, version) => {
        const state = persisted as { videos?: QueueVideo[] };
        // До v5 порядок внутри секции задавала сортировка «новые сверху»;
        // теперь он ручной и хранится порядком массива — стартуем с того же.
        if (state?.videos && version < 5) {
          state.videos = [...state.videos].sort(
            (a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0),
          );
        }
        if (state?.videos) {
          state.videos = state.videos.map((video) => ({
            ...video,
            category: video.category ?? "main",
            source: video.source ?? "youtube",
            episodes: video.episodes ?? null,
            watchedEpisodes: video.watchedEpisodes ?? 0,
            channelUrl: video.channelUrl ?? null,
          }));
        }
        return state;
      },
    },
  ),
);
