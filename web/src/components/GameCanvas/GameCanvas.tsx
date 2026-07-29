import { useEffect, useRef } from "react";
import { createGame } from "@/game/createGame";

export default function GameCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const game = createGame(hostRef.current);
    return () => game.destroy(true);
  }, []);

  return <div ref={hostRef} className="absolute inset-0" />;
}
