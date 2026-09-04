-- Вишлист: аниме, которое ещё не вышло, но уже есть на AnimeGO. Живёт той же
-- строкой anime_tracking, что и обычная карточка, — фоновый чекер перечитывает
-- его тем же механизмом, что и онгоинги.
--
-- Приоритет запоминается здесь, а не в браузере: очередь у каждого браузера
-- своя, а вишлист один на всех. Когда тайтл выходит, строка помечается
-- `aired_at`, и каждый браузер при ближайшем открытии сайта создаёт себе
-- карточку с этим приоритетом (повторно не создаёт — помнит локально).
alter table anime_tracking
  add column if not exists wishlist boolean not null default false,
  add column if not exists wishlist_priority text not null default 'medium',
  -- дата первой серии: разобранная (YYYY-MM-DD) и сырой текст с сайта,
  -- потому что у анонсов там часто только сезон — «весна 2026»
  add column if not exists release_date text,
  add column if not exists release_raw text,
  add column if not exists aired_at timestamptz;

create index if not exists anime_tracking_wishlist_idx
  on anime_tracking (wishlist)
  where wishlist = true;
