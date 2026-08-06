import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import BossBar from "@/components/BossBar";
import CheatConsole from "@/components/CheatConsole";
import Chronicle from "@/components/Chronicle";
import DebugOverlay from "@/components/DebugOverlay";
import EditorDialog from "@/components/EditorDialog";
import FishingDialog from "@/components/FishingDialog";
import GameCanvas from "@/components/GameCanvas";
import HelpDialog from "@/components/HelpDialog";
import Hud from "@/components/Hud";
import InventoryDialog from "@/components/InventoryDialog";
import MapDialog from "@/components/MapDialog";
import MenuBar from "@/components/MenuBar";
import Mirror from "@/components/Mirror";
import QuestBoardDialog from "@/components/QuestBoardDialog";
import RiftBoundary, { RiftTester } from "@/components/RiftBoundary";
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

  // §19 — each customizable surface gets its own rift boundary, so a broken
  // edit's blast radius stays scoped: the world can tear without taking the
  // Mirror, and none of it touches the agents running server-side. The core
  // control surfaces (Mirror, Talk, Summon) don't read overrides, so an edit
  // can't break them; the outer boundary is the last-resort net.
  return (
    <RiftBoundary surface="the realm itself">
      <div className="relative h-full w-full">
        <RiftBoundary surface="the world">
          <RiftTester surface="world" />
          <GameCanvas />
        </RiftBoundary>
        <RiftBoundary surface="the HUD">
          <RiftTester surface="hud" />
          <Hud />
        </RiftBoundary>
        <BossBar />
        <MenuBar />
        {ui.mode === "roam" && nearby === null && (
          <p className="pointer-events-none absolute bottom-3 left-3 text-xs text-muted">
            WASD/arrows to move · click things — or walk up and press
            Space/Enter
          </p>
        )}
        <Chronicle />
        <SummonDialog />
        <TalkDialog />
        <InventoryDialog />
        <RiftBoundary surface="the quest board">
          <RiftTester surface="board" />
          <QuestBoardDialog />
        </RiftBoundary>
        <TavernDialog />
        <ScryDialog />
        <FishingDialog />
        <RiftBoundary surface="the Map">
          <RiftTester surface="map" />
          <MapDialog />
        </RiftBoundary>
        <ShopDialog />
        <Mirror />
        <HelpDialog />
        <TutorialDialog />
        <RiftBoundary surface="the World Codex">
          <EditorDialog />
        </RiftBoundary>
        <CheatConsole />
        <DebugOverlay />
        <Toasts />
      </div>
    </RiftBoundary>
  );
}
