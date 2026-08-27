import { create } from "zustand";
import { persist } from "zustand/middleware";
import { thumbnailUrl, watchUrl } from "./youtube";

export type Priority = "high" | "medium" | "low";

export type QueueVideo = {
  id: string;
  url: string;
  title: string;
  channel: string;
  durationSeconds: number | null;
  publishedAt: string | null;
  thumbnail: string;
  priority: Priority;
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
    durationSeconds: 19,
    publishedAt: "2005-04-23",
    thumbnail: thumbnailUrl("jNQXAC9IVRw"),
    priority: "high",
    addedAt: 6,
  },
  {
    id: "DHjqpvDnNGE",
    url: watchUrl("DHjqpvDnNGE"),
    title: "JavaScript in 100 Seconds",
    channel: "Fireship",
    durationSeconds: 148,
    publishedAt: "2022-01-13",
    thumbnail: thumbnailUrl("DHjqpvDnNGE"),
    priority: "high",
    addedAt: 5,
  },
  {
    id: "aqz-KE-bpKQ",
    url: watchUrl("aqz-KE-bpKQ"),
    title: "Big Buck Bunny 60fps 4K — Official Blender Foundation Short Film",
    channel: "Blender",
    durationSeconds: 635,
    publishedAt: "2014-11-10",
    thumbnail: thumbnailUrl("aqz-KE-bpKQ"),
    priority: "medium",
    addedAt: 4,
  },
  {
    id: "kJQP7kiw5Fk",
    url: watchUrl("kJQP7kiw5Fk"),
    title: "Luis Fonsi — Despacito ft. Daddy Yankee",
    channel: "LuisFonsiVEVO",
    durationSeconds: 282,
    publishedAt: "2017-01-12",
    thumbnail: thumbnailUrl("kJQP7kiw5Fk"),
    priority: "medium",
    addedAt: 3,
  },
  {
    id: "9bZkp7q19f0",
    url: watchUrl("9bZkp7q19f0"),
    title: "PSY — GANGNAM STYLE M/V",
    channel: "officialpsy",
    durationSeconds: 252,
    publishedAt: "2012-07-15",
    thumbnail: thumbnailUrl("9bZkp7q19f0"),
    priority: "low",
    addedAt: 2,
  },
  {
    id: "dQw4w9WgXcQ",
    url: watchUrl("dQw4w9WgXcQ"),
    title: "Rick Astley — Never Gonna Give You Up (Official Video) (4K Remaster)",
    channel: "Rick Astley",
    durationSeconds: 213,
    publishedAt: "2009-10-25",
    thumbnail: thumbnailUrl("dQw4w9WgXcQ"),
    priority: "low",
    addedAt: 1,
  },
];

type QueueState = {
  videos: QueueVideo[];
  addVideo: (video: QueueVideo) => void;
  removeVideo: (id: string) => void;
  setPriority: (id: string, priority: Priority) => void;
  patchVideo: (id: string, patch: Partial<QueueVideo>) => void;
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
      setPriority: (id, priority) =>
        set((state) => ({
          videos: state.videos.map((item) =>
            item.id === id ? { ...item, priority } : item,
          ),
        })),
      patchVideo: (id, patch) =>
        set((state) => ({
          videos: state.videos.map((item) =>
            item.id === id ? { ...item, ...patch } : item,
          ),
        })),
    }),
    { name: "ochered-queue", skipHydration: true },
  ),
);

export function sortQueue(videos: QueueVideo[]): QueueVideo[] {
  return [...videos].sort((a, b) => {
    const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (rank !== 0) return rank;
    return b.addedAt - a.addedAt;
  });
}
