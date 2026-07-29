# Agent Quest

A Zelda-style top-down control room for Claude Code agents. Real agents
appear as NPCs in a village; you walk up to them, talk to steer them,
interrupt them with a sword-tap, and watch their context window as a
health bar. See [DESIGN.md](./DESIGN.md) for the full vision — this repo
currently implements **Phase 1 (core loop)**.

## What works today (Phase 1)

- **Village + movement** — WASD/arrows, camera follow (§1)
- **Portal summon** — walk to the portal, press `E`, describe the quest,
  pick a model (equipment) and permission gate (§8)
- **Real agents as NPCs** — each summon starts a genuine Claude Code
  session via the Claude Agent SDK; the NPC animates by status: thinking,
  swinging a tool, blocked on permission, asleep, fainting into an
  auto-compact (§2, §3)
- **NPC health = context window**, restored on auto-compaction (§2)
- **Player hearts = shared budget** — every agent's spend chips your
  hearts; at zero, agents fall asleep in place until you top up (§2)
- **Control actions** — talk/steer, interrupt, resume, dismiss, and
  allow/deny on permission requests (§7)

## Running it

```sh
export ANTHROPIC_API_KEY=sk-ant-…   # the SDK authenticates with an API key
npm install
npm run dev        # control server on :8787, game on :5173
```

Open http://localhost:5173, walk south to the glowing portal, press `E`.

Optional env for the server:

- `AGENT_QUEST_BUDGET_USD` — starting player budget (default 5)
- `AGENT_QUEST_PORT` — WebSocket port (default 8787)

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
