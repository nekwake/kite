import { useState } from "react";
import { ACCENT_PRESETS, applyAccent, currentAccent } from "../lib/theme";
import { KiteMark } from "./KiteLogo";

export function Settings({ onClose }: { onClose: () => void }) {
  const [accent, setAccent] = useState(currentAccent());

  const pick = (color: string) => {
    setAccent(color);
    applyAccent(color);
  };

  return (
    <div className="overlay" onMouseDown={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="settings" onMouseDown={(e) => e.stopPropagation()} tabIndex={-1} autoFocus>
        <div className="settings-head">
          <span>Ayarlar</span>
          <button className="icon-btn" onClick={onClose} title="Kapat (Esc)">×</button>
        </div>

        <div className="settings-section">
          <div className="settings-label">Vurgu rengi</div>
          <div className="settings-hint">Düğmeler, aktif sekme, imleç ve seçimlerde kullanılır.</div>
          <div className="swatches">
            {ACCENT_PRESETS.map((p) => (
              <button
                key={p.id}
                className={`swatch ${accent.toLowerCase() === p.color ? "on" : ""}`}
                onClick={() => pick(p.color)}
                title={p.name}
              >
                <span className="swatch-dot" style={{ background: p.color }} />
                <span>{p.name}</span>
              </button>
            ))}
            <label className="swatch" title="Özel renk">
              <input type="color" value={accent} onChange={(e) => pick(e.target.value)} />
              <span>Özel</span>
            </label>
          </div>

          <div className="settings-preview">
            <KiteMark size={34} />
            <button className="primary-btn">Örnek düğme</button>
            <span className="settings-preview-tab">aktif sekme</span>
            <kbd>⌘P</kbd>
          </div>
        </div>
      </div>
    </div>
  );
}
