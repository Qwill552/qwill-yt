import { getSql } from "../../src/lib/db";
import type { NotificationPayload } from "./live-bus";

const RECHECK_HOURS = 3;
const NOTIFICATION_RETENTION_DAYS = 30;

export type AnimeTrackingRow = {
  id: string;
  slug: string;
  url: string;
  title: string;
  studio: string | null;
  thumbnail: string | null;
  status: string | null;
  episodes_raw: string | null;
  episodes_available: number | null;
  latest_episode_number: number | null;
  latest_episode_title: string | null;
  subscribed: boolean;
  last_checked_at: string | null;
  next_check_at: string;
  check_failed_count: number;
  created_at: string;
};

export type AnimeNotificationRow = {
  id: number;
  anime_id: string;
  title: string;
  thumbnail: string | null;
  episode_number: number;
  episode_title: string | null;
  created_at: string;
  read_at: string | null;
};

export type SubscribeInput = {
  id: string;
  slug: string;
  url: string;
  title: string;
  studio: string | null;
  thumbnail: string | null;
  episodesRaw: string | null;
  episodesAvailable: number | null;
  subscribed: boolean;
};

function nextCheckAfterRecheck(): Date {
  return new Date(Date.now() + RECHECK_HOURS * 60 * 60 * 1000);
}

export async function upsertSubscription(input: SubscribeInput): Promise<void> {
  const sql = await getSql();
  // Новая подписка проверяется сразу (обработчик тут же пинает чекер), дальше —
  // раз в RECHECK_HOURS от момента проверки. Разброс по времени берётся сам
  // собой: подписки ставятся в разные моменты, и все следующие чеки от них
  // и отсчитываются — залпом по AnimeGO это не бьёт.
  const nextCheckAt = new Date();
  await sql`
    insert into anime_tracking
      (id, slug, url, title, studio, thumbnail, episodes_raw, episodes_available, subscribed, next_check_at)
    values
      (${input.id}, ${input.slug}, ${input.url}, ${input.title}, ${input.studio}, ${input.thumbnail},
       ${input.episodesRaw}, ${input.episodesAvailable}, ${input.subscribed}, ${nextCheckAt})
    on conflict (id) do update set
      subscribed = excluded.subscribed,
      title = excluded.title,
      studio = coalesce(excluded.studio, anime_tracking.studio),
      thumbnail = coalesce(excluded.thumbnail, anime_tracking.thumbnail),
      next_check_at = case
        when excluded.subscribed and not anime_tracking.subscribed then excluded.next_check_at
        else anime_tracking.next_check_at
      end
  `;
}

export async function getSubscribedIds(): Promise<string[]> {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    select id from anime_tracking where subscribed = true
  `;
  return rows.map((row) => row.id);
}

export async function getDueAnime(limit: number): Promise<AnimeTrackingRow[]> {
  const sql = await getSql();
  return sql<AnimeTrackingRow>`
    select * from anime_tracking
    where subscribed = true and next_check_at <= now()
    order by next_check_at asc
    limit ${limit}
  `;
}

export async function getRecheckCandidates(limit: number): Promise<AnimeTrackingRow[]> {
  const sql = await getSql();
  return sql<AnimeTrackingRow>`
    select * from anime_tracking
    where subscribed = true and check_failed_count > 0
    order by check_failed_count desc, last_checked_at asc nulls first
    limit ${limit}
  `;
}

export async function getBySlug(slug: string): Promise<AnimeTrackingRow | null> {
  const sql = await getSql();
  const rows = await sql<AnimeTrackingRow>`
    select * from anime_tracking where slug = ${slug} limit 1
  `;
  return rows[0] ?? null;
}

export type CheckResult = {
  status: string | null;
  episodesRaw: string | null;
  episodesAvailable: number | null;
  latestEpisodeNumber: number | null;
  latestEpisodeTitle: string | null;
  title?: string;
  thumbnail?: string | null;
};

/**
 * Записывает результат успешной проверки. `previous` — строка, полученная
 * до перезапроса (из `getDueAnime`/`getRecheckCandidates`), чтобы решить,
 * появилась ли новая серия, без лишнего SELECT.
 */
export async function applyCheckResult(
  previous: AnimeTrackingRow,
  result: CheckResult,
): Promise<AnimeNotificationRow | null> {
  const sql = await getSql();
  const newNumber = result.latestEpisodeNumber ?? result.episodesAvailable ?? null;
  const oldNumber = previous.latest_episode_number ?? previous.episodes_available ?? null;
  const isNewEpisode = newNumber != null && (oldNumber == null || newNumber > oldNumber);
  const nextCheckAt = nextCheckAfterRecheck();

  await sql`
    update anime_tracking set
      status = ${result.status},
      episodes_raw = ${result.episodesRaw},
      episodes_available = ${result.episodesAvailable},
      latest_episode_number = ${result.latestEpisodeNumber},
      latest_episode_title = ${result.latestEpisodeTitle},
      title = ${result.title ?? previous.title},
      thumbnail = ${result.thumbnail ?? previous.thumbnail},
      last_checked_at = now(),
      next_check_at = ${nextCheckAt},
      check_failed_count = 0
    where id = ${previous.id}
  `;

  if (!isNewEpisode) return null;

  const rows = await sql<AnimeNotificationRow>`
    insert into anime_notifications (anime_id, title, thumbnail, episode_number, episode_title)
    values (
      ${previous.id},
      ${result.title ?? previous.title},
      ${result.thumbnail ?? previous.thumbnail},
      ${newNumber},
      ${result.latestEpisodeTitle}
    )
    returning *
  `;
  return rows[0] ?? null;
}

export async function applyCheckFailure(id: string): Promise<void> {
  const sql = await getSql();
  const nextCheckAt = nextCheckAfterRecheck();
  await sql`
    update anime_tracking set
      last_checked_at = now(),
      next_check_at = ${nextCheckAt},
      check_failed_count = check_failed_count + 1
    where id = ${id}
  `;
}

export async function getRecentNotifications(): Promise<AnimeNotificationRow[]> {
  const sql = await getSql();
  return sql<AnimeNotificationRow>`
    select * from anime_notifications
    where created_at > now() - (${NOTIFICATION_RETENTION_DAYS} * interval '1 day')
    order by created_at desc
  `;
}

export async function markNotificationsRead(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const sql = await getSql();
  await sql.query(
    `update anime_notifications set read_at = now() where id = any($1) and read_at is null`,
    [ids],
  );
}

export function toNotificationPayload(row: AnimeNotificationRow): NotificationPayload {
  return {
    id: row.id,
    animeId: row.anime_id,
    title: row.title,
    thumbnail: row.thumbnail,
    episodeNumber: row.episode_number,
    episodeTitle: row.episode_title,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

export async function cleanupOldNotifications(): Promise<void> {
  const sql = await getSql();
  await sql`
    delete from anime_notifications
    where created_at < now() - (${NOTIFICATION_RETENTION_DAYS} * interval '1 day')
  `;
}
