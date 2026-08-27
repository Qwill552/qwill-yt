import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { animegoUrl, extractAnimegoSlug } from "./animego";

export type AnimegoMeta = {
  slug: string;
  url: string;
  title: string;
  /** студия-аниматор — занимает место канала в карточке */
  studio: string;
  thumbnail: string;
  /** «19 / 24», «8 / ?», «24» — как на сайте */
  episodes: string | null;
  publishedAt: string | null;
};

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
};

const RU_MONTHS: Record<string, number> = {
  янв: 0,
  фев: 1,
  мар: 2,
  апр: 3,
  ма: 4,
  май: 4,
  мая: 4,
  июн: 5,
  июл: 6,
  авг: 7,
  сен: 8,
  окт: 9,
  ноя: 10,
  дек: 11,
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  laquo: "«",
  raquo: "»",
  mdash: "—",
  ndash: "–",
  hellip: "…",
};

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&([a-z]+);/gi, (match, name: string) => {
      const replacement = NAMED_ENTITIES[name.toLowerCase()];
      return replacement ?? match;
    });
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function ymd(year: number, monthIndex: number, day: number): string | null {
  if (year < 1960 || year > 2100) return null;
  if (monthIndex < 0 || monthIndex > 11) return null;
  if (day < 1 || day > 31) return null;
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

/** «4 апреля 2026», «4 апр. 2026», «2026-07-04» → «2026-04-04» */
export function parseAnimegoDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  const iso = cleaned.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return ymd(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const dmy = cleaned.match(/(\d{1,2})\s+([а-яё]+)\.?\s+(\d{4})/i);
  if (dmy) {
    const name = dmy[2].toLowerCase();
    const key = Object.keys(RU_MONTHS).find((prefix) =>
      name.startsWith(prefix),
    );
    const month = key != null ? RU_MONTHS[key] : undefined;
    if (month != null) return ymd(Number(dmy[3]), month, Number(dmy[1]));
  }

  return null;
}

/**
 * Информационный блок страницы — пары «подпись → значение» в соседних
 * ячейках грида: <div ...text-opacity-75>Студия</div><div ...text-break>…</div>
 */
function fieldHtml(html: string, label: string): string | null {
  const pattern = new RegExp(
    `text-opacity-75"[^>]*>\\s*${label}\\s*</div>\\s*<div[^>]*text-break[^>]*>([\\s\\S]*?)</div>`,
    "i",
  );
  return html.match(pattern)?.[1] ?? null;
}

function fieldValue(html: string, label: string): string | null {
  const raw = fieldHtml(html, label);
  if (raw == null) return null;
  const value = stripTags(raw);
  return value || null;
}

/** Студий может быть несколько — каждая отдельной ссылкой. */
function fieldLinks(html: string, label: string): string | null {
  const raw = fieldHtml(html, label);
  if (raw == null) return null;
  const names = [...raw.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => stripTags(match[1]))
    .filter(Boolean);
  if (names.length > 0) return names.join(", ");
  const value = stripTags(raw);
  return value || null;
}

function metaContent(html: string, property: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)="${property}"[^>]+content="([^"]*)"`,
    "i",
  );
  const value = html.match(pattern)?.[1];
  return value ? decodeEntities(value).trim() : null;
}

type JsonLd = {
  name?: string;
  alternateName?: string;
  image?: string;
  datePublished?: string;
};

function parseJsonLd(html: string): JsonLd | null {
  const blocks = html.matchAll(
    /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks) {
    try {
      const data = JSON.parse(block[1].trim()) as JsonLd & { "@type"?: string };
      if (data?.name || data?.image) return data;
    } catch {
      /* на странице бывает и чужой ld+json — пропускаем битые блоки */
    }
  }
  return null;
}

function cleanTitle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/\s*смотреть\s+онлайн.*$/i, "")
    .replace(/\s*—\s*Аниме\s*$/i, "")
    .trim();
  return cleaned || null;
}

/**
 * Общий низкоуровневый fetch страницы тайтла — используется и разовым
 * резолвом при добавлении карточки, и фоновым чекером серий. Часть тайтлов
 * AnimeGO не отдаёт анонимным запросам: в браузере с залогиненной сессией
 * страница открывается, а серверу прилетает 404 (тогда карточку/обновление
 * приходится собирать в браузере — см. qwill-yt.user.js).
 */
export async function fetchAnimegoHtml(pageUrl: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(pageUrl, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error("AnimeGO не отвечает");
  }
  if (res.status === 404) {
    throw new Error("AnimeGO отвечает 404 — сервер не может прочитать страницу");
  }
  if (!res.ok) {
    throw new Error("AnimeGO не отвечает");
  }

  const html = await res.text().catch(() => "");
  if (!html) {
    throw new Error("Не удалось прочитать страницу AnimeGO");
  }
  return html;
}

/** «Статус» тайтла — «Онгоинг», «Завершён» и т.п., как на странице. */
export function parseAnimegoStatus(html: string): string | null {
  return fieldValue(html, "Статус");
}

/** «19 / 24», «8 / ?», «24» — то же поле, что читает `resolveAnimegoMeta`. */
export function parseAnimegoEpisodes(html: string): string | null {
  return fieldValue(html, "Эпизоды");
}

const SCHEDULE_START = "schedule-episodes-table__tbody";
const SCHEDULE_END = "schedule-episodes__read-more";
const RELEASED_MARK = "icon-link text-success";

export type LatestEpisode = { number: number; title: string | null };

/**
 * Последняя вышедшая серия — номер и название — из блока «График выхода
 * серий» на странице тайтла (та же страница, что уже читает
 * `fetchAnimegoHtml`, доп. запрос не нужен). Строки идут от новых к
 * старым; первая с зелёной галочкой (`RELEASED_MARK`) — вышедшая, ещё не
 * вышедшие показывают вместо неё текст «через N дней». Возвращает `null`,
 * если разметка блока не найдена (сайт поменялся) — вызывающий код должен
 * откатиться к номеру серии из поля «Эпизоды» без названия.
 */
export function parseLatestEpisode(html: string): LatestEpisode | null {
  const startAt = html.indexOf(SCHEDULE_START);
  if (startAt === -1) return null;
  const endAt = html.indexOf(SCHEDULE_END, startAt);
  const block = endAt === -1 ? html.slice(startAt) : html.slice(startAt, endAt);

  const rows = block.split(/(?=data-label="\d+\.")/).slice(1);
  for (const row of rows) {
    if (!row.includes(RELEASED_MARK)) continue;
    const numberMatch = row.match(/data-number="(\d+)"/);
    if (!numberMatch) continue;
    const titleMatch = row.match(
      /data-read-more-auto-button-value="false">([\s\S]*?)<\/span>/,
    );
    const rawTitle = titleMatch ? stripTags(titleMatch[1]) : "";
    return {
      number: Number(numberMatch[1]),
      title: rawTitle && rawTitle !== "---" ? rawTitle : null,
    };
  }
  return null;
}

export async function resolveAnimegoMeta(url: string): Promise<AnimegoMeta> {
  const slug = extractAnimegoSlug(url);
  if (!slug) {
    throw new Error("Не похоже на ссылку AnimeGO");
  }

  const pageUrl = animegoUrl(slug);
  const html = await fetchAnimegoHtml(pageUrl);

  const ld = parseJsonLd(html);

  const title =
    ld?.name?.trim() ||
    cleanTitle(metaContent(html, "og:title")) ||
    cleanTitle(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]) ||
    "Аниме";

  const thumbnail =
    ld?.image?.trim() || metaContent(html, "og:image") || "";

  const studio = fieldLinks(html, "Студия") ?? "AnimeGO";
  const episodes = fieldValue(html, "Эпизоды");
  const publishedAt =
    parseAnimegoDate(ld?.datePublished) ??
    parseAnimegoDate(fieldValue(html, "Выпуск")) ??
    parseAnimegoDate(fieldValue(html, "Сезон"));

  if (!thumbnail && title === "Аниме") {
    throw new Error("Страница AnimeGO не распознана");
  }

  return {
    slug,
    url: pageUrl,
    title,
    studio,
    thumbnail,
    episodes,
    publishedAt,
  };
}

export const fetchAnimegoMeta = createServerFn({ method: "POST" })
  .validator(z.object({ url: z.string().min(1) }))
  .handler(async ({ data }): Promise<AnimegoMeta> => {
    return resolveAnimegoMeta(data.url);
  });
