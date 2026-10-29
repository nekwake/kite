import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { getSettings } from "./settings";
import { inTauri } from "./events";

let lastAt = 0;

/** Desktop notification from a terminal, honoring the notification settings */
export async function notifyFromTerminal(title: string, body: string) {
  const s = getSettings();
  if (!inTauri || !s.notifyTerminal) return;
  if (s.notifyOnlyUnfocused && document.hasFocus()) return;
  // A burst of bells or messages becomes one notification
  const now = Date.now();
  if (now - lastAt < 3000) return;
  lastAt = now;
  let granted = await isPermissionGranted();
  if (!granted) granted = (await requestPermission()) === "granted";
  if (granted) sendNotification({ title, body });
}
