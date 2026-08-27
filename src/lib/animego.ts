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

/** Идентификатор в очереди — с префиксом, чтобы не столкнуться с id ютуба. */
export function animegoQueueId(slug: string): string {
  return `animego:${slug}`;
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
