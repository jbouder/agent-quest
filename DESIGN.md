# Agent Quest — Design Doc

A Zelda-style top-down control room for Claude Code agents. Real agents
appear as NPCs in a village you walk around as your own character. You
talk to them, steer them, stop them, summon new ones, and check on them
from a distance — all while getting genuine visibility into what they're
doing (skills/plugins available, context usage, token spend) instead of
scrollback in a terminal.

The core idea: this is an observability tool wearing a game skin, not a
game with observability bolted on. Every mechanic below maps to a real
signal or a real control action.

---

## 1. World & movement

- Classic top-down village, camera-locked to the player.
- WASD/arrow movement, bird's-eye view.
- Village layout doubles as a map of the repo — houses/districts
  represent modules or directories, so an agent visibly "entering" the
  auth module is literally an NPC walking to that house.

## 2. Two separate resources (the key design decision)

**NPC health = context window usage (per session).**
- Depletes as *that agent's* current conversation fills its context
  window.
- Hitting the ceiling doesn't mean death — it triggers a "faint →
  auto-compact → back up" animation, with health restored to whatever
  the post-compaction context size is. This mirrors what Claude Code
  actually does.
- A manual `/compact` becomes an item — a potion that restores health
  mid-task without ending the encounter.

**Player (your) health = budget/allotment (cumulative, across all agents).**
- Every agent's token spend chips your hearts, not theirs — this is the
  resource that governs whether you can keep playing at all.
- Zero hearts = locked out. Can't summon new agents; existing ones pause
  and go to sleep (literally walk to a bed/inn, go translucent) until
  the allotment resets or you top up.
- This cleanly separates "this one agent is struggling with context" (a
  normal in-fight event) from "you're out of runway entirely" (a hard
  stop on the whole session).

## 3. NPCs (agents)

Each active agent is an NPC with:
- **Status animation**: idle (waiting), working (tool call in progress),
  thinking (generating), blocked (permission needed — `!` bubble),
  asleep (budget exhausted).
- **Status ring**: thin radial progress ring showing turn progress or
  time-in-current-tool, so "stuck" reads differently from "working."
- **Thought bubble**: small scrolling text above the NPC showing the
  current tool call name or last log line — real content, glanceable,
  no need to open a menu.
- **Health bar**: context window headroom, per above.
- **Class/skin**: cosmetic variation by task type — a research-heavy
  agent reads as a mage, a refactor agent as a warrior, a quick fix as a
  rogue.

## 4. The Mirror (agent overview)

A Sheikah Slate–style pause screen:
- Press a button, screen dims, grid of thumbnails — one per active
  agent — each with a live status icon.
- Agents that need attention (error, permission request, just finished)
  get a pulsing highlighted border.
- Tap one to warp directly to that NPC's location. This is how you
  "return to any active agent as needed" without walking across the
  whole village.

## 5. Inventory screen (skills & plugins)

Opens like a classic item grid:
- One icon per skill or MCP plugin/connector currently available to
  that agent.
- Tap an item for detail: what it is, which MCP server it's from, last
  time it was invoked. This becomes the at-a-glance "what can this agent
  actually do" view that's normally invisible in the CLI.
- Items actually **used this session** glow/highlight, distinguishing
  "available" from "actually reached for."

### 5a. Model as equipment slot

Separate from skills/plugins, since it's a different kind of "what can
this agent do" lever: the model itself is a weapon/armor slot in the
inventory.

- **Haiku** → light gear: quick, low weight, cheap to summon — the
  rogue/scout loadout for fast, simple tasks.
- **Sonnet** → balanced knight gear: the default, general-purpose
  loadout most agents wear.
- **Opus** → heavy armor: slower but hits much harder, higher mana cost
  to equip.
- **Fable / Mythos** → legendary-tier gear: currently the strongest
  available, rare, priced accordingly — the item you don't equip on
  every quest, only when the task calls for it. (Fable and Mythos share
  the same underlying model, but Fable carries extra safety measures —
  flavor-wise, two versions of the same legendary weapon, one "warded."
  Worth reflecting accurately in the tooltip rather than just labeling
  one "strongest.")
- **Switching model mid-task = a re-equip animation, not a silent stat
  change.** Since a model can genuinely be swapped mid-conversation,
  the NPC visibly re-equips (glow-up, new armor sprite) the moment it
  happens — giving real, currently-invisible information (which model
  this agent is running on right now) a clear visual tell.
- **Cost ties into the existing mana/budget system (§8, §12)**:
  equipping a heavier model at summon time costs more mana up front, and
  drains the health/budget meters faster once running, matching real
  per-token cost differences across tiers.

## 6. Quest log & Journal

- **Quest log** = the agent's live task/plan list (maps to a todo/plan
  tool). Literal checkboxes, ticking off as the agent progresses.
- **Journal** = scrollback combat log — every tool call, error,
  permission request, in order. Toggle-able, not always on-screen; the
  "boring but essential" telemetry view for when you actually need to
  debug something.

## 7. Weapons & tools (control actions)

Each maps to a real control action on the running session:

| In-game action          | Real effect                                              |
|--------------------------|-----------------------------------------------------------|
| **Sword** (quick tap)    | Interrupt — halt the current turn immediately, no data loss |
| **Shield**               | Deny a pending tool-use permission request                 |
| **Open palm**            | Approve a pending permission request                        |
| **Wand / Talk**          | Steer — inject a new instruction mid-task                  |
| **Bow** (remote)         | Same as Talk/steer, without walking over to the NPC          |
| **Hookshot**             | Pull the agent's latest output/log to you as a readable scroll, without fully re-engaging |
| **Resume**               | Continue after a stop or a permission block                 |
| **Dismiss**              | Actually end the session (distinct from pause — final, not a freeze) |

Note: an interrupt doesn't necessarily land instantly — the current
tool call has to unwind first. Worth reflecting as a brief "flinch"
animation rather than an instant freeze, so the UI never lies about
what's actually happening.

## 8. Summoning agents from the app

- A portal / pedestal in the village. Walk up, "talk" to it, get a
  dialogue-style prompt box: what should it do, which directory, any
  starting options.
- Confirms and spawns — the NPC walks in from the portal with an
  entrance animation.
- Worth surfacing a permission-mode choice at summon time (auto-approve
  safe tools vs. prompt-through-UI) and a concurrency cap, since NPCs
  are cheap to look at but not cheap to run.
- **Mana/currency as a resource**: summoning costs mana tied to expected
  token spend, reinforcing the cost-awareness angle rather than treating
  agents as free.

### 8a. Other ways an NPC can appear (not just the portal)

The portal isn't the only entry point — Claude Code sessions can
originate outside Agent Quest entirely, and both real paths are worth
supporting:

- **Resuming an existing session.** Every Claude Code conversation is
  saved to disk as it goes and can be resumed later by session ID or
  directory. Agent Quest can scan for these on startup and let an NPC
  "already exist" in the village, already carrying its memory-tome
  (§14) and quest log, even though Agent Quest never spawned it. This
  only works cleanly once the original process has exited — a session
  can only have one active writer at a time, so resuming one that's
  still running elsewhere causes clashing/interleaved messages rather
  than a clean attach.
- **Attaching to a session that's actively running right now.** Claude
  Code's Remote Control feature lets a web or mobile client connect
  live to a session running in a terminal on your machine (source
  machine must stay on, terminal open). This is the real mechanism for
  "walk up to something you started manually and take control of it."
  It behaves like screen-sharing — one input focus at a time — so
  taking control is a genuine handoff, not a passive view. Worth a
  visible "you've taken the reins" beat (e.g. the gatekeeper from §14
  stepping aside) since Agent Quest is now the thing actually driving
  that terminal, not just watching it.

## 9. Side quests / staying engaged while agents work

The design tension worth solving: the world should feel alive even when
you're not actively managing agents.

- **Repo-as-village**: NPCs visibly walk between houses/districts as
  they touch different parts of the codebase.
- **Random encounters = real repo events** — a new PR, a failing CI
  run — surfaced as obstacles/encounters you engage with directly.
- **Companion familiar**: a small creature that follows you and chirps
  quick status updates ("Agent 2 hit an error") so you're not tethered
  to the Mirror at all times.
- **Boss fights**: a long-running, multi-hour task gets its own
  dedicated arena/boss bar instead of blending in with quick tasks.
- **Leveling/trophies**: a completed session leaves a marker (statue,
  chest) behind in the village — a visible, walkable history of what's
  been done.

### 9a. Quest board (anchor mechanic)

A physical board in the village square where side quests post
themselves automatically, pulled from whatever's connected (git, CI,
issue tracker, monitoring). You accept a quest by walking up and
reading it, rather than everything forcing itself on you as a random
encounter — keeps you in control of what actually pulls your attention.

### 9b. Side quest types

- **Overgrown ruins = tech debt.** A district that hasn't been touched
  in a long time visibly decays — vines, cracked stone. Clearing it
  (a refactor task) restores the buildings. Gives long-neglected code a
  visible, mildly guilt-inducing presence instead of staying invisible
  until it breaks.
- **Weeds on the path = stale branches.** Branches sitting unmerged for
  weeks show up as overgrowth blocking a road. Cleaning them up (merge,
  rebase, or delete) clears the path.
- **Traveling merchant = dependency updates.** A merchant periodically
  shows up with new versions of your dependencies. Accept the trade
  (bump the version) or wave them off — a lightweight way to surface
  Dependabot/Renovate-style updates without them piling up as noise.
- **Trickster enemy = flaky tests.** Only appears sometimes, and
  beating it (rerunning/fixing the test) doesn't always stick the first
  time — matches the actual annoying nature of flaky tests better than
  a normal fixed encounter.
- **Villager with a question mark = documentation gaps.** An NPC in a
  district stands around confused until someone (an agent or you)
  writes the missing docs for that module, then goes back to their
  business.
- **Bounty board = security/lint findings.** Each finding posts as a
  bounty with a small reward (mana or a cosmetic) for clearing it —
  gives low-priority-but-real findings a reason to get picked up
  instead of ignored.
- **Escort quest = onboarding.** A new-teammate or first-PR-from-a-
  contributor event spawns a lost traveler NPC who needs guiding
  through the village (docs, setup steps) — fits "help someone find
  their way" thematically.
- **Raid boss = a big cross-cutting feature.** When multiple agents
  collaborate on one large feature, that's a boss fight with its own
  arena rather than several independent side quests — the party
  mechanic from §13 forming up for one shared objective.
- **Fishing/idle timer = long builds or slow CI.** A small idle
  minigame at a dock while a long-running pipeline finishes — something
  to do with your hands that doesn't compete for real attention, and
  naturally ends when the build does.

### 9c. Rollback / revert = rewinding time

A `git revert` doesn't destroy the trophy/statue left behind by the
quest it undoes (§9) — it plays a rewind effect on that specific
structure instead, visually undoing it in place. This keeps the
metaphor honest with how revert actually works: a new commit that
undoes changes, not an erasure of history. The original trophy's
existence (and the fact it was later rewound) both stay visible, rather
than the structure just disappearing as if the work never happened.

## 9d. The Tavern (player-chosen downtime)

A different category from §9a/§9b: those side quests are automated and
repo-driven, generated *for* you. The Tavern is the opposite — a
physical common room you choose to walk into when there's genuinely
nothing to act on yet, and you want something worthwhile to do with the
wait. Walking in doesn't pull focus the way the quest board or Mirror
might; it's explicitly optional and low-stakes.

- **The Library corner = learning, tied to what's actually happening.**
  A librarian NPC surfaces a short explainer keyed to whatever a
  currently-working agent is touching — if an agent is deep in a
  library or pattern you're less familiar with, the librarian has a
  quick primer ready. Keeps "learning" grounded in real, current
  context rather than being disconnected trivia content.
- **The Town Crier = current events.** A crier posts a short, current
  digest — scoped to dev/AI industry news relevant to your stack, or
  broader if wanted. Reads like a scroll or posted notice, matching the
  world's presentation rather than a raw feed.
- **The Bard's Corner = music.** A bard NPC with play/pause/skip,
  ambient lo-fi by default. If a real music service is ever connected,
  this is exactly where that plugs in — the bard becomes the in-world
  face of "play/pause/skip," rather than a bare player widget bolted
  onto the UI.
- **The Garden = a genuine idle wind-down.** Tending a small plot —
  watering, watching things grow slowly — as an actually low-stimulation
  activity, distinct from anything competing for attention. Less
  "content" and more permission to just relax for a minute while
  something runs.

## 9e. The Scrying Pool / Watchtower (web search)

A location distinct from the Mirror (§4), which looks inward at your
agents — this one looks outward at the web.

- **When an agent searches**, it doesn't just silently know things — it
  visibly walks to the tower and gazes into the pool, with the thought
  bubble showing the actual query. It returns with a scroll (the
  result), which pins itself to the journal (§6) rather than appearing
  as invisible context. Turns an otherwise-hidden tool call into a real,
  watchable beat.
- **Player-initiated version.** You can walk to the tower yourself and
  gaze in — a genuinely useful ad hoc lookup while waiting, distinct
  from the Town Crier (§9d), which is a curated passive digest. This is
  on-demand, about whatever you're personally curious about right now,
  not scoped to your stack or industry news.
- **Multi-source searches = several scrolls at once.** If a search
  pulls from multiple sources, several scrolls appear together rather
  than one — an honest visual cue that the answer drew on more than a
  single source, without needing to open anything to know that.

## 15. Easter eggs

Unlike the rest of this doc, these don't need airtight design rules —
they're allowed to just be delightful and slightly arbitrary. A grab
bag worth keeping in mind for later, not fully specced:

- A dusty statue in a forgotten corner labeled with a deprecated model
  name (Claude 1, Claude 2) — a little graveyard-of-versions joke, with
  the currently-equipped model tier (§5a) glowing brightly by contrast.
- An old man in a cave who hands you a cosmetic shield with a line like
  "it's dangerous to `git push --force` alone — take this."
- A skeleton in the overgrown-ruins tech-debt district (§9b) wearing a
  name tag that just says "TODO: fix later."
- A rubber duck NPC by a pond that, if you talk to it, just repeats your
  last steering instruction back to you — actual rubber-duck debugging,
  staged as a joke.
- Push on a wall in an empty corner of the village enough times and it
  cracks open — classic secret-passage energy, reward is cosmetic only.
- If an agent's journal (§6) logs an unusually long unbroken streak of
  the same tool call, a small "are you okay?" bubble appears above it.
- Summon (§8) way past any reasonable budget and get a dry, self-aware
  line back rather than a plain error — "the mirror looks back at you,
  unimpressed."

## 16. Cheat codes

Mostly for fun, same spirit as §15 — with one exception that needs to
stay honest about what it actually does.

**Cosmetic / dev-convenience:**
- **Noclip** — fly over the village ignoring collision/walls, purely
  cosmetic, just for getting around fast or admiring the map.
- **Speed boost** — temporary faster movement, purely cosmetic.
- **Level select** — jump straight to the Mirror (§4), or teleport to
  any district by name, skipping the walk.
- **Reveal map** — light up all Easter eggs (§15) and hidden
  interactions at once, for anyone who wants to see everything without
  hunting.
- **Debug console** — a dev-console overlay that dumps raw telemetry
  across every active NPC at once, bypassing the Mirror's one-at-a-time
  browsing.

**God mode = toggling Auto Mode, not disabling safety.**
The cheat doesn't remove permission gates — it hands them to the
classifier instead of you. Entering it flips the gatekeeper NPC (§14)
from asking *you* before every risky tool call to acting on the safety
classifier's own judgment, the same real Auto Mode feature already in
the doc. Visually, the gatekeeper stops looking to you before deciding.
You stop being the bottleneck, the agent moves faster and more
autonomously, but the actual safety mechanism stays fully intact
underneath — a real feature getting a fun unlock moment, not a toggle
that quietly turns something important off.

True `--dangerously-skip-permissions` — genuinely no gates at all —
stays out of this list entirely on purpose. That's real risk, not a toy
stat, and shouldn't be something you stumble into via a cheat code. If
it's exposed at all, it should require the same explicit, unmissable
confirmation the CLI itself demands.

**Not gamified: infinite mana.** Mana is tied to real spend, so it
can't be cheated honestly. The right version of "play without real
stakes" is a separate sandbox/demo mode running against fake budget
entirely — for showing the game off — rather than a cheat applied to
real agents.

## 17. Implementation phases

Everything above is the full vision. Building it in four phases, each
one a genuinely usable milestone on its own rather than a partial demo.

### Phase 1 — Core loop
The minimum that makes this a real tool, not a mockup: world +
movement (§1), a single entry point for agents (portal spawn only,
§8), NPC status animation and health-as-context (§2, §3), player
budget/hearts (§2), and the core control actions — talk/steer, sword
(interrupt), resume, dismiss (§7). No Mirror, no inventory, no side
quests yet. Success looks like: you can summon one real agent, watch
it work, stop it, steer it, and see it sleep when budget runs out.

### Phase 2 — Visibility depth
The observability payoff, once the core loop is solid: the Mirror
(§4), Inventory with skills/plugins and model-as-equipment (§5, §5a),
Quest log and Journal (§6), permission shield/palm actions (§7), and
support for multiple concurrent NPCs with the agent-cap/camp-clustering
behavior (§12). This is the phase where the tool becomes genuinely
more useful than a terminal for understanding what's going on.

### Phase 3 — A living world
Everything that makes the village feel alive beyond a single agent:
repo-as-village top-level mapping (§1, §12), the quest board and
automated side quest types (§9a, §9b), trophies and the rewind
mechanic (§9, §9c), subagent lifecycle with return/grader-gate/batch
resolution (§13), and the additional real-feature mappings — hooks as
wards, the Auto Mode gatekeeper, plan-mode-as-draft-quest, background
task campfires, memory tomes (§14).

### Phase 4 — Depth & delight
The rest: alternate entry points via resume and live attach (§8a), the
Tavern (§9d), the Scrying Pool (§9e), Easter eggs (§15), cheat codes
including god-mode-as-Auto-Mode (§16), and a sandbox/demo mode running
on fake budget. Nothing here blocks daily usefulness — it's what turns
a solid tool into one that's genuinely fun to spend time in.

## 10. Data model (conceptual)

**Per agent (NPC):**
- Identity: id, label, task description
- Status: idle / thinking / tool_running / blocked_permission / sleeping / ended
- Current action: last tool name or thought summary (thought bubble)
- Context tokens used / context limit (NPC health)
- Cumulative tokens spent this session (chips player health)
- Skills & plugins available; subset actually used this session
- Quest list: title + done/not-done
- Log: timestamped lines (journal)

**Player:**
- Cumulative budget spent / budget limit (hearts)

## 11. Control flow summary

Talking to, steering, stopping, or resuming an agent are all *real*
actions on a *live* session — which means the control layer has to
either be the thing that spawned the session, or hold an active
attach/control handle to it. Passive OTel telemetry can tell you what
an agent did; it can't stop what it's doing. Three paths into that
control layer, all converging on the same sword/shield/wand/bow action
set once an NPC exists:

1. **Spawn via the portal** (§8) — Agent Quest starts the session and
   holds the handle from the beginning.
2. **Resume a finished session** (§8a) — Agent Quest becomes the sole
   writer of a saved conversation once the original process has exited.
3. **Attach to a live session** (§8a) — Agent Quest takes over input
   focus on a session already running elsewhere, the same way Remote
   Control lets web/mobile clients drive a live terminal session.

What makes "tell it to stop" actually work is holding one of these three
handles — not just observing a telemetry stream.

## 12. Resolved design decisions

**Agent cap & the Mirror's role.** A readable village tops out around
6–8 individually-rendered NPCs. Past that, new agents don't get full
sprites by default — they auto-cluster into a "camp" icon (tent + count
badge) and only expand to a full NPC when you walk up or select them
from the Mirror. In practice this means: the village is for agents
you're actively engaged with; the Mirror is the dispatch console for
everything else. Past the threshold, the Mirror stops being an optional
pause-menu and becomes the primary way you interact with most of your
running agents.

**Sleeping agents hold position, don't relocate.** Budget-exhausted
agents don't get teleported to an inn — that breaks the mental map of
"where is this agent working." Instead they go inert in place (greyed
out, lying-down sprite) at whatever location they were last active in.
The inn/bed metaphor becomes a state overlay on their current spot, not
an actual location change — simpler to implement and keeps spatial
continuity.

**Repo-as-village stays literal only at the top level.** One
house/district per top-level directory or module. Below that, the
mapping is implied, not rendered — an agent "enters" a district, and
the specific file it's touching surfaces as text in the thought bubble
or journal rather than as a walkable building. This keeps the spatial
metaphor legible instead of trying to render an entire file tree as
geography.

**Mana is a hybrid, not a flat cost.** A small flat cost applies at the
moment of summoning (so spawning is always a real decision, not free),
and then the same meter drains live from actual token usage once the
agent is running — the same underlying mechanic as the hearts/budget
system, just framed as "mana" at summon-time. This avoids maintaining
two separate currencies that could drift out of sync with real spend.

## 13. Subagent lifecycle

Claude Code subagents are isolated instances a lead agent spawns to work
in parallel — each with its own context window and tools. The lead
agent only ever receives the subagent's final summary back, never its
intermediate work. That data flow should be visible, not a disappearing
act:

- **Return, don't vanish.** A finishing subagent walks back to its lead
  agent and hands over a scroll (its summary result) — this handoff
  *is* the real return-value flow, made literal.
- **Grader gate before resolving.** Real subagent output can be scored
  against a rubric and sent back for revision if it misses the bar
  (SubagentStop gating). Visually: the subagent passes through a gate
  on the way back.
  - **Pass** → scroll is absorbed into the lead agent (brief
    merge/flash effect); the subagent sprite fades out *after* the
    handoff. The lead's quest log ticks off whatever task it covered.
  - **Fail** → it doesn't reach the lead at all — it turns around and
    walks back into the field to redo the work. No popup needed; the
    turn-around itself communicates "sent back for revision."
- **Leave a trace.** Rather than disappearing without residue, a
  finished subagent drops a small marker where it worked — footprint,
  tiny chest, scratch mark — so the village accumulates a visible,
  walkable history. Same idea as the main-agent trophies/statues (§9),
  scaled down since subagents are shorter-lived and more numerous.
- **Batch resolution at scale.** Real Claude Code can fan a lead agent
  out into tens or even hundreds of parallel subagents in one session
  (Dynamic Workflows). Individually animating that many return trips
  would recreate the clutter problem from §12. Past a small concurrent
  threshold, subagents resolve directly into a single **"party
  returns"** moment at the lead agent — one animation, one summary,
  with a count — rather than each one walking home individually.

## 14. Additional Claude Code feature mappings

A few more real capabilities worth reflecting directly, surfaced by
looking at what Claude Code actually supports beyond a single agent
loop:

- **Hooks → wards on the world, not agent inventory.** Hooks
  (PreToolUse, PostToolUse, Stop, SessionStart, SubagentStop) are
  deterministic rules that apply regardless of what any given agent
  wants to do — "always run tests before stopping," "block writes
  outside the repo." These govern the *world*, not any one character,
  so they don't belong in the per-agent inventory screen (§5). Better
  as visible rune circles / ward-lines on the village itself — e.g. an
  invisible fence at the repo boundary that physically stops an NPC
  from walking outside it.
- **Auto Mode → a gatekeeper NPC instead of a popup.** Claude Code's
  safety classifier auto-approves "safe" tool calls and holds "risky"
  ones for approval. Rather than every permission request opening the
  same generic shield/palm dialogue (§7), a gatekeeper character at the
  village edge visibly waves safe agents through and physically blocks
  risky ones — making the classifier's judgment itself part of the
  world instead of a modal.
- **Plan mode → the quest log's draft state.** Plan mode drafts an
  approach before committing to changes. Maps directly onto the quest
  log (§6): a plan is a quest log that's still unsigned — reviewed and
  approved (accept the quest) before the agent starts ticking boxes.
- **Backgrounded bash tasks → side-quest campfires.** Long-running
  backgrounded commands (tests, builds) that don't block the main
  conversation fit the "stay engaged while agents work" idea (§9) — a
  small campfire/icon burning in the background that resolves on its
  own timer, distinct from the main NPC's active status.
- **CLAUDE.md / scoped memory → a tome the NPC carries.** Persistent
  memory (scoped to user, project, or local) is what lets an agent
  "remember" across sessions. A returning NPC could visibly carry a
  tome that persists between summons — opening it shows what it already
  knows about this project, distinct from the per-session journal (§6),
  which resets each time.
