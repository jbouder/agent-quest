import { useAtom, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { localToast, sendCommand } from "@/lib/socket";
import {
  cheatWarpAtom,
  debugOverlayAtom,
  noclipAtom,
  revealMapAtom,
  speedBoostAtom,
  uiModeAtom,
} from "@/store/gameAtoms";

const HELP = `noclip · speed · warp <place> · reveal · debug · godmode on|off · help`;

/** §16 — backtick console. God mode is real Auto Mode, not disabled safety. */
export default function CheatConsole() {
  const [ui, setUi] = useAtom(uiModeAtom);
  const [noclip, setNoclip] = useAtom(noclipAtom);
  const [speed, setSpeed] = useAtom(speedBoostAtom);
  const [debug, setDebug] = useAtom(debugOverlayAtom);
  const setReveal = useSetAtom(revealMapAtom);
  const setWarp = useSetAtom(cheatWarpAtom);
  const [text, setText] = useState("");
  const open = ui.mode === "cheat";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "`") setUi({ mode: "roam" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setUi]);

  if (!open) return null;

  const runCommand = (raw: string) => {
    const [cmd, ...rest] = raw.trim().toLowerCase().split(/\s+/);
    const arg = rest.join(" ");
    switch (cmd) {
      case "noclip":
        setNoclip(!noclip);
        localToast("info", `noclip ${noclip ? "off" : "on"}`);
        break;
      case "speed":
        setSpeed(!speed);
        localToast("info", `speed boost ${speed ? "off" : "on"}`);
        break;
      case "warp":
        if (arg) setWarp(arg);
        else
          localToast(
            "warn",
            "warp where? (an agent name, plaza, entrance, tavern, pool, board, camp, pond, mirror)",
          );
        break;
      case "reveal":
        setReveal(true);
        localToast("info", "✦ every hidden thing glimmers");
        break;
      case "debug":
        setDebug(!debug);
        break;
      case "godmode":
        // The gates stay — they're handed to the classifier (real Auto Mode).
        sendCommand({ type: "autoMode", enabled: arg !== "off" });
        break;
      case "help":
        localToast("info", HELP);
        break;
      default:
        localToast("warn", `Unknown incantation. ${HELP}`);
    }
    setUi({ mode: "roam" });
  };

  return (
    <div className="absolute inset-x-0 top-0 z-30 border-b-2 border-primary bg-card/95 p-3">
      <div className="mx-auto flex max-w-xl items-center gap-2">
        <span className="text-primary">›</span>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && text.trim()) runCommand(text);
          }}
          placeholder={HELP}
          className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
        />
      </div>
    </div>
  );
}
