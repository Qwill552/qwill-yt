/**
 * Тексты уведомлений — общие для выпадающего списка колокольчика и всплывающей
 * плашки, чтобы «20 серия» и «Вышло полностью, 24 серии» нигде не разъехались.
 */

export type NotificationKind = "episode" | "completed" | "ongoing";

export type AnimeNotification = {
  id: number;
  animeId: string;
  kind: NotificationKind;
  title: string;
  thumbnail: string | null;
  /** У `completed` — итоговое число вышедших серий, у `ongoing` — первая. */
  episodeNumber: number;
  episodeTitle: string | null;
  createdAt: string;
  readAt: string | null;
};

/** «1 серия», «2 серии», «5 серий». */
export function pluralEpisodes(count: number): string {
  return `${count} ${plural(count, "серия", "серии", "серий")}`;
}

/** «1 тайтл», «2 тайтла», «5 тайтлов». */
export function pluralTitles(count: number): string {
  return `${count} ${plural(count, "тайтл", "тайтла", "тайтлов")}`;
}

function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(count) % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = mod100 % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/** Вторая строка уведомления: что именно произошло с тайтлом. */
export function describeNotification(notification: AnimeNotification): string {
  if (notification.kind === "completed") {
    return `Вышло полностью, ${pluralEpisodes(notification.episodeNumber)}`;
  }
  // Тайтл из вишлиста стартовал: номер первой серии здесь не нужен — важно,
  // что аниме вообще началось, а карточка уже появилась в очереди.
  if (notification.kind === "ongoing") return "Теперь онгоинг!";
  return notification.episodeTitle ?? `${notification.episodeNumber} серия`;
}

/** Правый бейдж уведомления: номер серии, «ФУЛЛ» или «NEW!». */
export function notificationBadge(notification: AnimeNotification): string {
  if (notification.kind === "completed") return "ФУЛЛ";
  if (notification.kind === "ongoing") return "NEW!";
  return String(notification.episodeNumber);
}
