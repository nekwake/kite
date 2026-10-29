import { ReactNode, useEffect, useRef, useState } from "react";
import { ClaudeAccount, GithubAccount } from "../lib/api";
import { ACCENT_PRESETS, applyAccent, currentAccent } from "../lib/theme";
import { DEFAULT_SETTINGS, updateSettings, useSettings } from "../lib/settings";
import { KiteMark } from "./KiteLogo";

type Props = {
  onClose: () => void;
  github: GithubAccount | null;
  claude: ClaudeAccount | null;
  onConnectGithub: () => void;
  onConnectClaude: () => void;
  onRefreshAccounts: () => void;
};

type SectionId = "appearance" | "editor" | "terminal" | "accounts" | "shortcuts" | "about";

const SECTIONS: { id: SectionId; label: string; icon: string }[] = [
  { id: "appearance", label: "Görünüm", icon: "◐" },
  { id: "editor", label: "Editör", icon: "✎" },
  { id: "terminal", label: "Terminal", icon: "›_" },
  { id: "accounts", label: "Hesaplar", icon: "◉" },
  { id: "shortcuts", label: "Kısayollar", icon: "⌘" },
  { id: "about", label: "Hakkında", icon: "ⓘ" },
];

const SHORTCUTS: [string, string][] = [
  ["Dosyaya git", "⌘P"], ["Komut paleti", "⌘⇧P"], ["Satıra git", "⌘G"], ["Yeni dosya", "⌘N"],
  ["Kaydet", "⌘S"], ["Farklı kaydet", "⌘⇧S"], ["Sekmeyi kapat", "⌘W"], ["Klasör aç", "⌘O"],
  ["Yeni pencere", "⌘⇧N"], ["Gezgin", "⌘⇧E"], ["Projede ara", "⌘⇧F"], ["Kaynak kontrolü", "⌘⇧G"],
  ["Claude oturumları", "⌘⇧C"], ["Yeni Claude oturumu", "⌘L"], ["Kenar çubuğu", "⌘B"],
  ["Terminal aç/kapat", "⌘J"], ["Yeni terminal", "⌘T"], ["Yakınlaştır / uzaklaştır", "⌘+ / ⌘-"],
  ["Gerçek boyut", "⌘0"], ["Ayarlar", "⌘,"],
];

export function Settings(props: Props) {
  const [section, setSection] = useState<SectionId>("appearance");
  const [query, setQuery] = useState("");
  const [accent, setAccent] = useState(currentAccent());
  const s = useSettings();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  const pick = (color: string) => {
    setAccent(color);
    applyAccent(color);
  };

  const q = query.trim().toLocaleLowerCase("tr");
  /** While searching, every section shows the rows that match */
  const Row = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) =>
    q && !`${label} ${hint ?? ""}`.toLocaleLowerCase("tr").includes(q) ? null : (
      <div className="set-row">
        <div className="set-label">
          <span>{label}</span>
          {hint && <small>{hint}</small>}
        </div>
        <div className="set-control">{children}</div>
      </div>
    );

  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <button className={`switch ${value ? "on" : ""}`} onClick={() => onChange(!value)} role="switch" aria-checked={value}>
      <span />
    </button>
  );

  const Stepper = ({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) => (
    <div className="stepper">
      <button onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <span>{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );

  const appearance = (
    <>
      <Row label="Vurgu rengi" hint="Düğmeler, aktif sekme, imleç ve seçimler">
        <div className="swatches">
          {ACCENT_PRESETS.map((p) => (
            <button key={p.id} className={`swatch ${accent.toLowerCase() === p.color ? "on" : ""}`} onClick={() => pick(p.color)} title={p.name}>
              <span className="swatch-dot" style={{ background: p.color }} />
              <span>{p.name}</span>
            </button>
          ))}
          <label className="swatch" title="Özel renk">
            <input type="color" value={accent} onChange={(e) => pick(e.target.value)} />
            <span>Özel</span>
          </label>
        </div>
      </Row>
      {!q && (
        <div className="settings-preview">
          <KiteMark size={34} />
          <button className="primary-btn">Örnek düğme</button>
          <span className="settings-preview-tab">aktif sekme</span>
          <kbd>⌘P</kbd>
        </div>
      )}
    </>
  );

  const editor = (
    <>
      <Row label="Yazı boyutu" hint="⌘+ / ⌘- ile de değişir">
        <Stepper value={s.editorFontSize} min={9} max={28} onChange={(v) => updateSettings({ editorFontSize: v })} />
      </Row>
      <Row label="Sekme genişliği" hint="Tab tuşunun eklediği boşluk sayısı">
        <div className="segmented small">
          {[2, 4, 8].map((n) => (
            <button key={n} className={s.tabSize === n ? "on" : ""} onClick={() => updateSettings({ tabSize: n })}>{n}</button>
          ))}
        </div>
      </Row>
      <Row label="Satır kaydırma" hint="Uzun satırlar pencereye sığacak şekilde kaydırılır">
        <Toggle value={s.wordWrap} onChange={(v) => updateSettings({ wordWrap: v })} />
      </Row>
      <Row label="Mini harita" hint="Editörün sağında dosyanın küçük önizlemesi">
        <Toggle value={s.minimap} onChange={(v) => updateSettings({ minimap: v })} />
      </Row>
      <Row label="Otomatik kaydet" hint="Yazmayı bıraktıktan 1 saniye sonra kaydeder">
        <Toggle value={s.autoSave} onChange={(v) => updateSettings({ autoSave: v })} />
      </Row>
    </>
  );

  const terminal = (
    <>
      <Row label="Yazı boyutu" hint="Alt panel ve Claude sekmeleri">
        <Stepper value={s.terminalFontSize} min={9} max={28} onChange={(v) => updateSettings({ terminalFontSize: v })} />
      </Row>
      <Row label="Kabuk" hint="Kite, $SHELL ile tanımlı kabuğu oturum açma kabuğu olarak başlatır">
        <code className="set-code">$SHELL -l</code>
      </Row>
    </>
  );

  const gh = props.github;
  const cl = props.claude;
  const accountsSection = (
    <>
      <Row label="GitHub" hint="GitHub CLI (gh) ile; push, pull ve depo yayınlama bunu kullanır">
        {!gh ? (
          <span className="muted">Kontrol ediliyor…</span>
        ) : !gh.installed ? (
          <span className="muted">gh kurulu değil — <code>brew install gh</code></span>
        ) : gh.login ? (
          <div className="account">
            {gh.avatarUrl && <img src={gh.avatarUrl} alt="" />}
            <div>
              <b>{gh.name ?? gh.login}</b>
              <small>@{gh.login} · bağlı</small>
            </div>
          </div>
        ) : (
          <button className="primary-btn" onClick={props.onConnectGithub}>GitHub'ı bağla</button>
        )}
      </Row>
      <Row label="Claude" hint="Claude Code hesabın; oturumlar ve ✦ sekmeleri bunu kullanır">
        {!cl ? (
          <span className="muted">Kontrol ediliyor…</span>
        ) : !cl.installed ? (
          <span className="muted">Claude Code kurulu değil</span>
        ) : cl.email ? (
          <div className="account">
            <span className="account-mark">✦</span>
            <div>
              <b>{cl.name ?? cl.email}</b>
              <small>{cl.email}{cl.plan ? ` · ${planName(cl.plan)}` : ""} · v{cl.version}</small>
            </div>
          </div>
        ) : (
          <button className="primary-btn" onClick={props.onConnectClaude}>Claude'a giriş yap</button>
        )}
      </Row>
      {!q && (
        <div className="set-note">
          Kite hiçbir şifre ya da token saklamaz. Girişler resmi araçların (gh, claude) kendi ekranlarında yapılır.
          <button className="link-btn" onClick={props.onRefreshAccounts}>Yenile</button>
        </div>
      )}
    </>
  );

  const shortcuts = (
    <div className="set-shortcuts">
      {SHORTCUTS.filter(([l]) => !q || l.toLocaleLowerCase("tr").includes(q)).map(([label, keys]) => (
        <div key={label} className="set-shortcut">
          <span>{label}</span>
          <kbd>{keys}</kbd>
        </div>
      ))}
    </div>
  );

  const about = (
    <div className="set-about">
      <KiteMark size={56} />
      <div>
        <b>Kite</b>
        <small>Hafif, hızlı, Claude ile entegre kod editörü</small>
        <button className="link-btn" onClick={() => updateSettings(DEFAULT_SETTINGS)}>Editör ayarlarını sıfırla</button>
      </div>
    </div>
  );

  const content: Record<SectionId, ReactNode> = {
    appearance, editor, terminal, accounts: accountsSection, shortcuts, about,
  };

  return (
    <div className="overlay settings-overlay" onMouseDown={props.onClose}>
      <div className="settings-modal" ref={boxRef} onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings-top">
          <span className="settings-title">⚙ Ayarlar</span>
          <input
            autoFocus
            className="search-input settings-search"
            placeholder="Ayarlarda ara"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
          />
          <button className="icon-btn" onClick={props.onClose} title="Kapat (Esc)">×</button>
        </div>
        <div className="settings-body">
          <nav className="settings-nav">
            {SECTIONS.map((sec) => (
              <button
                key={sec.id}
                className={!q && section === sec.id ? "on" : ""}
                onClick={() => {
                  setQuery("");
                  setSection(sec.id);
                }}
              >
                <span className="nav-icon">{sec.icon}</span>
                {sec.label}
              </button>
            ))}
          </nav>
          <div className="settings-content">
            {q ? (
              SECTIONS.filter((sec) => sec.id !== "about").map((sec) => (
                <div key={sec.id} className="settings-group">
                  <h3>{sec.label}</h3>
                  {content[sec.id]}
                </div>
              ))
            ) : (
              <div className="settings-group">
                <h2>{SECTIONS.find((x) => x.id === section)!.label}</h2>
                {content[section]}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function planName(p: string) {
  return ({ claude_max: "Max", claude_pro: "Pro", claude_team: "Team", claude_enterprise: "Enterprise" } as Record<string, string>)[p] ?? p;
}
