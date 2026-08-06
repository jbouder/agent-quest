import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { createGame } from "@/game/createGame";
import { releaseToWorld } from "@/lib/focus";
import { overridesAtom } from "@/store/gameAtoms";

export default function GameCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  // §19 — the world is a pure render of the overrides document: when it
  // changes (preview, apply, or revert), rebuild the game from scratch
  // rather than mutating a live scene. Cold boot is cheap — every texture
  // is procedural — and it guarantees no half-applied state.
  const overrides = useAtomValue(overridesAtom);

  useEffect(() => {
    void overrides; // the document itself is the rebuild trigger
    if (!hostRef.current) return;
    const game = createGame(hostRef.current);
    return () => game.destroy(true);
  }, [overrides]);

  // Touching the world takes the keyboard back from whatever button was
  // still holding it, so WASD never goes quietly dead after a dialog visit.
  return (
    <div
      ref={hostRef}
      onPointerDown={releaseToWorld}
      className="absolute inset-0"
    />
  );
}
