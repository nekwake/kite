# Kite

Hafif, hızlı, Claude ile entegre kod editörü. Tauri 2 (Rust) + React + Monaco + xterm.js.

## Kurulum

```bash
npm install
npm run install-app
```

Kite.app'i `/Applications` içine kurar ve `kite` komutunu ekler. Sonra herhangi bir klasörde `kite .`

## Geliştirme

```bash
npm install
npm run tauri dev
```

## Yol haritası

1. ✅ İskelet: dosya ağacı, Monaco editör, terminal paneli
2. Arama: ⌘P hızlı açma, projede metin arama (ripgrep)
3. Git: değişiklikler, diff, stage/commit, branch, geçmiş
4. Claude paneli: Claude Code `stream-json`, tool call kartları, MCP listesi, diff onayı
5. OpenRouter: model seçici, chat, okuma tool'ları
