import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import BossBar from "@/components/BossBar";
import CheatConsole from "@/components/CheatConsole";
import Chronicle from "@/components/Chronicle";
import DebugOverlay from "@/components/DebugOverlay";
import FishingDialog from "@/components/FishingDialog";
import GameCanvas from "@/components/GameCanvas";
import HelpDialog from "@/components/HelpDialog";
import Hud from "@/components/Hud";
import InventoryDialog from "@/components/InventoryDialog";
import MapDialog from "@/components/MapDialog";
import MenuBar from "@/components/MenuBar";
import Mirror from "@/components/Mirror";
import QuestBoardDialog from "@/components/QuestBoardDialog";
import ScryDialog from "@/components/ScryDialog";
import ShopDialog from "@/components/ShopDialog";
import SummonDialog from "@/components/SummonDialog";
import TalkDialog from "@/components/TalkDialog";
import TavernDialog from "@/components/TavernDialog";
import Toasts from "@/components/Toasts";
import TutorialDialog, { TUTORIAL_DONE_KEY } from "@/components/TutorialDialog";
import { nearbyAtom, uiModeAtom } from "@/store/gameAtoms";

export default function App() {
  const ui = useAtomValue(uiModeAtom);
  const setUi = useSetAtom(uiModeAtom);
  const nearby = useAtomValue(nearbyAtom);

  // §18 — the guide's tour is present by default on a first run (skippable,
  // and replayable any time via the guide NPC or the Help screen).
  useEffect(() => {
    if (!localStorage.getItem(TUTORIAL_DONE_KEY)) setUi({ mode: "tutorial" });
  }, [setUi]);

  return (
    <div className="relative h-full w-full">
      <GameCanvas />
      <Hud />
      <BossBar />
      <MenuBar />
      {ui.mode === "roam" && nearby === null && (
        <p className="pointer-events-none absolute bottom-3 left-3 text-xs text-muted">
          WASD/arrows to move · click things — or walk up and press Space/Enter
        </p>
      )}
      <Chronicle />
      <SummonDialog />
      <TalkDialog />
      <InventoryDialog />
      <QuestBoardDialog />
      <TavernDialog />
      <ScryDialog />
      <FishingDialog />
      <MapDialog />
      <ShopDialog />
      <Mirror />
      <HelpDialog />
      <TutorialDialog />
      <CheatConsole />
      <DebugOverlay />
      <Toasts />
    </div>
  );
}
