import { defineHandler } from "nitro";
import {
  getRecentNotifications,
  getSubscribedIds,
  getWishlist,
  toNotificationPayload,
} from "../lib/anime-tracking-store";
import { subscribeLive, type LiveEvent } from "../lib/live-bus";

const HEARTBEAT_MS = 25_000;

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Один SSE-канал на всё живое: новые карточки из /api/queue-ingest, новые
 * серии, новые уведомления. На подключении сразу шлёт текущее состояние
 * (`sync`) — открытая только что вкладка не ждёт первого события.
 */
export default defineHandler(async (event) => {
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (frame: string) => {
        try {
          controller.enqueue(encoder.encode(frame));
        } catch {
          // controller already closed (client disconnected mid-write)
        }
      };

      try {
        const [notifications, subscribedIds, wishlist] = await Promise.all([
          getRecentNotifications(),
          getSubscribedIds(),
          getWishlist(),
        ]);
        send(
          sseFrame("sync", {
            notifications: notifications.map(toNotificationPayload),
            subscribedIds,
            wishlist,
          }),
        );
      } catch (err) {
        console.error("[live-updates] initial sync failed:", err);
      }

      unsubscribe = subscribeLive((liveEvent: LiveEvent) => {
        send(sseFrame(liveEvent.type, liveEvent));
      });

      heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);

      event.req.signal?.addEventListener("abort", () => {
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
});
