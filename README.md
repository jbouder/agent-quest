# Agent Quest

A Zelda-style top-down control room for Claude Code agents. Real agents
appear as NPCs in a village; you walk up to them, talk to steer them,
interrupt them with a sword-tap, and watch their context window as a
health bar. See [DESIGN.md](./DESIGN.md) for the full vision — all four
implementation phases are built.

## What works

**Phase 1 — core loop**
- Village + movement (WASD/arrows), portal summon with model-as-equipment
  and permission gate choice (§1, §8)
- Real agents as NPCs via the Claude Agent SDK: status animations,
  NPC health = context window (restored on auto-compaction), player
  hearts = shared budget; at zero everyone sleeps in place (§2, §3)
- Talk/steer, interrupt, resume, dismiss, allow/deny (§7)

**Phase 2 — visibility depth**
- The Mirror (`M`): live agent grid, attention pulse, tap to warp (§4)
- Inventory: tools/skills/MCP items from the session init message,
  used-this-session glow, model as an equipment slot with real
  mid-session re-equip via `setModel()` (§5, §5a)
- Quest log from TaskCreate/TaskUpdate (and legacy TodoWrite); journal
  drawer (`J`) (§6); camp clustering past 6 NPCs with Mirror promotion (§12)

**Phase 3 — a living world**
- Repo-as-village: one labeled house per top-level directory; agents
  visibly walk to the district they're touching (§1, §12)
- Quest board: stale branches, TODO/FIXME bounties, README gaps scanned
  from the repo; accepting prefills the portal (§9a, §9b)
- Subagent lifecycle: minion dots, party badge past 3, scroll-flash on
  return; backgrounded tasks burn as campfires (§13, §14)
- Plan mode = draft quest log until ExitPlanMode; CLAUDE.md as a memory
  tome in the inventory; Auto Mode gatekeeper NPC (§14)

**Phase 4 — depth & delight**
- Revive saved sessions from the portal (`listSessions` + `resume`) (§8a)
- The Tavern: procedural bard, town crier reading recent commits,
  library keyed to live activity, a garden (§9d)
- The Scrying Pool: summons a real Haiku scout to web-search (§9e)
- Easter eggs (§15) and the backtick cheat console: noclip, speed,
  warp, reveal, debug, and god mode = real Auto Mode (§16)
- Sandbox demo: `AGENT_QUEST_DEMO=1 npm run dev` — fake agents, fake
  budget, full UI, zero spend

**Known gaps (honest ones):** hooks-as-wards and the trophy rewind
mechanic have no reliable SDK signal yet; live attach to a session
running in another terminal (Remote Control) has no public API. All
three are noted in DESIGN.md and wait on upstream support.

## Running it

```sh
npm install
cp .env.example .env   # optional — all settings have defaults
npm run dev            # control server on :8787, game on :5173
```

Open http://localhost:5173, walk south to the glowing portal, press `E`.

Configuration lives in a single `.env` at the repo root (see
[.env.example](./.env.example)): demo mode, budget, agent cap, port, and
`ANTHROPIC_API_KEY` (if unset, the SDK falls back to this machine's
Claude Code credentials). Set `AGENT_QUEST_DEMO=1` to run the whole game
on scripted fake agents with zero real spend.

## Layout

```
shared/protocol.ts   wire types: AgentSnapshot, ClientCommand, ServerEvent
server/              Node/TS control layer — owns the live session handles (§11)
  src/agentSession.ts  one SDK query() per NPC: streaming input, interrupt,
                       permission callback, telemetry derivation
  src/sessionManager.ts registry + budget + broadcast
web/                 Vite + React 19 + Phaser 3 game client
  src/game/            the village scene (textures generated at runtime)
  src/components/      HUD hearts, summon/talk dialogs, toasts
```

## Quality gate

```sh
npm run build && npm run test && npm run check
```

Note: the in-game dialogs are intentionally custom pixel-styled UI rather
than shadcn components; semantic color tokens live in `web/src/index.css`.
