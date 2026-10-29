<p align="center">
  <img src="assets/app-icon.svg" width="112" alt="Kite" />
</p>

<h1 align="center">Kite</h1>

<p align="center">
  macOS için hafif kod editörü ve terminal, Claude Code oturumlarınla yan yana.<br/>
  ~9 MB · Tauri + Rust · Monaco · xterm.js
</p>

<p align="center">
  <a href="https://github.com/nekwake/kite-releases/releases/latest"><b>⬇ macOS için indir (.dmg)</b></a>
  ·
  <a href="https://github.com/nekwake/kite-releases/releases">Tüm sürümler</a>
</p>

---

## Neler var

- **Claude Code oturumları**: proje bazlı oturum listesi, tek tıkla `claude --resume`, Claude'u sağ panele sürükleme, dosyaları sürükleyip `@dosya` olarak ekleme
- **Editör**: Monaco (VS Code'un editörü), önizleme sekmeleri, iki editör grubu, ⌘P / ⌘⇧P, satır kenarında git işaretleri, Sorunlar paneli
- **Terminal**: gerçek zsh, bölme, sağda terminal listesi, Claude bitince bildirim
- **Git**: değişiklikler, diff, commit, branch, geçmiş grafiği, pull/push, tek tıkla GitHub'a yayınlama
- **Diğer**: ripgrep araması, dosya işlemleri, renk temaları, Türkçe/English, otomatik güncelleme

## Kurulum

1. [Son sürümden](https://github.com/nekwake/kite-releases/releases/latest) `.dmg` dosyasını indir, Kite'ı **Uygulamalar** klasörüne sürükle.
2. Kite henüz Apple tarafından imzalı değil. İlk açılışta macOS uyarı verirse:
   ```bash
   xattr -dr com.apple.quarantine /Applications/Kite.app
   ```
3. Terminalden klasör açmak için `kite` komutu (isteğe bağlı):
   ```bash
   curl -fsSL https://raw.githubusercontent.com/nekwake/kite/main/scripts/kite -o ~/.local/bin/kite && chmod +x ~/.local/bin/kite
   ```
   Sonra herhangi bir klasörde: `kite .`

Yeni sürüm çıktığında Kite sağ üstte **Güncelle** düğmesi gösterir; tek tıkla indirip yeniden başlar.

## Geliştirme

```bash
npm install
npm run tauri dev        # geliştirme modu
npm run install-app      # derleyip /Applications'a kurar + kite komutu
```

### Sürüm çıkarma

```bash
npm run release -- 0.2.0     # sürümü yükseltir, commit + v0.2.0 etiketi
git push && git push origin v0.2.0
```

Etiket gidince GitHub Actions ([release.yml](.github/workflows/release.yml)) universal `.dmg`'yi ve imzalı güncelleme paketini derleyip herkese açık [kite-releases](https://github.com/nekwake/kite-releases) deposuna koyar. Kaynak kod gizli kalabilir. Kurulu Kite'lar `latest.json` üzerinden yeni sürümü görür.

Gerekli secret'lar (bu depoda, Settings › Secrets › Actions):

| Secret | Değer |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | `~/.tauri/kite.key` dosyasının içeriği |
| `RELEASES_TOKEN` | kite-releases için "Contents: read and write" yetkili fine-grained token |
