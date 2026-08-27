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

export function formatEpisodes(episodes: string | null | undefined): string | null {
  if (!episodes) return null;
  const clean = episodes.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return `${clean} эп.`;
}
