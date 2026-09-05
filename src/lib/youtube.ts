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
