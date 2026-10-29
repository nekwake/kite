// Pointer-based drag of files/folders onto drop targets (terminals). Avoids
// HTML5 drag-and-drop, which the WebView reserves for OS file drops.

export const DROP_EVENT = "kite-drop";

/** Elements with this attribute receive a `kite-drop` CustomEvent<string[]> */
export const DROP_ATTR = "data-drop-paths";

const THRESHOLD = 5;

export function startPathDrag(e: React.PointerEvent, paths: string[], label: string) {
  if (e.button !== 0) return;
  const startX = e.clientX;
  const startY = e.clientY;
  let ghost: HTMLDivElement | null = null;
  let target: Element | null = null;

  const targetAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest(`[${DROP_ATTR}]`) ?? null;

  const move = (ev: PointerEvent) => {
    if (!ghost) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < THRESHOLD) return;
      ghost = document.createElement("div");
      ghost.className = "drag-ghost";
      ghost.textContent = label;
      document.body.appendChild(ghost);
      document.body.classList.add("dragging-paths");
    }
    ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 8}px)`;
    const t = targetAt(ev.clientX, ev.clientY);
    if (t !== target) {
      target?.classList.remove("drop-hover");
      t?.classList.add("drop-hover");
      target = t;
    }
  };

  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    if (!ghost) return;
    ghost.remove();
    document.body.classList.remove("dragging-paths");
    target?.classList.remove("drop-hover");
    target?.dispatchEvent(new CustomEvent(DROP_EVENT, { detail: paths }));
    // Swallow the click that follows the drag so the row isn't opened
    window.addEventListener("click", (c) => c.stopPropagation(), { capture: true, once: true });
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

/** Delivers an OS (Finder) drop at window coordinates to the target under it */
export function dropAt(x: number, y: number, paths: string[]) {
  document.elementFromPoint(x, y)?.closest(`[${DROP_ATTR}]`)?.dispatchEvent(new CustomEvent(DROP_EVENT, { detail: paths }));
}
