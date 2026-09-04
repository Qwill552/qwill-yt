import type { Priority } from "./queue-store";
import { formatPublishedAt } from "./youtube";

/**
 * Строка вишлиста — аниме, которое ещё не вышло. Форма общая для сервера
 * (`anime_tracking`, где вишлист и живёт) и для панели на клиенте.
 */
export type WishlistItem = {
  /** тот же id, что будет у карточки очереди: «animego:<slug>» */
  id: string;
  slug: string;
  url: string;
  title: string;
  /** студия-аниматор — как в карточке */
  studio: string | null;
  thumbnail: string | null;
  /** приоритет, с которым карточка родится при выходе */
  priority: Priority;
  /** дата первой серии, YYYY-MM-DD — если AnimeGO её знает */
  releaseDate: string | null;
  /** сырой текст поля «Выпуск»/«Сезон» — «весна 2026» и прочее без точной даты */
  releaseRaw: string | null;
  /** «12 / ?» на момент последней проверки — уедет в карточку при выходе */
  episodesRaw: string | null;
  /** уведомление о выходе (и, дальше, о новых сериях) — включено по умолчанию */
  subscribed: boolean;
  /** проставляется сервером в момент выхода: пора создавать карточку */
  airedAt: string | null;
};

/**
 * Дата выхода первой серии для панели. Точной даты у анонса часто нет — тогда
 * показываем ровно то, что написано на AnimeGO («весна 2026»), а не прячем
 * строку совсем.
 */
export function wishlistDateLabel(item: WishlistItem): string {
  const exact = formatPublishedAt(item.releaseDate);
  if (exact) return exact;
  const raw = item.releaseRaw?.replace(/\s+/g, " ").trim();
  return raw || "Дата неизвестна";
}
