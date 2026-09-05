import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";
import { fetchYoutubeAnimatedThumbnail } from "@/lib/youtube.functions";

/** Столько курсор должен простоять на превью, чтобы запросить анимацию. */
const HOVER_DELAY_MS = 400;

/** Ссылку на анимацию по видео просим один раз на вкладку. */
const requests = new Map<string, Promise<string | null>>();

function loadAnimatedThumbnail(
  videoId: string,
  title: string,
): Promise<string | null> {
  let request = requests.get(videoId);
  if (!request) {
    request = fetchYoutubeAnimatedThumbnail({ data: { videoId, title } }).catch(
      () => null,
    );
    requests.set(videoId, request);
  }
  return request;
}

/** Картинку прогреваем заранее: показываем готовую анимацию, без рывка. */
function preload(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });
}

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

export type ThumbnailPreview = {
  /** Ссылка на анимацию, когда её уже можно показывать; иначе null. */
  src: string | null;
  onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerLeave: () => void;
};

/**
 * Предпросмотр при наведении мышью на превью: через 400 мс поверх обложки
 * встаёт анимированная превьюшка YouTube — тот же `an_webp`, что крутится на
 * главной YouTube. Это обычная анимированная картинка: браузер зацикливает её
 * сам, никаких таймеров, плееров и iframe.
 */
export function useThumbnailPreview(
  videoId: string,
  title: string,
  enabled: boolean,
): ThumbnailPreview {
  const [src, setSrc] = useState<string | null>(null);
  const hovering = useRef(false);
  const hoverTimer = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (hoverTimer.current != null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }, []);

  useEffect(() => {
    hovering.current = false;
    clearTimer();
    setSrc(null);
  }, [clearTimer, videoId]);

  useEffect(() => {
    return () => {
      hovering.current = false;
      if (hoverTimer.current != null) window.clearTimeout(hoverTimer.current);
    };
  }, []);

  const onPointerEnter = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || event.pointerType !== "mouse") return;
      if (!previewAllowed()) return;
      hovering.current = true;
      clearTimer();
      hoverTimer.current = window.setTimeout(() => {
        hoverTimer.current = null;
        void (async () => {
          const url = await loadAnimatedThumbnail(videoId, title);
          if (!url || !hovering.current) return;
          const ready = await preload(url);
          if (!ready) {
            // Подпись протухла — пусть следующее наведение попросит заново.
            requests.delete(videoId);
            return;
          }
          if (!hovering.current) return;
          setSrc(url);
        })();
      }, HOVER_DELAY_MS);
    },
    [clearTimer, enabled, title, videoId],
  );

  const onPointerLeave = useCallback(() => {
    hovering.current = false;
    clearTimer();
    setSrc(null);
  }, [clearTimer]);

  return { src, onPointerEnter, onPointerLeave };
}

type ThumbnailPreviewImageProps = {
  preview: ThumbnailPreview;
};

/** Анимация поверх обложки. Уходит вместе с курсором. */
export function ThumbnailPreviewImage({ preview }: ThumbnailPreviewImageProps) {
  if (!preview.src) return null;

  return (
    <img
      src={preview.src}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full object-cover",
        "fade-in animate-in duration-200",
      )}
    />
  );
}
