import { EventEmitter } from "node:events";
import type { WishlistItem } from "../../src/lib/wishlist";

/**
 * Живые события для открытых вкладок — транслируются через
 * server/api/live-updates.get.ts (SSE). В памяти одного Node-процесса
 * достаточно: сайт крутится одним systemd-инстансом, без нескольких воркеров.
 */

/** «Вышла новая серия», «тайтл вышел полностью» либо «тайтл из вишлиста стартовал». */
export type NotificationKind = "episode" | "completed" | "ongoing";

export type NotificationPayload = {
  id: number;
  animeId: string;
  kind: NotificationKind;
  title: string;
  thumbnail: string | null;
  episodeNumber: number;
  episodeTitle: string | null;
  createdAt: string;
  readAt: string | null;
};

export type LiveEvent =
  | { type: "queue-item" }
  | { type: "notification"; notification: NotificationPayload }
  /** Вишлист целиком — он короткий, а менять его может и другое устройство. */
  | { type: "wishlist"; items: WishlistItem[] }
  | {
      type: "episode-updated";
      animeId: string;
      episodesRaw: string | null;
      episodesAvailable: number | null;
    };

const CHANNEL = "live";
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export function publish(event: LiveEvent): void {
  emitter.emit(CHANNEL, event);
}

/** Returns an unsubscribe function. */
export function subscribeLive(listener: (event: LiveEvent) => void): () => void {
  emitter.on(CHANNEL, listener);
  return () => emitter.off(CHANNEL, listener);
}
