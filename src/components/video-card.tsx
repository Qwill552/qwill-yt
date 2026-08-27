import { useEffect, useRef, useState } from "react";
import { Calendar, Clock, Play, Tv, Trash2 } from "lucide-react";
import { PriorityToggle } from "@/components/priority-toggle";
import { Button } from "@/components/ui/button";
import { availableEpisodes, clampWatched, formatEpisodes } from "@/lib/animego";
import type { Priority, QueueVideo } from "@/lib/queue-store";
import { cn } from "@/lib/utils";
import { formatDuration, formatPublishedAt, thumbnailUrl } from "@/lib/youtube";

type VideoCardProps = {
  video: QueueVideo;
  index: number;
  onPriority: (priority: Priority) => void;
  onWatched: (episodes: number) => void;
  onRemove: () => void;
};

export function VideoCard({
  video,
  index,
  onPriority,
  onWatched,
  onRemove,
}: VideoCardProps) {
  const [thumb, setThumb] = useState(video.thumbnail);
  const isAnime = video.source === "animego";
  const duration = formatDuration(video.durationSeconds);
  const available = availableEpisodes(video.episodes);
  const watched = clampWatched(video.watchedEpisodes, available);
  const episodes = formatEpisodes(video.episodes, watched);
  const badge = isAnime ? episodes : duration;
  const published = formatPublishedAt(video.publishedAt);

  return (
    <article
      className="card-enter flex flex-col rounded-xl bg-surface p-2 shadow-border"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <a
        href={video.url}
        target="_blank"
        rel="noopener noreferrer"
        className="press-thumb group relative block overflow-hidden rounded-lg focus-visible:ring-2 focus-visible:ring-accent/50"
        aria-label={`Открыть «${video.title}» на ${isAnime ? "AnimeGO" : "YouTube"}`}
      >
        {thumb ? (
          <img
            src={thumb}
            alt=""
            width={isAnime ? 700 : 1280}
            height={isAnime ? 980 : 720}
            loading="lazy"
            decoding="async"
            onError={
              isAnime ? undefined : () => setThumb(thumbnailUrl(video.id, "hq"))
            }
            className={cn(
              "w-full object-cover outline outline-1 -outline-offset-1 outline-fg/10",
              isAnime ? "aspect-[5/7]" : "aspect-video",
            )}
          />
        ) : (
          <div
            className={cn(
              "flex w-full items-center justify-center bg-surface-2 outline outline-1 -outline-offset-1 outline-fg/10",
              isAnime ? "aspect-[5/7]" : "aspect-video",
            )}
          >
            <Tv className="size-8 text-subtle" strokeWidth={1.5} />
          </div>
        )}
        <span className="pointer-events-none absolute inset-0 bg-linear-to-t from-bg/70 via-transparent to-transparent opacity-80" />
        <span
          className={cn(
            "pointer-events-none absolute inset-0 flex items-center justify-center",
            "opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-visible:opacity-100",
          )}
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-fg/92 text-bg shadow-border">
            <Play className="ml-0.5 size-5 fill-current" strokeWidth={0} />
          </span>
        </span>
        {badge ? (
          <span className="absolute right-2 bottom-2 rounded-xs bg-bg/88 px-1.5 py-0.5 font-medium text-fg text-xs tabular-nums shadow-border">
            {badge}
          </span>
        ) : null}
      </a>

      <div className="flex flex-1 flex-col gap-3 px-2 pt-3 pb-1.5">
        <div className="flex flex-col gap-1.5">
          <h3 className="line-clamp-2 font-medium text-sm text-fg leading-snug sm:text-base">
            <a
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors duration-150 hover:text-accent focus-visible:text-accent"
            >
              {video.title}
            </a>
          </h3>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted text-sm">
            <span className="max-w-full truncate">{video.channel}</span>
            {published ? (
              <span className="inline-flex items-center gap-1 text-subtle">
                <Calendar className="size-3.5" strokeWidth={1.75} />
                <time className="tabular-nums" dateTime={video.publishedAt ?? undefined}>
                  {published}
                </time>
              </span>
            ) : null}
            {isAnime ? (
              available != null ? (
                <EpisodesEditor
                  watched={watched}
                  available={available}
                  onChange={onWatched}
                />
              ) : episodes ? (
                <span className="inline-flex items-center gap-1 text-subtle">
                  <Tv className="size-3.5" strokeWidth={1.75} />
                  <span className="tabular-nums">{episodes}</span>
                </span>
              ) : null
            ) : duration ? (
              <span className="inline-flex items-center gap-1 text-subtle sm:hidden">
                <Clock className="size-3.5" strokeWidth={1.75} />
                <span className="tabular-nums">{duration}</span>
              </span>
            ) : null}
          </p>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2">
          <PriorityToggle
            value={video.priority}
            onChange={onPriority}
            size="sm"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Убрать из очереди"
            title="Убрать из очереди"
            onClick={onRemove}
            className="size-10 text-subtle hover:text-high"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </article>
  );
}

type EpisodesEditorProps = {
  watched: number;
  available: number;
  onChange: (episodes: number) => void;
};

/** Клик по счётчику серий превращает его в поле ввода: «сколько просмотрено». */
function EpisodesEditor({ watched, available, onChange }: EpisodesEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  function commit() {
    setEditing(false);
    if (draft === "") return;
    const parsed = Number.parseInt(draft, 10);
    if (!Number.isFinite(parsed)) return;
    const next = Math.min(Math.max(parsed, 0), available);
    if (next !== watched) onChange(next);
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1 text-subtle">
        <Tv className="size-3.5" strokeWidth={1.75} />
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(event) =>
            setDraft(event.target.value.replace(/\D/g, "").slice(0, 4))
          }
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setEditing(false);
            }
          }}
          aria-label="Сколько серий просмотрено"
          className="w-9 rounded-xs bg-bg/60 px-1 py-0.5 text-center text-fg tabular-nums outline outline-1 outline-accent/60 focus-visible:outline-accent"
        />
        <span className="tabular-nums">/{available} эп.</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(String(watched));
        setEditing(true);
      }}
      title="Указать, сколько серий просмотрено"
      className="inline-flex items-center gap-1 rounded-xs text-subtle transition-colors duration-150 hover:text-accent focus-visible:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <Tv className="size-3.5" strokeWidth={1.75} />
      <span className="tabular-nums">
        {watched}/{available} эп.
      </span>
    </button>
  );
}
