// Pointer-based drag of files/folders onto drop targets (terminals). Avoids
// HTML5 drag-and-drop, which the WebView reserves for OS file drops.

export const DROP_EVENT = "kite-drop";

/** Elements with this attribute receive a `kite-drop` CustomEvent<string[]> */
export const DROP_ATTR = "data-drop-paths";

const THRESHOLD = 5;

/** Starts a pointer drag that drops onto the nearest element matching `selector` */
export function startDrag(
  e: React.PointerEvent,
  label: string,
  selector: string,
  onDrop: (target: Element, ev: PointerEvent) => void,
  bodyClass = "dragging-paths",
) {
  if (e.button !== 0) return;
  const startX = e.clientX;
  const startY = e.clientY;
  let ghost: HTMLDivElement | null = null;
  let target: Element | null = null;

  const targetAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest(selector) ?? null;

  const move = (ev: PointerEvent) => {
    if (!ghost) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < THRESHOLD) return;
      ghost = document.createElement("div");
      ghost.className = "drag-ghost";
      ghost.textContent = label;
      document.body.appendChild(ghost);
      document.body.classList.add(bodyClass);
    }
    ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 8}px)`;
    const t = targetAt(ev.clientX, ev.clientY);
    if (t !== target) {
      target?.classList.remove("drop-hover");
      t?.classList.add("drop-hover");
      target = t;
    }
  };

  const up = (ev: PointerEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    if (!ghost) return;
    ghost.remove();
    document.body.classList.remove(bodyClass);
    target?.classList.remove("drop-hover");
    if (target) onDrop(target, ev);
    // Swallow the click that follows the drag so the row isn't opened
    window.addEventListener("click", (c) => c.stopPropagation(), { capture: true, once: true });
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

export function startPathDrag(e: React.PointerEvent, paths: string[], label: string) {
  startDrag(e, label, `[${DROP_ATTR}]`, (t) => t.dispatchEvent(new CustomEvent(DROP_EVENT, { detail: paths })));
}

/** Delivers an OS (Finder) drop at window coordinates to the target under it */
export function dropAt(x: number, y: number, paths: string[]) {
  document.elementFromPoint(x, y)?.closest(`[${DROP_ATTR}]`)?.dispatchEvent(new CustomEvent(DROP_EVENT, { detail: paths }));
}
