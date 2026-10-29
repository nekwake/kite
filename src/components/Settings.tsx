import { ReactNode, useEffect, useRef, useState } from "react";
import { Icon } from "../lib/icons";
import { ClaudeAccount, GithubAccount } from "../lib/api";
import { ACCENT_PRESETS, applyAccent, currentAccent } from "../lib/theme";
import { DEFAULT_SETTINGS, updateSettings, useSettings } from "../lib/settings";
import { KiteMark } from "./KiteLogo";
import { t } from "../lib/i18n";
import { invoke } from "@tauri-apps/api/core";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";

async function testNotification() {
  let ok = await isPermissionGranted();
  if (!ok) ok = (await requestPermission()) === "granted";
  if (ok) sendNotification({ title: "Kite", body: t("Bildirimler çalışıyor 🪁") });
}

function setLanguage(language: "tr" | "en") {
  updateSettings({ language });
  // The native menu bar is rebuilt in the new language
  invoke("set_menu_language", { language }).catch(() => {});
}

type Props = {
  onClose: () => void;
  github: GithubAccount | null;
  claude: ClaudeAccount | null;
  onConnectGithub: () => void;
  onConnectClaude: () => void;
  onRefreshAccounts: () => void;
};

type SectionId = "appearance" | "editor" | "terminal" | "notifications" | "accounts" | "shortcuts" | "about";

const SECTIONS: { id: SectionId; label: string; icon: string }[] = [
  { id: "appearance", label: "Görünüm", icon: "◐" },
  { id: "editor", label: "Editör", icon: "✎" },
  { id: "terminal", label: "Terminal", icon: "›_" },
  { id: "notifications", label: "Bildirimler", icon: "◔" },
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
    q && !`${label} ${hint ?? ""} ${t(label)} ${t(hint ?? "")}`.toLocaleLowerCase("tr").includes(q) ? null : (
      <div className="set-row">
        <div className="set-label">
          <span>{t(label)}</span>
          {hint && <small>{t(hint)}</small>}
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
      <Row label={t("Dil")} hint="Arayüz ve menü dili">
        <div className="segmented small two">
          <button className={s.language === "tr" ? "on" : ""} onClick={() => setLanguage("tr")}>{t("Türkçe")}</button>
          <button className={s.language === "en" ? "on" : ""} onClick={() => setLanguage("en")}>{t("English")}</button>
        </div>
      </Row>
      <Row label={t("Alt panel tam genişlikte")} hint="Sağ panel açıkken terminal paneli tüm genişliğe yayılsın; kapalıysa sadece sol tarafta durur">
        <Toggle value={s.panelFullWidth} onChange={(v) => updateSettings({ panelFullWidth: v })} />
      </Row>
      <Row label={t("Vurgu rengi")} hint="Düğmeler, aktif sekme, imleç ve seçimler">
        <div className="swatches">
          {ACCENT_PRESETS.map((p) => (
            <button key={p.id} className={`swatch ${accent.toLowerCase() === p.color ? "on" : ""}`} onClick={() => pick(p.color)} title={p.name}>
              <span className="swatch-dot" style={{ background: p.color }} />
              <span>{p.name}</span>
            </button>
          ))}
          <label className="swatch" title={t("Özel renk")}>
            <input type="color" value={accent} onChange={(e) => pick(e.target.value)} />
            <span>{t("Özel")}</span>
          </label>
        </div>
      </Row>
      {!q && (
        <div className="settings-preview">
          <KiteMark size={34} />
          <button className="primary-btn">{t("Örnek düğme")}</button>
          <span className="settings-preview-tab">{t("aktif sekme")}</span>
          <kbd>{t("⌘P")}</kbd>
        </div>
      )}
    </>
  );

  const editor = (
    <>
      <Row label={t("Yazı boyutu")} hint="⌘+ / ⌘- ile de değişir">
        <Stepper value={s.editorFontSize} min={9} max={28} onChange={(v) => updateSettings({ editorFontSize: v })} />
      </Row>
      <Row label={t("Sekme genişliği")} hint="Tab tuşunun eklediği boşluk sayısı">
        <div className="segmented small">
          {[2, 4, 8].map((n) => (
            <button key={n} className={s.tabSize === n ? "on" : ""} onClick={() => updateSettings({ tabSize: n })}>{n}</button>
          ))}
        </div>
      </Row>
      <Row label={t("Satır kaydırma")} hint="Uzun satırlar pencereye sığacak şekilde kaydırılır">
        <Toggle value={s.wordWrap} onChange={(v) => updateSettings({ wordWrap: v })} />
      </Row>
      <Row label={t("Mini harita")} hint="Editörün sağında dosyanın küçük önizlemesi">
        <Toggle value={s.minimap} onChange={(v) => updateSettings({ minimap: v })} />
      </Row>
      <Row label={t("Otomatik kaydet")} hint="Yazmayı bıraktıktan 1 saniye sonra kaydeder">
        <Toggle value={s.autoSave} onChange={(v) => updateSettings({ autoSave: v })} />
      </Row>
    </>
  );

  const terminal = (
    <>
      <Row label={t("Yazı boyutu")} hint="Alt panel ve Claude sekmeleri">
        <Stepper value={s.terminalFontSize} min={9} max={28} onChange={(v) => updateSettings({ terminalFontSize: v })} />
      </Row>
      <Row label={t("Kabuk")} hint="Kite, $SHELL ile tanımlı kabuğu oturum açma kabuğu olarak başlatır">
        <code className="set-code">{t("$SHELL -l")}</code>
      </Row>
    </>
  );

  const notifications = (
    <>
      <Row label={t("Terminal bildirimleri")} hint="Claude işini bitirince ya da bir komut zil (bell) çalınca macOS bildirimi gönder">
        <Toggle value={s.notifyTerminal} onChange={(v) => updateSettings({ notifyTerminal: v })} />
      </Row>
      <Row label={t("Sadece Kite arka plandayken")} hint="Kite öndeyken bildirim gösterme">
        <Toggle value={s.notifyOnlyUnfocused} onChange={(v) => updateSettings({ notifyOnlyUnfocused: v })} />
      </Row>
      <Row label={t("Claude Code ayarı")} hint="Claude'un bitince bildirim göndermesi için bir kez çalıştır">
        <code className="set-code">{t("claude config set --global preferredNotifChannel iterm2_with_bell")}</code>
      </Row>
      <Row label={t("Deneme")} hint="İzin ister ve örnek bir bildirim gönderir">
        <button className="secondary-btn" onClick={testNotification}>{t("Test bildirimi gönder")}</button>
      </Row>
    </>
  );

  const gh = props.github;
  const cl = props.claude;
  const accountsSection = (
    <>
      <Row label={t("GitHub")} hint="GitHub CLI (gh) ile; push, pull ve depo yayınlama bunu kullanır">
        {!gh ? (
          <span className="muted">{t("Kontrol ediliyor…")}</span>
        ) : !gh.installed ? (
          <span className="muted">{t("gh kurulu değil —")} <code>{t("brew install gh")}</code></span>
        ) : gh.login ? (
          <div className="account">
            {gh.avatarUrl && <img src={gh.avatarUrl} alt="" />}
            <div>
              <b>{gh.name ?? gh.login}</b>
              <small>@{gh.login} · bağlı</small>
            </div>
          </div>
        ) : (
          <button className="primary-btn" onClick={props.onConnectGithub}>{t("GitHub'ı bağla")}</button>
        )}
      </Row>
      <Row label={t("Claude")} hint="Claude Code hesabın; oturumlar ve ✦ sekmeleri bunu kullanır">
        {!cl ? (
          <span className="muted">{t("Kontrol ediliyor…")}</span>
        ) : !cl.installed ? (
          <span className="muted">{t("Claude Code kurulu değil")}</span>
        ) : cl.email ? (
          <div className="account">
            <span className="account-mark">✦</span>
            <div>
              <b>{cl.name ?? cl.email}</b>
              <small>{cl.email}{cl.plan ? ` · ${planName(cl.plan)}` : ""} · v{cl.version}</small>
            </div>
          </div>
        ) : (
          <button className="primary-btn" onClick={props.onConnectClaude}>{t("Claude'a giriş yap")}</button>
        )}
      </Row>
      {!q && (
        <div className="set-note">
          {t("Kite hiçbir şifre ya da token saklamaz. Girişler resmi araçların (gh, claude) kendi ekranlarında yapılır.")}
          <button className="link-btn" onClick={props.onRefreshAccounts}>{t("Yenile")}</button>
        </div>
      )}
    </>
  );

  const shortcuts = (
    <div className="set-shortcuts">
      {SHORTCUTS.filter(([l]) => !q || l.toLocaleLowerCase("tr").includes(q)).map(([label, keys]) => (
        <div key={label} className="set-shortcut">
          <span>{t(label)}</span>
          <kbd>{keys}</kbd>
        </div>
      ))}
    </div>
  );

  const about = (
    <div className="set-about">
      <KiteMark size={56} />
      <div>
        <b>{t("Kite")}</b>
        <small>{t("Hafif, hızlı, Claude ile entegre kod editörü")}</small>
        <button className="link-btn" onClick={() => updateSettings(DEFAULT_SETTINGS)}>{t("Editör ayarlarını sıfırla")}</button>
      </div>
    </div>
  );

  const content: Record<SectionId, ReactNode> = {
    appearance, editor, terminal, notifications, accounts: accountsSection, shortcuts, about,
  };

  return (
    <div className="overlay settings-overlay" onMouseDown={props.onClose}>
      <div className="settings-modal" ref={boxRef} onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings-top">
          <span className="settings-title">{t("⚙ Ayarlar")}</span>
          <input
            autoFocus
            className="search-input settings-search"
            placeholder={t("Ayarlarda ara")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
          />
          <button className="icon-btn" onClick={props.onClose} title={t("Kapat (Esc)")}><Icon name="close" /></button>
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
                {t(sec.label)}
              </button>
            ))}
          </nav>
          <div className="settings-content">
            {q ? (
              SECTIONS.filter((sec) => sec.id !== "about").map((sec) => (
                <div key={sec.id} className="settings-group">
                  <h3>{t(sec.label)}</h3>
                  {content[sec.id]}
                </div>
              ))
            ) : (
              <div className="settings-group">
                <h2>{t(SECTIONS.find((x) => x.id === section)!.label)}</h2>
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
