const SLUG_RE = /^[a-z0-9-]+$/i;

/** animego переезжает по зеркалам — принимаем любой домен вида animego.* */
function isAnimegoHost(host: string): boolean {
  const clean = host.replace(/^www\./, "").replace(/^m\./, "");
  return clean === "animego" || clean.startsWith("animego.");
}

export function extractAnimegoSlug(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (!isAnimegoHost(url.hostname)) return null;

    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "anime") return null;

    const slug = parts[1] ?? "";
    // /anime/studio/482-... и прочие подразделы — не карточки тайтлов
    if (!slug || !SLUG_RE.test(slug)) return null;
    if (["studio", "genre", "season", "type", "search"].includes(slug)) {
      return null;
    }
    return slug;
  } catch {
    return null;
  }
}

export function isAnimegoUrl(input: string): boolean {
  return extractAnimegoSlug(input) !== null;
}

export function animegoUrl(slug: string): string {
  return `https://animego.me/anime/${slug}`;
}

const ANIMEGO_QUEUE_PREFIX = "animego:";

/** Идентификатор в очереди — с префиксом, чтобы не столкнуться с id ютуба. */
export function animegoQueueId(slug: string): string {
  return `${ANIMEGO_QUEUE_PREFIX}${slug}`;
}

/** Обратная операция к `animegoQueueId` — `null`, если id не аниме-карточки. */
export function slugFromQueueId(id: string): string | null {
  return id.startsWith(ANIMEGO_QUEUE_PREFIX) ? id.slice(ANIMEGO_QUEUE_PREFIX.length) : null;
}

/**
 * Поле «Статус» на AnimeGO у полностью вышедшего тайтла — «Вышел» (онгоинг —
 * «Онгоинг», ещё не начавшийся — «Анонс»). Всё, что не опознано как вышедшее,
 * считается живым и продолжает перечитываться: пропустить смену формулировки
 * не так дорого, как навсегда перестать чекать онгоинг.
 */
const RELEASED_STATUSES = new Set(["вышел", "вышло", "завершён", "завершен"]);
const ANNOUNCED_STATUSES = new Set(["анонс", "анонсировано", "анонсирован"]);

export function isReleasedStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return RELEASED_STATUSES.has(status.trim().toLowerCase());
}

export function isAnnouncedStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return ANNOUNCED_STATUSES.has(status.trim().toLowerCase());
}

/** Разобранное состояние страницы тайтла — что знаем о его выходе. */
export type AnimeState = {
  status: string | null;
  episodesAvailable: number | null;
  latestEpisodeNumber: number | null;
};

/**
 * «Ещё не вышло» — такое аниме уходит в вишлист вместо очереди: страница
 * говорит «Анонс» ИЛИ на ней нет ни одной вышедшей серии. Полностью вышедший
 * тайтл сюда не попадает даже без разобранных серий: «Вышел» — это точно уже
 * вышло, сколько бы серий ни удалось прочитать.
 */
export function isUpcomingAnime(state: AnimeState): boolean {
  if (state.latestEpisodeNumber != null) return false;
  if ((state.episodesAvailable ?? 0) > 0) return false;
  return !isReleasedStatus(state.status);
}

/**
 * Выход тайтла из вишлиста — «что раньше»: появилась первая вышедшая серия
 * ИЛИ статус перестал быть «Анонс».
 *
 * Вторая половина — именно переход, а не статическая проверка «сейчас не
 * анонс». Тайтл мог попасть в вишлист с кривым статусом (не «Анонс», но и без
 * единой серии — AnimeGO иногда так и держит), и статическая проверка объявила
 * бы его вышедшим на первой же перепроверке.
 */
export function hasJustAired(
  previousStatus: string | null | undefined,
  next: AnimeState,
): boolean {
  if (next.latestEpisodeNumber != null) return true;
  if ((next.episodesAvailable ?? 0) > 0) return true;
  return isAnnouncedStatus(previousStatus) && !isAnnouncedStatus(next.status);
}

/**
 * На animego эпизоды пишутся как «19 / 24» (вышло / запланировано),
 * «8 / ?» (онгоинг) или «52» (завершён). Нас интересует первое число —
 * сколько серий уже доступно к просмотру.
 */
export function availableEpisodes(
  episodes: string | null | undefined,
): number | null {
  if (!episodes) return null;
  const match = episodes.match(/\d+/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** «0/12 эп.» — просмотрено из доступных. */
export function formatEpisodes(
  episodes: string | null | undefined,
  watched: number | null | undefined = 0,
): string | null {
  const available = availableEpisodes(episodes);
  if (available == null) {
    const clean = episodes?.replace(/\s+/g, " ").trim();
    return clean ? `${clean} эп.` : null;
  }
  return `${clampWatched(watched, available)}/${available} эп.`;
}

export function clampWatched(
  watched: number | null | undefined,
  available: number | null,
): number {
  const value = Math.trunc(Number(watched));
  if (!Number.isFinite(value) || value < 0) return 0;
  const max = available ?? 9999;
  return Math.min(value, max);
}
