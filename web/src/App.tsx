import { useAtomValue } from "jotai";
import CheatConsole from "@/components/CheatConsole";
import DebugOverlay from "@/components/DebugOverlay";
import GameCanvas from "@/components/GameCanvas";
import Hud from "@/components/Hud";
import InventoryDialog from "@/components/InventoryDialog";
import JournalDrawer from "@/components/JournalDrawer";
import Mirror from "@/components/Mirror";
import QuestBoardDialog from "@/components/QuestBoardDialog";
import ScryDialog from "@/components/ScryDialog";
import SummonDialog from "@/components/SummonDialog";
import TalkDialog from "@/components/TalkDialog";
import TavernDialog from "@/components/TavernDialog";
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
          WASD/arrows to move · E to interact · M mirror · J journal · ` cheats
        </p>
      )}
      <JournalDrawer />
      <SummonDialog />
      <TalkDialog />
      <InventoryDialog />
      <QuestBoardDialog />
      <TavernDialog />
      <ScryDialog />
      <Mirror />
      <CheatConsole />
      <DebugOverlay />
      <Toasts />
    </div>
  );
}
