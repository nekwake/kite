import { useEffect, useState } from "react";
import { basename, dirname } from "../lib/api";
import { KiteLoader } from "./KiteLogo";
import { t } from "../lib/i18n";

type Fact = { text: string; source: string } | "offline" | null;

/** A random useless fact; the endpoint only speaks English and German */
function useFact(): Fact {
  const [fact, setFact] = useState<Fact>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    fetch("https://uselessfacts.jsph.pl/api/v2/facts/random?language=en", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => setFact({ text: j.text, source: j.source }))
      .catch(() => setFact("offline"))
      .finally(() => clearTimeout(timer));
    return () => ctrl.abort();
  }, []);
  return fact;
}

export function Welcome({ recent, onOpenFolder, onOpenRecent }: {
  recent: string[];
  onOpenFolder: () => void;
  onOpenRecent: (dir: string) => void;
}) {
  const fact = useFact();
  return (
    <div className="welcome">
      <div className="welcome-kite">
        <KiteLoader size={96} />
      </div>
      <span className="wordmark">Kite</span>
      <button className="primary-btn" onClick={onOpenFolder}>{t("Klasör aç")} (⌘O)</button>
      {recent.length > 0 && (
        <div className="recent-projects">
          <div className="recent-title">{t("SON PROJELER")}</div>
          {recent.map((p) => (
            <button key={p} className="recent-project" onClick={() => onOpenRecent(p)}>
              <span>{basename(p)}</span>
              <span className="recent-path">{dirname(p).replace(/^\/Users\/[^/]+/, "~")}</span>
            </button>
          ))}
        </div>
      )}
      <div className="fact">
        {fact === null ? null : fact === "offline" ? (
          <span className="fact-offline"><span className="dot off" /> {t("Çevrimdışı — internet bağlantısı yok gibi görünüyor")}</span>
        ) : (
          <>
            <span className="fact-label"><span className="dot on" /> {t("Gereksiz bilgi")}</span>
            <p>{fact.text}</p>
          </>
        )}
      </div>
    </div>
  );
}
