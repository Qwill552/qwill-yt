import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/** За ссылки, кнопки и поля не тянем — они продолжают работать как раньше. */
const INTERACTIVE =
  "a, button, input, textarea, select, label, [role='button'], [data-no-drag]";
/** Мышью: сдвиг, после которого нажатие на фоне становится перетаскиванием. */
const MOUSE_THRESHOLD = 5;
/** Пальцем: удержание на месте, иначе это обычная прокрутка страницы. */
const TOUCH_DELAY = 300;
const TOUCH_TOLERANCE = 8;
/** Автопрокрутка, когда карточку подносят к краю экрана. */
const EDGE = 80;
const MAX_SCROLL_SPEED = 18;

type Rect = { left: number; top: number; right: number; bottom: number };

type DragState = {
  id: string;
  from: number;
  to: number;
  /** места карточек в координатах страницы на момент начала перетаскивания */
  slots: Rect[];
};

type Session = {
  pointerId: number;
  touch: boolean;
  id: string;
  ids: string[];
  from: number;
  to: number;
  /** точка нажатия в координатах страницы */
  start: { x: number; y: number };
  client: { x: number; y: number };
  slots: Rect[];
  active: boolean;
  timer: number | null;
  frame: number | null;
  detach: () => void;
};

type SortableGridProps<T extends { id: string }> = {
  items: T[];
  onReorder: (ids: string[]) => void;
  className?: string;
  children: (item: T, index: number) => ReactNode;
};

/**
 * Сетка карточек, которые можно переставлять, перетаскивая за фон: мышью —
 * сразу, пальцем — после короткого удержания, чтобы не мешать прокрутке.
 * Пока карточка едет, DOM не трогаем — соседи лишь сдвигаются на свои будущие
 * места, а новый порядок уходит в `onReorder` только после отпускания.
 */
export function SortableGrid<T extends { id: string }>({
  items,
  onReorder,
  className,
  children,
}: SortableGridProps<T>) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const session = useRef<Session | null>(null);
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  const finish = useCallback((commit: boolean) => {
    const s = session.current;
    if (!s) return;
    session.current = null;
    if (s.timer != null) window.clearTimeout(s.timer);
    if (s.frame != null) window.cancelAnimationFrame(s.frame);
    s.detach();
    document.documentElement.style.removeProperty("cursor");
    const node = nodes.current.get(s.id);
    if (node) node.style.removeProperty("translate");
    if (commit && s.active && s.to !== s.from) {
      const ids = [...s.ids];
      const [moved] = ids.splice(s.from, 1);
      ids.splice(s.to, 0, moved);
      onReorderRef.current(ids);
    }
    setDrag(null);
  }, []);

  const tick = useCallback(() => {
    const s = session.current;
    if (!s || !s.active) return;

    const { y } = s.client;
    if (y < EDGE) {
      window.scrollBy(0, -Math.ceil(((EDGE - y) / EDGE) * MAX_SCROLL_SPEED));
    } else if (y > window.innerHeight - EDGE) {
      const depth = y - (window.innerHeight - EDGE);
      window.scrollBy(0, Math.ceil((depth / EDGE) * MAX_SCROLL_SPEED));
    }

    const px = s.client.x + window.scrollX;
    const py = s.client.y + window.scrollY;
    const node = nodes.current.get(s.id);
    if (node) {
      node.style.translate = `${px - s.start.x}px ${py - s.start.y}px`;
    }

    const hit = s.slots.findIndex(
      (slot) =>
        px >= slot.left && px <= slot.right && py >= slot.top && py <= slot.bottom,
    );
    if (hit !== -1 && hit !== s.to) {
      s.to = hit;
      setDrag({ id: s.id, from: s.from, to: hit, slots: s.slots });
    }

    s.frame = window.requestAnimationFrame(tick);
  }, []);

  const activate = useCallback(() => {
    const s = session.current;
    if (!s || s.active) return;
    s.timer = null;
    s.slots = s.ids.map((id) => {
      const rect = nodes.current.get(id)?.getBoundingClientRect();
      if (!rect) return { left: 0, top: 0, right: 0, bottom: 0 };
      return {
        left: rect.left + window.scrollX,
        top: rect.top + window.scrollY,
        right: rect.right + window.scrollX,
        bottom: rect.bottom + window.scrollY,
      };
    });
    s.active = true;
    document.documentElement.style.cursor = "grabbing";
    if (s.touch) navigator.vibrate?.(10);
    setDrag({ id: s.id, from: s.from, to: s.from, slots: s.slots });
    s.frame = window.requestAnimationFrame(tick);
  }, [tick]);

  // Пальцем страница прокручивается сама; как только карточка «поднята»,
  // прокрутку надо гасить. Слушатель висит постоянно и не пассивный — иначе
  // браузер решит, что отменять тут нечего, ещё на touchstart.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onTouchMove = (event: TouchEvent) => {
      if (session.current?.active) event.preventDefault();
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);

  useEffect(() => () => finish(false), [finish]);

  function handlePointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
    id: string,
    index: number,
  ) {
    if (session.current) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if ((event.target as Element).closest(INTERACTIVE)) return;

    const touch = event.pointerType === "touch";
    const pointerId = event.pointerId;

    const onMove = (e: PointerEvent) => {
      const s = session.current;
      if (!s || e.pointerId !== pointerId) return;
      s.client = { x: e.clientX, y: e.clientY };
      if (s.active) {
        e.preventDefault();
        return;
      }
      const dx = e.clientX + window.scrollX - s.start.x;
      const dy = e.clientY + window.scrollY - s.start.y;
      const distance = Math.hypot(dx, dy);
      if (touch) {
        // Палец поехал раньше, чем истекло удержание, — это прокрутка.
        if (distance > TOUCH_TOLERANCE) finish(false);
      } else if (distance > MOUSE_THRESHOLD) {
        activate();
      }
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId === pointerId) finish(true);
    };
    const onCancel = (e: PointerEvent) => {
      if (e.pointerId === pointerId) finish(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(false);
    };
    const onContextMenu = (e: Event) => {
      if (session.current) e.preventDefault();
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    window.addEventListener("contextmenu", onContextMenu);

    session.current = {
      pointerId,
      touch,
      id,
      ids: items.map((item) => item.id),
      from: index,
      to: index,
      start: {
        x: event.clientX + window.scrollX,
        y: event.clientY + window.scrollY,
      },
      client: { x: event.clientX, y: event.clientY },
      slots: [],
      active: false,
      timer: touch ? window.setTimeout(activate, TOUCH_DELAY) : null,
      frame: null,
      detach: () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("contextmenu", onContextMenu);
      },
    };
  }

  return (
    <div ref={containerRef} className={className}>
      {items.map((item, index) => {
        const dragged = drag?.id === item.id;
        let shift: string | undefined;
        if (drag && !dragged) {
          // Куда встанет эта карточка, если отпустить прямо сейчас.
          let target = index;
          if (drag.from < drag.to && index > drag.from && index <= drag.to) {
            target = index - 1;
          } else if (drag.to < drag.from && index >= drag.to && index < drag.from) {
            target = index + 1;
          }
          const own = drag.slots[index];
          const next = drag.slots[target];
          if (own && next && target !== index) {
            shift = `${next.left - own.left}px ${next.top - own.top}px`;
          }
        }
        return (
          <div
            key={item.id}
            ref={(node) => {
              if (node) nodes.current.set(item.id, node);
              else nodes.current.delete(item.id);
            }}
            onPointerDown={(event) => handlePointerDown(event, item.id, index)}
            // Перевод задаём свойством `translate`, а не `transform`: у карточки
            // есть анимация появления с fill-mode both, и она перебила бы transform.
            style={shift ? { translate: shift } : undefined}
            className={cn(
              "cursor-grab select-none [-webkit-touch-callout:none]",
              drag && "pointer-events-none",
              drag &&
                !dragged &&
                "transition-[translate] duration-200 ease-out motion-reduce:transition-none",
              dragged &&
                "relative z-30 scale-[1.03] rounded-xl shadow-2xl shadow-black/30 transition-[scale] duration-150 motion-reduce:transition-none",
            )}
          >
            {children(item, index)}
          </div>
        );
      })}
    </div>
  );
}
