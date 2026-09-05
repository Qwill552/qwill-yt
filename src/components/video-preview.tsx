import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { cn } from "@/lib/utils";

/** Столько курсор должен простоять на превью, чтобы плеер начал грузиться. */
const HOVER_DELAY_MS = 400;
/** Не заиграло за это время — считаем, что видео встраивать нельзя. */
const START_TIMEOUT_MS = 3000;
/** Состояние плеера YouTube: 1 — играет. */
const PLAYER_STATE_PLAYING = 1;

/** Сколько раз плеер не завёлся: одна осечка может быть просто медленной
 *  сетью, поэтому сдаёмся только после второй. */
const failedStarts = new Map<string, number>();
const MAX_FAILED_STARTS = 2;

/** Только мышь и только если пользователь не просил меньше движения. */
function previewAllowed(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    return false;
  }
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function playerSrc(videoId: string): string {
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    controls: "0",
    disablekb: "1",
    fs: "0",
    modestbranding: "1",
    rel: "0",
    playsinline: "1",
    iv_load_policy: "3",
    enablejsapi: "1",
    // Зациклить одиночное видео можно только через плейлист из него самого.
    loop: "1",
    playlist: videoId,
    origin: window.location.origin,
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

export type ThumbnailPreview = {
  /** Ссылка на плеер, пока идёт наведение; null — iframe размонтирован. */
  src: string | null;
  /** Видео реально пошло: обложку можно прятать, кнопку Play убирать. */
  playing: boolean;
  /** Доля просмотренного, 0…1 — для тонкой полосы прогресса. */
  progress: number;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  onIframeLoad: () => void;
  onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerLeave: () => void;
};

/**
 * Предпросмотр при наведении мышью на превью: через 400 мс поверх обложки
 * монтируется беззвучный плеер YouTube и играет настоящее видео — как на
 * главной YouTube. Обложка остаётся видна, пока плеер не заиграет; если он не
 * завёлся за 3 секунды (видео запрещено встраивать), откатываемся к обложке.
 */
export function useThumbnailPreview(
  videoId: string,
  enabled: boolean,
): ThumbnailPreview {
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const videoIdRef = useRef(videoId);
  videoIdRef.current = videoId;
  const hovering = useRef(false);
  const hoverTimer = useRef<number | null>(null);
  const startTimer = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (hoverTimer.current != null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    if (startTimer.current != null) {
      window.clearTimeout(startTimer.current);
      startTimer.current = null;
    }
    setSrc(null);
    setPlaying(false);
    setProgress(0);
  }, []);

  useEffect(() => {
    hovering.current = false;
    stop();
  }, [stop, videoId]);

  useEffect(() => {
    return () => {
      hovering.current = false;
      if (hoverTimer.current != null) window.clearTimeout(hoverTimer.current);
      if (startTimer.current != null) window.clearTimeout(startTimer.current);
    };
  }, []);

  const onPointerEnter = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || event.pointerType !== "mouse") return;
      if ((failedStarts.get(videoId) ?? 0) >= MAX_FAILED_STARTS) return;
      if (!previewAllowed()) return;
      hovering.current = true;
      if (hoverTimer.current != null) window.clearTimeout(hoverTimer.current);
      hoverTimer.current = window.setTimeout(() => {
        hoverTimer.current = null;
        if (!hovering.current) return;
        setSrc(playerSrc(videoId));
        startTimer.current = window.setTimeout(() => {
          startTimer.current = null;
          // Плеер так и не заиграл — откатываемся к обложке.
          failedStarts.set(videoId, (failedStarts.get(videoId) ?? 0) + 1);
          setSrc(null);
          setPlaying(false);
        }, START_TIMEOUT_MS);
      }, HOVER_DELAY_MS);
    },
    [enabled, videoId],
  );

  const onPointerLeave = useCallback(() => {
    hovering.current = false;
    stop();
  }, [stop]);

  /** Плеер отвечает на «listening» потоком сообщений о своём состоянии. */
  const onIframeLoad = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "listening", id: videoId }),
      "*",
    );
  }, [videoId]);

  useEffect(() => {
    if (!src) return;

    const onMessage = (event: MessageEvent) => {
      const frame = iframeRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      if (typeof event.data !== "string") return;

      // `onStateChange` приносит состояние числом, `infoDelivery` — объектом
      // с currentTime и duration. Нас устраивают обе формы.
      let payload: {
        event?: string;
        info?:
          | number
          | { playerState?: number; currentTime?: number; duration?: number };
      };
      try {
        payload = JSON.parse(event.data);
      } catch {
        return; // не сообщение плеера
      }

      const info = payload.info;
      const state =
        typeof info === "number"
          ? info
          : typeof info === "object" && info
            ? info.playerState
            : undefined;

      if (state === PLAYER_STATE_PLAYING) {
        failedStarts.delete(videoIdRef.current);
        if (startTimer.current != null) {
          window.clearTimeout(startTimer.current);
          startTimer.current = null;
        }
        setPlaying(true);
      }

      if (typeof info !== "object" || !info) return;
      const { currentTime, duration } = info;
      if (
        typeof currentTime === "number" &&
        typeof duration === "number" &&
        duration > 0
      ) {
        setProgress(Math.min(currentTime / duration, 1));
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [src]);

  return {
    src,
    playing,
    progress,
    iframeRef,
    onIframeLoad,
    onPointerEnter,
    onPointerLeave,
  };
}

type ThumbnailPreviewFrameProps = {
  preview: ThumbnailPreview;
};

/**
 * Плеер поверх обложки. Пока видео не пошло, слой прозрачный — плеер уже
 * грузится, но пользователь видит обычную картинку, без чёрного провала.
 */
export function ThumbnailPreviewFrame({ preview }: ThumbnailPreviewFrameProps) {
  if (!preview.src) return null;

  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 bg-bg transition-opacity duration-200 ease-out",
        preview.playing ? "opacity-100" : "opacity-0",
      )}
    >
      <iframe
        ref={preview.iframeRef}
        src={preview.src}
        title="Предпросмотр видео"
        tabIndex={-1}
        allow="autoplay; encrypted-media"
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={preview.onIframeLoad}
        className="h-full w-full border-0"
      />
      <span className="absolute inset-x-0 bottom-0 h-0.5 bg-fg/20">
        <span
          className="block h-full bg-accent"
          style={{ width: `${preview.progress * 100}%` }}
        />
      </span>
    </span>
  );
}
