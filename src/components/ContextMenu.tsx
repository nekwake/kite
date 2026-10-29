import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { t } from "../lib/i18n";

export type MenuItem =
  | { label: string; shortcut?: string; danger?: boolean; disabled?: boolean; onClick: () => void }
  | "separator";

export type MenuState = { x: number; y: number; items: MenuItem[] } | null;

export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  // Keep the menu inside the window
  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({
      x: Math.min(menu.x, window.innerWidth - r.width - 6),
      y: Math.min(menu.y, window.innerHeight - r.height - 6),
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.type === "mousedown" && ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener("mousedown", close, true);
    window.addEventListener("keydown", close, true);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("mousedown", close, true);
      window.removeEventListener("keydown", close, true);
      window.removeEventListener("blur", close);
    };
  }, [menu, onClose]);

  if (!menu) return null;
  return (
    <div ref={ref} className="context-menu" style={{ left: pos.x, top: pos.y }}>
      {menu.items.map((item, i) =>
        item === "separator" ? (
          <div key={i} className="context-sep" />
        ) : (
          <button
            key={i}
            className={`context-item ${item.danger ? "danger" : ""}`}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onClick();
            }}
          >
            <span>{t(item.label)}</span>
            {item.shortcut && <kbd>{item.shortcut}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}
