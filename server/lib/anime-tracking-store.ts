import { hasJustAired, isReleasedStatus } from "../../src/lib/animego";
import { getSql } from "../../src/lib/db";
import type { Priority } from "../../src/lib/queue-store";
import type { WishlistItem } from "../../src/lib/wishlist";
import type { NotificationKind, NotificationPayload } from "./live-bus";

const RECHECK_HOURS = 3;
const NOTIFICATION_RETENTION_DAYS = 30;

/**
 * Сколько вышедший вишлист-тайтл ещё висит в списке. Очередь у каждого браузера
 * своя, поэтому карточку создаёт каждый — при своём ближайшем открытии сайта;
 * строка должна дождаться самого редко заходящего устройства.
 */
const WISHLIST_AIRED_RETENTION_DAYS = 30;

export { isReleasedStatus };

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
  finished: boolean;
  last_checked_at: string | null;
  next_check_at: string;
  check_failed_count: number;
  created_at: string;
  /** строка вишлиста: тайтл ещё не вышел (или вышел, но не всеми забран) */
  wishlist: boolean;
  wishlist_priority: Priority;
  release_date: string | null;
  release_raw: string | null;
  aired_at: string | null;
};

export type AnimeNotificationRow = {
  id: number;
  anime_id: string;
  kind: NotificationKind;
  title: string;
  thumbnail: string | null;
  episode_number: number;
  episode_title: string | null;
  created_at: string;
  read_at: string | null;
};

/** Карточка аниме из очереди браузера — общая форма для трекинга и подписки. */
export type TrackInput = {
  id: string;
  slug: string;
  url: string;
  title: string;
  studio: string | null;
  thumbnail: string | null;
  episodesRaw: string | null;
  episodesAvailable: number | null;
};

export type SubscribeInput = TrackInput & { subscribed: boolean };

function nextCheckAfterRecheck(): Date {
  return new Date(Date.now() + RECHECK_HOURS * 60 * 60 * 1000);
}

/**
 * Заводит строки для карточек, о которых сервер ещё не знает, и НЕ трогает уже
 * известные: очередь живёт в localStorage и присылается целиком при каждом
 * открытии сайта, так что перезапись полей на каждый заход затирала бы свежие
 * данные чекера прошлогодним снимком из браузера.
 *
 * Возвращает id реально добавленных — по нему вызывающий решает, будить ли
 * чекер: если ничего нового не пришло, поход в AnimeGO не нужен.
 */
export async function trackAnime(items: TrackInput[]): Promise<string[]> {
  if (items.length === 0) return [];
  const sql = await getSql();

  const columns = 8;
  const values: unknown[] = [];
  const rows = items.map((item, index) => {
    values.push(
      item.id,
      item.slug,
      item.url,
      item.title,
      item.studio,
      item.thumbnail,
      item.episodesRaw,
      item.episodesAvailable,
    );
    const base = index * columns;
    const holes = Array.from({ length: columns }, (_, i) => `$${base + i + 1}`);
    return `(${holes.join(", ")})`;
  });

  const inserted = await sql.query<{ id: string }>(
    `insert into anime_tracking
       (id, slug, url, title, studio, thumbnail, episodes_raw, episodes_available)
     values ${rows.join(", ")}
     on conflict (id) do nothing
     returning id`,
    values,
  );
  return inserted.map((row) => row.id);
}

/** Карточку удалили из очереди — строка и её уведомления уходят вместе с ней. */
export async function untrackAnime(id: string): Promise<void> {
  const sql = await getSql();
  await sql`delete from anime_tracking where id = ${id}`;
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

/** Все отслеживаемые (не только подписанные) тайтлы, которым пора обновиться. */
export async function getDueAnime(limit: number): Promise<AnimeTrackingRow[]> {
  const sql = await getSql();
  return sql<AnimeTrackingRow>`
    select * from anime_tracking
    where finished = false and next_check_at <= now()
    order by next_check_at asc
    limit ${limit}
  `;
}

export async function getRecheckCandidates(limit: number): Promise<AnimeTrackingRow[]> {
  const sql = await getSql();
  return sql<AnimeTrackingRow>`
    select * from anime_tracking
    where finished = false and check_failed_count > 0
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

/** Аниме, которое ещё не вышло: то же отслеживание плюс запомненный приоритет. */
export type WishlistInput = {
  id: string;
  slug: string;
  url: string;
  title: string;
  studio: string | null;
  thumbnail: string | null;
  status: string | null;
  episodesRaw: string | null;
  episodesAvailable: number | null;
  priority: Priority;
  releaseDate: string | null;
  releaseRaw: string | null;
};

export function toWishlistItem(row: AnimeTrackingRow): WishlistItem {
  return {
    id: row.id,
    slug: row.slug,
    url: row.url,
    title: row.title,
    studio: row.studio,
    thumbnail: row.thumbnail,
    priority: row.wishlist_priority,
    releaseDate: row.release_date,
    releaseRaw: row.release_raw,
    episodesRaw: row.episodes_raw,
    subscribed: row.subscribed,
    airedAt: row.aired_at,
  };
}

/** Вышедшие — первыми (их пора забирать в очередь), дальше по близости выхода. */
export async function getWishlist(): Promise<WishlistItem[]> {
  const sql = await getSql();
  const rows = await sql<AnimeTrackingRow>`
    select * from anime_tracking
    where wishlist = true
    order by
      (aired_at is null) asc,
      coalesce(release_date, '9999-12-31') asc,
      created_at desc
  `;
  return rows.map(toWishlistItem);
}

/**
 * Кладёт тайтл в вишлист. Строка та же, что у обычной карточки, поэтому
 * добавление уже отслеживаемого аниме просто включает ему вишлист-режим.
 * Уведомления включены по умолчанию: иначе о самом выходе никто не расскажет.
 */
export async function addToWishlist(input: WishlistInput): Promise<void> {
  const sql = await getSql();
  const nextCheckAt = new Date();
  await sql`
    insert into anime_tracking
      (id, slug, url, title, studio, thumbnail, status, episodes_raw, episodes_available,
       subscribed, next_check_at, wishlist, wishlist_priority, release_date, release_raw)
    values
      (${input.id}, ${input.slug}, ${input.url}, ${input.title}, ${input.studio},
       ${input.thumbnail}, ${input.status}, ${input.episodesRaw}, ${input.episodesAvailable},
       true, ${nextCheckAt}, true, ${input.priority}, ${input.releaseDate}, ${input.releaseRaw})
    on conflict (id) do update set
      wishlist = true,
      wishlist_priority = excluded.wishlist_priority,
      subscribed = true,
      aired_at = null,
      title = excluded.title,
      studio = coalesce(excluded.studio, anime_tracking.studio),
      thumbnail = coalesce(excluded.thumbnail, anime_tracking.thumbnail),
      release_date = coalesce(excluded.release_date, anime_tracking.release_date),
      release_raw = coalesce(excluded.release_raw, anime_tracking.release_raw),
      next_check_at = excluded.next_check_at
  `;
}

/** Убрали из вишлиста руками — строка и её уведомления уходят вместе с ней. */
export async function removeFromWishlist(id: string): Promise<void> {
  const sql = await getSql();
  await sql`delete from anime_tracking where id = ${id} and wishlist = true`;
}

/** Приоритет и колокольчик правятся прямо в панели, до выхода тайтла. */
export async function updateWishlistItem(
  id: string,
  patch: { priority?: Priority; subscribed?: boolean },
): Promise<void> {
  const sql = await getSql();
  await sql`
    update anime_tracking set
      wishlist_priority = coalesce(${patch.priority ?? null}::text, wishlist_priority),
      subscribed = coalesce(${patch.subscribed ?? null}::boolean, subscribed)
    where id = ${id} and wishlist = true
  `;
}

/**
 * Вышедшие тайтлы, которые уже никто не заберёт, выпадают из вишлиста —
 * строка остаётся обычной отслеживаемой карточкой.
 */
export async function cleanupAiredWishlist(): Promise<number> {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    update anime_tracking set wishlist = false
    where wishlist = true
      and aired_at is not null
      and aired_at < now() - (${WISHLIST_AIRED_RETENTION_DAYS} * interval '1 day')
    returning id
  `;
  return rows.length;
}

export type CheckResult = {
  status: string | null;
  episodesRaw: string | null;
  episodesAvailable: number | null;
  latestEpisodeNumber: number | null;
  latestEpisodeTitle: string | null;
  title?: string;
  thumbnail?: string | null;
  releaseDate?: string | null;
  releaseRaw?: string | null;
};

/**
 * Записывает результат успешной проверки. `previous` — строка, полученная
 * до перезапроса (из `getDueAnime`/`getRecheckCandidates`), чтобы решить,
 * появилась ли новая серия, без лишнего SELECT.
 *
 * Уведомление рождается только у подписанных тайтлов: счётчик серий сервер
 * обновляет у всех карточек очереди, а колокольчик наполняет — нет.
 * Уведомление «вышло полностью» требует ещё и базы для сравнения
 * (`previous.status`): у только что заведённой карточки её нет, поэтому уже
 * завершённое аниме, добавленное в очередь, о своём финале не сообщает.
 */
export async function applyCheckResult(
  previous: AnimeTrackingRow,
  result: CheckResult,
): Promise<AnimeNotificationRow | null> {
  const sql = await getSql();
  const newNumber = result.latestEpisodeNumber ?? result.episodesAvailable ?? null;
  const oldNumber = previous.latest_episode_number ?? previous.episodes_available ?? null;
  const finished = isReleasedStatus(result.status);
  const justFinished =
    finished && previous.status != null && !isReleasedStatus(previous.status);
  const hasNewEpisode = newNumber != null && oldNumber != null && newNumber > oldNumber;
  // Тайтл из вишлиста вышел: у строки появляется `aired_at`, и браузеры
  // создают себе карточку с запомненным приоритетом.
  const justAired =
    previous.wishlist &&
    previous.aired_at == null &&
    hasJustAired(previous.status, {
      status: result.status,
      episodesAvailable: result.episodesAvailable,
      latestEpisodeNumber: result.latestEpisodeNumber,
    });
  const nextCheckAt = nextCheckAfterRecheck();

  await sql`
    update anime_tracking set
      status = ${result.status},
      finished = ${finished},
      episodes_raw = ${result.episodesRaw},
      episodes_available = ${result.episodesAvailable},
      latest_episode_number = ${result.latestEpisodeNumber},
      latest_episode_title = ${result.latestEpisodeTitle},
      title = ${result.title ?? previous.title},
      thumbnail = ${result.thumbnail ?? previous.thumbnail},
      release_date = coalesce(${result.releaseDate ?? null}::text, release_date),
      release_raw = coalesce(${result.releaseRaw ?? null}::text, release_raw),
      aired_at = case when ${justAired}::boolean then now() else aired_at end,
      last_checked_at = now(),
      next_check_at = ${nextCheckAt},
      check_failed_count = 0
    where id = ${previous.id}
  `;

  if (!previous.subscribed) return null;

  // На одной проверке легко совпадают сразу несколько событий, а уведомление
  // об одном и том же — шум. Порядок жёсткий:
  //  • «теперь онгоинг» — старт тайтла из вишлиста. Первая серия приходит тем
  //    же заходом, и отдельное «1 серия» о ней было бы дублем: карточка ведь
  //    только что создалась именно потому, что аниме вышло;
  //  • «вышло полностью» — последняя серия обычно выходит вместе со сменой
  //    статуса, и итоговое число серий в этом уведомлении уже есть;
  //  • «новая серия» — всё остальное.
  const kind: NotificationKind | null = justAired
    ? "ongoing"
    : justFinished
      ? "completed"
      : hasNewEpisode
        ? "episode"
        : null;
  // У стартовавшего анонса счётчик серий может быть ещё не разобран — старт
  // всё равно первая серия.
  const number = newNumber ?? (kind === "ongoing" ? 1 : null);
  if (kind == null || number == null) return null;

  const rows = await sql<AnimeNotificationRow>`
    insert into anime_notifications (anime_id, kind, title, thumbnail, episode_number, episode_title)
    values (
      ${previous.id},
      ${kind},
      ${result.title ?? previous.title},
      ${result.thumbnail ?? previous.thumbnail},
      ${number},
      ${kind === "episode" ? result.latestEpisodeTitle : null}
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
    kind: row.kind,
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
