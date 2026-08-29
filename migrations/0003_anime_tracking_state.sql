-- Тип уведомления: «вышла серия» или «тайтл вышел полностью».
alter table anime_notifications
  add column if not exists kind text not null default 'episode';

-- Вышедшие тайтлы больше не перечитываются. Флаг, а не сравнение с текстом
-- поля «Статус», чтобы смена формулировки на AnimeGO не сломала выборку.
alter table anime_tracking
  add column if not exists finished boolean not null default false;

-- Строка заводится и для неподписанных карточек — счётчик серий обновляется
-- у всех, уведомления шлются только подписанным.
create index if not exists anime_tracking_due_idx
  on anime_tracking (next_check_at)
  where finished = false;
