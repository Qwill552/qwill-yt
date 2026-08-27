import { defineHandler } from "nitro";
import {
  getRecentNotifications,
  getSubscribedIds,
  toNotificationPayload,
} from "../lib/anime-tracking-store";

/** Начальная гидратация колокольчика — тот же payload, что и `sync`-событие SSE. */
export default defineHandler(async () => {
  const [notifications, subscribedIds] = await Promise.all([
    getRecentNotifications(),
    getSubscribedIds(),
  ]);
  return Response.json({
    notifications: notifications.map(toNotificationPayload),
    subscribedIds,
  });
});
