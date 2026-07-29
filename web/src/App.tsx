import { useAtomValue } from "jotai";
import GameCanvas from "@/components/GameCanvas";
import Hud from "@/components/Hud";
import SummonDialog from "@/components/SummonDialog";
import TalkDialog from "@/components/TalkDialog";
import Toasts from "@/components/Toasts";
import { nearbyAtom, uiModeAtom } from "@/store/gameAtoms";

export default function App() {
  const ui = useAtomValue(uiModeAtom);
  const nearby = useAtomValue(nearbyAtom);

  return (
    <div className="relative h-full w-full">
      <GameCanvas />
      <Hud />
      {ui.mode === "roam" && nearby === null && (
        <p className="pointer-events-none absolute bottom-3 left-3 text-xs text-muted">
          WASD/arrows to move · walk to the portal to summon an agent
        </p>
      )}
      <SummonDialog />
      <TalkDialog />
      <Toasts />
    </div>
  );
}
