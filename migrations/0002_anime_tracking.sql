create table if not exists anime_tracking (
  id text primary key,               -- совпадает с QueueVideo.id, напр. "animego:slug"
  slug text not null,
  url text not null,
  title text not null,
  studio text,
  thumbnail text,
  status text,                       -- сырой текст поля «Статус» с AnimeGO
  episodes_raw text,                 -- «19 / 24», как сейчас в QueueVideo.episodes
  episodes_available integer,
  latest_episode_number integer,
  latest_episode_title text,
  subscribed boolean not null default false,
  last_checked_at timestamptz,
  next_check_at timestamptz not null default now(),
  check_failed_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists anime_notifications (
  id bigserial primary key,
  anime_id text not null references anime_tracking(id) on delete cascade,
  title text not null,
  thumbnail text,
  episode_number integer not null,
  episode_title text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists anime_notifications_created_at_idx
  on anime_notifications (created_at desc);
