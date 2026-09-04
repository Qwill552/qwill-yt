import { getWishlist } from "./anime-tracking-store";
import { publish } from "./live-bus";

/**
 * Рассылает вишлист целиком по открытым вкладкам. Список короткий (десятки
 * строк максимум), а меняться может откуда угодно — из другой вкладки, с
 * телефона, из фоновой проверки, — поэтому дешевле переслать его весь, чем
 * сводить дельты.
 */
export async function publishWishlist(): Promise<void> {
  try {
    publish({ type: "wishlist", items: await getWishlist() });
  } catch (err) {
    // Живое обновление панели — не повод валить запрос, который её изменил:
    // вкладка догонит список при ближайшем переподключении SSE.
    console.error("[wishlist] publish failed:", err);
  }
}
