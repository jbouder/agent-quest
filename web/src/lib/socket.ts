import type { ClientCommand, ServerEvent } from "@/lib/protocol";
import {
  agentsAtom,
  appendJournalAtom,
  connectedAtom,
  defaultCwdAtom,
  demoModeAtom,
  districtsAtom,
  gameStore,
  lastSteerAtom,
  playerAtom,
  recentCommitsAtom,
  savedSessionsAtom,
  sideQuestsAtom,
  toastsAtom,
} from "@/store/gameAtoms";

let socket: WebSocket | null = null;
let toastSeq = 0;

export function sendCommand(command: ClientCommand): void {
  if (socket?.readyState === WebSocket.OPEN) {
    if (command.type === "steer") {
      gameStore.set(lastSteerAtom, command.text); // §15 rubber duck
    }
    socket.send(JSON.stringify(command));
  } else {
    pushToast("error", "Not connected to the control server.");
  }
}

/** Client-side toast, for in-world flavor that never touches the server. */
export function localToast(
  level: "info" | "warn" | "error",
  text: string,
): void {
  pushToast(level, text);
}

function pushToast(level: "info" | "warn" | "error", text: string): void {
  toastSeq += 1;
  const id = toastSeq;
  gameStore.set(toastsAtom, [
    ...gameStore.get(toastsAtom),
    { id, level, text },
  ]);
  setTimeout(() => {
    gameStore.set(
      toastsAtom,
      gameStore.get(toastsAtom).filter((t) => t.id !== id),
    );
  }, 5000);
}

/**
 * Store writes notify subscribers synchronously — a subscriber that throws
 * would otherwise abort the remaining writes for this event. Isolate each
 * write so one bad listener can't corrupt half the snapshot.
 */
function safeSet(apply: () => void): void {
  try {
    apply();
  } catch (error) {
    console.error("[agent-quest] store subscriber threw:", error);
  }
}

function handleEvent(event: ServerEvent): void {
  switch (event.type) {
    case "snapshot":
      safeSet(() => gameStore.set(playerAtom, event.player));
      safeSet(() => gameStore.set(defaultCwdAtom, event.defaultCwd));
      safeSet(() => gameStore.set(districtsAtom, event.districts));
      safeSet(() => gameStore.set(sideQuestsAtom, event.sideQuests));
      safeSet(() => gameStore.set(recentCommitsAtom, event.recentCommits));
      safeSet(() => gameStore.set(demoModeAtom, event.demoMode));
      safeSet(() => gameStore.set(agentsAtom, event.agents));
      break;
    case "sessions":
      safeSet(() => gameStore.set(savedSessionsAtom, event.sessions));
      break;
    case "journal":
      safeSet(() => gameStore.set(appendJournalAtom, event.line));
      break;
    case "toast":
      pushToast(event.level, event.text);
      break;
  }
}

export function connectSocket(): void {
  // Guard against double-connect (e.g. Vite HMR re-executing importers).
  if (socket && socket.readyState <= WebSocket.OPEN) return;
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
  socket = new WebSocket(url);

  socket.onopen = () => gameStore.set(connectedAtom, true);
  socket.onmessage = (msg) => {
    let event: ServerEvent;
    try {
      event = JSON.parse(String(msg.data)) as ServerEvent;
    } catch {
      return; // malformed frame
    }
    handleEvent(event);
  };
  socket.onclose = () => {
    gameStore.set(connectedAtom, false);
    setTimeout(connectSocket, 1500);
  };
  socket.onerror = () => socket?.close();
}

// On HMR replacement of this module, close the old socket so the fresh
// module's connection is the only writer into the store.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (socket) {
      socket.onclose = null;
      socket.close();
    }
  });
}
