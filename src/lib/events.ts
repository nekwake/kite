import { listen, EventCallback, UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

export const inTauri = "__TAURI_INTERNALS__" in window;

/** Listens to events sent to this window only, so other Kite windows don't react */
export function listenHere<T>(event: string, cb: EventCallback<T>): Promise<UnlistenFn> {
  return inTauri ? getCurrentWebviewWindow().listen<T>(event, cb) : listen<T>(event, cb);
}
