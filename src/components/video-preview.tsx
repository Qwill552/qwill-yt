import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Storyboard } from "@/lib/youtube";
import { fetchYoutubeStoryboard } from "@/lib/youtube.functions";

/** 8 кадров в секунду — примерно как беглая перемотка на YouTube. */
const FRAME_MS = 125;
/** Столько курсор должен простоять на превью, чтобы предпросмотр запустился. */
const HOVER_DELAY_MS = 400;
/** За сколько кадров до конца листа начинаем тянуть следующий. */
const SHEET_LOOKAHEAD = 5;

/** Раскадровку по видео просим один раз на вкладку. */
const storyboardRequests = new Map<string, Promise<Storyboard | null>>();

function loadStoryboard(videoId: string): Promise<Storyboard | null> {
  let request = storyboardRequests.get(videoId);
  if (!request) {
    request = fetchYoutubeStoryboard({ data: { videoId } }).catch(() => null);
    storyboardRequests.set(videoId, request);
  }
  return request;
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
  storyboard: Storyboard | null;
  frame: number;
  active: boolean;
  onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerLeave: () => void;
};

/**
 * Предпросмотр кадров при наведении на превью: ждём 400 мс, тянем раскадровку,
 * прокручиваем кадры по всему видео. Спрайт-листы грузятся по мере надобности,
 * на незагруженный лист не перескакиваем.
 */
export function useThumbnailPreview(
  videoId: string,
  enabled: boolean,
): ThumbnailPreview {
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [frame, setFrame] = useState(0);
  const [active, setActive] = useState(false);

  const hovering = useRef(false);
  const hoverTimer = useRef<number | null>(null);
  const loadedSheets = useRef(new Set<number>());
  const sheetLoads = useRef(new Map<number, Promise<boolean>>());

  useEffect(() => {
    loadedSheets.current = new Set();
    sheetLoads.current = new Map();
    setStoryboard(null);
    setFrame(0);
    setActive(false);
  }, [videoId]);

  const loadSheet = useCallback((board: Storyboard, index: number) => {
    const sheet = board.sheets[index];
    if (!sheet) return Promise.resolve(false);
    if (loadedSheets.current.has(index)) return Promise.resolve(true);

    let pending = sheetLoads.current.get(index);
    if (!pending) {
      pending = new Promise<boolean>((resolve) => {
        const image = new Image();
        image.onload = () => {
          loadedSheets.current.add(index);
          resolve(true);
        };
        image.onerror = () => {
          // Даём шанс повторить попытку при следующем наведении.
          sheetLoads.current.delete(index);
          resolve(false);
        };
        image.src = sheet.url;
      });
      sheetLoads.current.set(index, pending);
    }
    return pending;
  }, []);

  const start = useCallback(async () => {
    const board = await loadStoryboard(videoId);
    if (!board || !hovering.current) return;
    const ready = await loadSheet(board, 0);
    if (!ready || !hovering.current) return;
    setStoryboard(board);
    setFrame(0);
    setActive(true);
  }, [loadSheet, videoId]);

  const onPointerEnter = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || event.pointerType !== "mouse") return;
      if (!previewAllowed()) return;
      hovering.current = true;
      if (hoverTimer.current != null) window.clearTimeout(hoverTimer.current);
      hoverTimer.current = window.setTimeout(() => {
        hoverTimer.current = null;
        void start();
      }, HOVER_DELAY_MS);
    },
    [enabled, start],
  );

  const onPointerLeave = useCallback(() => {
    hovering.current = false;
    if (hoverTimer.current != null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setActive(false);
    setFrame(0);
  }, []);

  useEffect(() => {
    return () => {
      hovering.current = false;
      if (hoverTimer.current != null) window.clearTimeout(hoverTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!active || !storyboard) return;

    let raf = 0;
    let current = 0;
    let last = performance.now();

    const step = (now: number) => {
      raf = window.requestAnimationFrame(step);
      if (now - last < FRAME_MS) return;

      const next = (current + 1) % storyboard.frameCount;
      const sheetIndex = Math.floor(next / storyboard.perSheet);
      if (!loadedSheets.current.has(sheetIndex)) {
        // Лист ещё едет — стоим на текущем кадре, а не мигаем пустотой.
        void loadSheet(storyboard, sheetIndex);
        return;
      }

      last = now;
      current = next;
      setFrame(next);

      const lookahead = Math.floor(
        ((next + SHEET_LOOKAHEAD) % storyboard.frameCount) / storyboard.perSheet,
      );
      if (lookahead !== sheetIndex) void loadSheet(storyboard, lookahead);
    };

    raf = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(raf);
  }, [active, loadSheet, storyboard]);

  return { storyboard, frame, active, onPointerEnter, onPointerLeave };
}

type ThumbnailPreviewLayerProps = {
  storyboard: Storyboard;
  frame: number;
};

/**
 * Кадр рисуется одним фоном по спрайт-листу. Последний лист обрезан по числу
 * оставшихся кадров, поэтому масштаб берём из сетки конкретного листа.
 */
export function ThumbnailPreviewLayer({
  storyboard,
  frame,
}: ThumbnailPreviewLayerProps) {
  const sheetIndex = Math.floor(frame / storyboard.perSheet);
  const sheet = storyboard.sheets[sheetIndex];
  if (!sheet) return null;

  const local = frame % storyboard.perSheet;
  const column = local % storyboard.columns;
  const row = Math.floor(local / storyboard.columns);
  const x = sheet.columns > 1 ? (column / (sheet.columns - 1)) * 100 : 0;
  const y = sheet.rows > 1 ? (row / (sheet.rows - 1)) * 100 : 0;
  const progress = ((frame + 1) / storyboard.frameCount) * 100;

  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-surface-2 bg-no-repeat"
        style={{
          backgroundImage: `url("${sheet.url}")`,
          backgroundSize: `${sheet.columns * 100}% ${sheet.rows * 100}%`,
          backgroundPosition: `${x}% ${y}%`,
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-fg/20"
      >
        <span
          className="block h-full bg-accent"
          style={{ width: `${progress}%` }}
        />
      </span>
    </>
  );
}
