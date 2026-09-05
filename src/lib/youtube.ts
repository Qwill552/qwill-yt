import { format, isValid, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

const ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export function isYoutubeId(value: string): boolean {
  return ID_RE.test(value);
}

export function extractVideoId(input: string): string | null {
  const raw = input.trim();
  if (isYoutubeId(raw)) return raw;

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
      return isYoutubeId(id) ? id : null;
    }

    const youtubeHosts = new Set([
      "youtube.com",
      "music.youtube.com",
      "youtube-nocookie.com",
    ]);
    if (!youtubeHosts.has(host)) return null;

    const fromQuery = url.searchParams.get("v");
    if (fromQuery && isYoutubeId(fromQuery)) return fromQuery;

    const parts = url.pathname.split("/").filter(Boolean);
    if (
      parts.length >= 2 &&
      ["shorts", "embed", "live", "v"].includes(parts[0] ?? "") &&
      isYoutubeId(parts[1] ?? "")
    ) {
      return parts[1] ?? null;
    }
  } catch {
    return null;
  }

  return null;
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function channelUrl(channelId: string): string {
  return `https://www.youtube.com/channel/${channelId}`;
}

export function thumbnailUrl(videoId: string, quality: "max" | "hq" = "hq"): string {
  const file = quality === "max" ? "maxresdefault.jpg" : "hqdefault.jpg";
  return `https://i.ytimg.com/vi/${videoId}/${file}`;
}

export function formatDuration(totalSeconds: number | null): string | null {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return null;
  }
  const seconds = Math.round(totalSeconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatPublishedAt(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let parsed = parseISO(trimmed);
  if (!isValid(parsed)) {
    parsed = new Date(trimmed);
  }
  if (!isValid(parsed) || Number.isNaN(parsed.getTime())) return null;
  return format(parsed, "d MMM yyyy", { locale: ru });
}

export function probeYoutubeDuration(
  videoId: string,
  timeoutMs = 7000,
): Promise<number | null> {
  if (typeof document === "undefined") return Promise.resolve(null);

  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;
    iframe.setAttribute("aria-hidden", "true");
    iframe.tabIndex = -1;
    iframe.style.cssText =
      "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;border:0";

    let settled = false;
    const timer = window.setTimeout(() => finish(null), timeoutMs);

    function finish(value: number | null) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      iframe.remove();
      resolve(value);
    }

    function onMessage(event: MessageEvent) {
      if (typeof event.data !== "string") return;
      try {
        const payload = JSON.parse(event.data) as {
          event?: string;
          info?: { duration?: number };
        };
        const duration = payload.info?.duration;
        if (typeof duration === "number" && duration > 0) {
          finish(Math.round(duration));
        }
      } catch {
        /* ignore non-player messages */
      }
    }

    window.addEventListener("message", onMessage);
    iframe.addEventListener("load", () => {
      iframe.contentWindow?.postMessage(
        JSON.stringify({ event: "listening", id: videoId }),
        "*",
      );
    });
    document.body.appendChild(iframe);
  });
}

/**
 * Один спрайт-лист раскадровки. Последний лист YouTube обрезает по числу
 * оставшихся кадров (4 кадра при сетке 5×5 приезжают как 640×90), поэтому
 * масштаб фона считается по сетке конкретного листа, а не по общей.
 */
export type StoryboardSheet = {
  url: string;
  columns: number;
  rows: number;
};

export type Storyboard = {
  sheets: StoryboardSheet[];
  /** колонок на полном листе — по ним кадры разложены построчно */
  columns: number;
  /** кадров на полном листе */
  perSheet: number;
  /** всего кадров по всему видео */
  frameCount: number;
  frameWidth: number;
  frameHeight: number;
};

/** Ниже этого кадры слишком мыльные для карточки — лучше статичная обложка. */
const MIN_STORYBOARD_FRAME_WIDTH = 80;

/**
 * Разбирает `playerStoryboardSpecRenderer.spec`:
 * `base|уровень0|уровень1|…`, где уровень — это
 * `ширина#высота#кадров#колонок#строк#интервал#шаблон_имени#подпись`.
 * В базовой ссылке `$L` — номер уровня, `$N` — имя листа (`M0`, `M1`, …).
 * Берём самый качественный уровень; ссылки подписаны и живут недолго.
 */
export function parseStoryboardSpec(
  spec: string | null | undefined,
): Storyboard | null {
  if (!spec) return null;
  const parts = spec.split("|");
  const base = parts.shift();
  if (!base || !base.includes("$L") || !base.includes("$N")) return null;
  // У трансляций раскадровка другого формата — не трогаем.
  if (base.includes("storyboard_live_")) return null;

  let best: Storyboard | null = null;

  for (let level = 0; level < parts.length; level += 1) {
    const fields = (parts[level] ?? "").split("#");
    if (fields.length < 8) continue;

    const frameWidth = Number(fields[0]);
    const frameHeight = Number(fields[1]);
    const frameCount = Number(fields[2]);
    const columns = Number(fields[3]);
    const rows = Number(fields[4]);
    const nameTemplate = fields[6] ?? "";
    const sigh = fields[7] ?? "";

    const numbers = [frameWidth, frameHeight, frameCount, columns, rows];
    if (!numbers.every((value) => Number.isFinite(value) && value > 0)) continue;
    if (!nameTemplate || !sigh) continue;
    if (frameWidth < MIN_STORYBOARD_FRAME_WIDTH) continue;
    if (best && best.frameWidth >= frameWidth) continue;

    const perSheet = columns * rows;
    const sheetCount = Math.ceil(frameCount / perSheet);
    const sheets: StoryboardSheet[] = [];
    for (let sheet = 0; sheet < sheetCount; sheet += 1) {
      const remaining = frameCount - sheet * perSheet;
      const url = `${base
        .replace("$L", String(level))
        .replace("$N", nameTemplate.replace("$M", String(sheet)))}&sigh=${sigh}`;
      sheets.push({
        url,
        columns: Math.min(remaining, columns),
        rows: Math.min(Math.ceil(remaining / columns), rows),
      });
    }

    best = { sheets, columns, perSheet, frameCount, frameWidth, frameHeight };
  }

  return best;
}
