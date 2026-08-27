import {
  fetchAnimegoHtml,
  parseAnimegoEpisodes,
  parseAnimegoStatus,
  parseLatestEpisode,
} from "../../src/lib/animego.functions";
import { availableEpisodes } from "../../src/lib/animego";
import {
  applyCheckFailure,
  applyCheckResult,
  cleanupOldNotifications,
  getDueAnime,
  toNotificationPayload,
  type AnimeTrackingRow,
  type CheckResult,
} from "./anime-tracking-store";
import { publish } from "./live-bus";

const BATCH_SIZE = 5;
const INTERVAL_MS = 5 * 60 * 1000;

/**
 * Records an already-scraped result and publishes the live-update events.
 * Shared by the background checker (parses HTML it fetched anonymously) and
 * `POST /api/anime-recheck-result` (fed fields scraped from the DOM in the
 * user's own logged-in browser for titles the server can't read directly).
 */
export async function recordCheckResult(
  row: AnimeTrackingRow,
  result: CheckResult,
): Promise<void> {
  const notification = await applyCheckResult(row, result);

  publish({
    type: "episode-updated",
    animeId: row.id,
    episodesRaw: result.episodesRaw,
    episodesAvailable: result.episodesAvailable,
  });

  if (notification) {
    publish({ type: "notification", notification: toNotificationPayload(notification) });
  }
}

function parseCheckResult(html: string): CheckResult {
  const episodesRaw = parseAnimegoEpisodes(html);
  const latest = parseLatestEpisode(html);
  return {
    status: parseAnimegoStatus(html),
    episodesRaw,
    episodesAvailable: availableEpisodes(episodesRaw),
    latestEpisodeNumber: latest?.number ?? null,
    latestEpisodeTitle: latest?.title ?? null,
  };
}

async function checkOne(row: AnimeTrackingRow): Promise<void> {
  let html: string;
  try {
    html = await fetchAnimegoHtml(row.url);
  } catch {
    await applyCheckFailure(row.id);
    return;
  }

  try {
    await recordCheckResult(row, parseCheckResult(html));
  } catch (err) {
    console.error(`[anime-checker] failed to process ${row.id}:`, err);
    await applyCheckFailure(row.id);
  }
}

async function runPass(): Promise<void> {
  try {
    const due = await getDueAnime(BATCH_SIZE);
    for (const row of due) {
      await checkOne(row);
    }
    await cleanupOldNotifications();
  } catch (err) {
    // A DB hiccup (unreachable Postgres, mid-deploy restart) must not kill
    // the interval — the next pass just retries.
    console.error("[anime-checker] pass failed:", err);
  }
}

const globalRef = globalThis as typeof globalThis & {
  __animeCheckerStarted__?: boolean;
};

/** Idempotent — safe to call on every module load (HMR, multiple imports). */
export function ensureAnimeCheckerStarted(): void {
  if (typeof window !== "undefined") return;
  if (globalRef.__animeCheckerStarted__) return;
  globalRef.__animeCheckerStarted__ = true;
  setInterval(() => void runPass(), INTERVAL_MS);
}
