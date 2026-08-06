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
- The village is a single shared space, not a map of the repo. Earlier
  drafts tied houses/districts to project directories; that mapping
  added rendering complexity without adding real understanding (see
  §12) and has been dropped. What matters is *what an agent is doing*
  (thought bubble, journal, quest log), not *where it's standing*.

### 1a. A bigger world, multiple areas

The village square doesn't have to be the whole world — it's the hub.
Expanding outward into named areas gives everything already in this doc
room to breathe instead of competing for the same patch of ground:

- **Village Square** — the hub. Quest board (§9a), gatekeeper at the
  edge (§14), central and easy to return to.
- **The Shopping District** — the shops (§5b), browsable at leisure,
  separate from the busier square.
- **The Tavern** — learning/news/music/garden (§9d), already framed as
  a place you deliberately walk to for downtime; benefits from feeling
  a little removed from the main hustle.
- **The Ruins** — tech debt (§9b), naturally suited to being its own
  overgrown area at the world's edge rather than a single structure in
  the square.
- **The Watchtower** — the Scrying Pool (§9e), thematically fits being
  set apart and elevated, away from the day-to-day village.
- **The Frontier** — where random encounters, the traveling merchant,
  and escort quests (§9b) play out; open space rather than fixed
  buildings, since these are transient by nature.
- **The Arena** — raid bosses (§9b) get a dedicated space, so a
  large-scale multi-agent effort doesn't visually collide with normal
  village life happening nearby.
- **The Docks** — the fishing/idle-timer wait (§9b) for long builds or
  slow CI, naturally suited to being its own quiet spot.

A bigger world also gives the agent-cap/camp-clustering behavior (§12)
more room — background agents can cluster near whichever area is
thematically relevant to their task rather than all stacking in one
square once the count climbs.

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

### 5b. Shops (installing skills, plugins, MCPs)

If the inventory screen shows what an agent *has*, the shops are where
you get more of it — a real marketplace browser dressed as Zelda-style
shops, since this is meant to be the one-stop-shop for the whole Claude
Code setup, not just a viewer.

- **A few specialty shops rather than one generic store**, matching the
  categories that already exist as separate inventory sections (§5):
  a Skills shop, a Plugin shop, and an MCP/connector shop — each with
  its own shopkeeper NPC and browsable shelf of items pulled from
  Anthropic's actual registry.
- **Browsing = walking the shelves.** Each item shows its real
  description, and whether it's already installed (already in your
  inventory) vs. available to add.
- **"Buying" = installing.** No real currency needs to be spent here —
  installing a skill or plugin doesn't cost tokens — so the purchase
  flourish is cosmetic (a chime, an item added to inventory) rather than
  drawing down mana. Mana stays reserved for things that cost real spend
  (§8, §12), so the shop doesn't muddy that signal.
- **Uninstalling = selling back**, for symmetry — removes the item from
  the inventory grid (§5) the same way it would from a real Claude Code
  configuration.
- **New releases get a "just in" shelf.** Since Anthropic's skill/plugin/
  MCP catalog changes over time, the shopkeeper can visibly restock —
  a small, honest way to surface "here's what's new" without a
  separate changelog screen.

## 6. Quest log & Journal

- **Quest log** = the agent's live task/plan list (maps to a todo/plan
  tool). Literal checkboxes, ticking off as the agent progresses.
- **Journal** = scrollback combat log — every tool call, error,
  permission request, in order. Toggle-able, not always on-screen; the
  "boring but essential" telemetry view for when you actually need to
  debug something.

### 6a. The Chronicle (consolidated cross-agent journal)

The per-agent Journal above is scoped to one NPC at a time — useful
once you know which agent you care about, less useful when the
question is "what's happened across everything, recently." The
Chronicle is a single, always-available feed merging every agent's
journal entries into one chronological stream:

- **One list, filterable by agent, status, or event type** (errors,
  permission requests, completions) rather than needing to visit each
  NPC individually to piece together a picture.
- **This becomes the actual answer to "what happened while I was in the
  Tavern/side-questing/away"** — more complete than the companion
  familiar's short chirp (§9), for when you want the full record rather
  than a summary.
- **Reachable from the pause menu**, not tied to any location in the
  village — this is core visibility infrastructure, not a place you
  walk to.

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

### 7a. Interaction model (simplified)

Proximity-plus-keypress isn't the problem on its own — needing to
remember a specific, arbitrary key (like "E") for it is. Simplifying to
support both click/tap *and* walk-up-and-press-a-button, with a single
consistent button rather than a memorized one:

- **Click/tap directly on an NPC or object** works as one path — no
  walking required if you're already positioned to point at it.
- **Walking up and pressing a single, consistent interact button**
  works as the other — same action, keyboard/controller-friendly, no
  mouse required. The button should be the same one every time (e.g.
  whatever the platform's natural "confirm/interact" button is —
  Space/Enter on keyboard, A/X on controller) rather than something
  that has to be looked up, and a small contextual prompt appears near
  the NPC/object once you're in range so it's never a guess whether
  you're close enough.
- **Global overlays (Mirror, Inventory, Chronicle, pause menu) open from
  persistent on-screen buttons/icons, not memorized hotkeys.** These
  aren't tied to standing anywhere, so they shouldn't require
  remembering a letter — a small always-visible icon row (or a single
  pause-menu button that fans out to the rest) does this more
  discoverably.
- **Additional keyboard shortcuts can still exist as optional
  accelerators** for people who want them (a settings-level list,
  covered by the full reference in §18), but nothing should be *only*
  reachable by remembering an arbitrary key — click/tap and the single
  consistent interact button are always the baseline paths.
- This also simplifies the summon flow in §8 further: opening the
  pause menu and selecting the summon item works the same as any other
  menu action, rather than introducing its own separate interaction
  pattern.

### 7b. Slashing (environmental interaction)

The sword already exists as the interrupt action (§7) — giving it a
second, context-sensitive use for the environment itself, rather than
adding a new control:

- **Same button, different target.** Swinging at an NPC interrupts it
  (§7); swinging at grass, a pot, a crate, or other scattered
  environmental objects cuts or breaks it instead. What you're aimed at
  (via the click/tap-or-walk-up model in §7a) decides which happens —
  no separate mode to switch into.
- **Scattered through the bigger world (§1a)**, especially areas with
  room to wander — the Frontier, the edges of the Ruins, patches around
  the Docks — rather than clustered right in the busy Village Square.
- **Rewards are small and mostly cosmetic**: an occasional mana pickup,
  a cosmetic drop, or — most of the time — nothing, same as classic
  grass-cutting. The reward doesn't need to be meaningful every time for
  the action to be satisfying.
- **A natural home for some of the Easter eggs (§15).** The "push on a
  wall enough times" secret fits just as well as "slash the right patch
  of grass" — same spirit, doesn't need its own separate rule from
  what's already in §15.
- **The Ruins (§9b) get a thematic tie-in**: cutting back overgrowth
  there with the sword is a small, literal, satisfying gesture toward
  "clearing" tech debt, even though the actual clearing happens through
  the refactor quest itself — the slashing is flavor on top, not a
  substitute for the real mechanic.

## 8. Summoning agents from the app

Walking somewhere to start something you want *right now* adds friction
without adding meaning — unlike, say, walking up to an NPC to talk to
it, where the walk matches the real action (engaging that specific
session). Summoning a brand-new agent isn't tied to a place, so it
shouldn't require one:

- **A summon item, usable from the pause menu, from anywhere.** Think a
  Scroll of Summoning or an Ocarina — open the menu, select it, get the
  same dialogue-style prompt box (what should it do, which directory,
  any starting options) without needing to walk to a fixed location
  first.
- Confirms and spawns — the NPC still gets an entrance
  animation/appearance in the village, just without a required trip
  beforehand.
- Worth surfacing a permission-mode choice at summon time (auto-approve
  safe tools vs. prompt-through-UI) and a concurrency cap, since NPCs
  are cheap to look at but not cheap to run.
- **Mana/currency as a resource**: summoning costs mana tied to expected
  token spend, reinforcing the cost-awareness angle rather than treating
  agents as free.

(Earlier drafts placed this at a physical portal you had to walk to —
dropped for the same reason as the repo-village mapping in §1: it added
a location without adding real meaning, since there's nothing about
*where* you stand that should affect *whether* you can start a new
agent.)

### 8a. Other ways an NPC can appear (not just summoning)

The summon menu isn't the only entry point — Claude Code sessions can
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

- **Overgrown ruins = tech debt.** A standing ruin in the village whose
  overgrowth (vines, cracked stone) reflects overall tech-debt signals
  — age of untouched code, size of the backlog, whatever metric fits.
  Clearing quests posted from it (refactor tasks) restore it in stages.
  Gives long-neglected code a visible, mildly guilt-inducing presence
  instead of staying invisible until it breaks.
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
- **Villager with a question mark = documentation gaps.** An NPC stands
  around confused, labeled with whatever module or file lacks docs,
  until someone (an agent or you) writes them — then goes back to their
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
- A skeleton in the overgrown-ruins tech-debt structure (§9b) wearing a
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
- **Level select** — jump straight to the Mirror (§4), or teleport
  directly to any named agent, skipping the walk.
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

## 17. Enhancement plan

Phases 1–4 are implemented. This is no longer a from-scratch build plan
— it's the roadmap for what comes next, on top of a working tool.

### Shipped

- **Phase 1 — Core loop.** World + movement, summoning, NPC status/
  health-as-context, player budget/hearts, core control actions
  (talk/steer, interrupt, resume, dismiss).
- **Phase 2 — Visibility depth.** The Mirror, Inventory with skills/
  plugins and model-as-equipment, Quest log, Journal, permission
  actions, multi-agent support with camp-clustering.
- **Phase 3 — A living world.** Quest board and automated side quest
  types, trophies and the rewind mechanic, subagent lifecycle, hooks/
  Auto-Mode/plan-mode/background-task/memory-tome mappings.
- **Phase 4 — Depth & delight.** Resume entry point, the Tavern, the
  Scrying Pool, Easter eggs (§15 — kept exactly as designed, no
  changes), cheat codes.
- **Backfill — the parts of Phases 3 & 4 that were listed as shipped
  but weren't.** An audit against the source found five gaps, since
  closed:
  - **Hooks → wards (§14).** The merged Claude Code settings cascade is
    read through the SDK's `resolveSettings`; each configured hook
    becomes a rune circle in the village, amber where it can block an
    action and blue where it only watches. Any blocking hook also draws
    the boundary ward-line — §14's invisible fence, made visible.
  - **Rewind (§9c).** The agent that runs `git commit` owns the commit;
    a later revert naming that sha rewinds that agent's trophy in place
    rather than deleting it, so the work and its undoing both stay
    visible.
  - **Trophies (§9/§13).** A session that landed a commit or ran a long
    haul of tool calls now raises a monument rather than a generic
    chest, trophies are readable, and returning subagents leave scratch
    marks (capped, per §13's batch-resolution rule). Trophies also no
    longer stack invisibly on top of each other.
  - **Side quest types (§9b).** The remaining six of nine: overgrown
    ruins (code untouched for months), traveling merchant (`npm
    outdated`), trickster (skipped/retried tests), escort (a
    just-arrived contributor), raid boss (a party sharing one
    objective, with a boss bar), and fishing (an idle dock that opens
    only while a long background task runs, and closes when it ends).
    The board now round-robins across kinds so one prolific scanner
    can't take every slot.
  - **Live-attach (§8a/§11 path 3)** remains open — see below.
- **Enhancement A — Simplified interaction model (§7a).** Direct
  click/tap on NPCs and objects, one consistent interact button
  (Space/Enter), and persistent on-screen buttons for the global
  overlays — including the Chronicle (§6a). Landed together with the
  doc revisions it was built against: repo-as-village dropped (§12)
  and summoning moved off the portal into the menu (§8).
- **Enhancement B — Tutorials & onboarding (§18).** Guide NPC by the
  fountain with a skippable, replayable tour built around the new
  click-based interactions, first-time contextual signposts, and a
  searchable full reference.

- **Live-attach (§8a, §11 path 3), resolved as fork-on-attach.** The
  SDK cannot take over input on a session another process owns, so
  attaching to a ● live session forks it via `forkSession` into a twin
  Agent Quest fully controls. The original keeps running; the world is
  explicit about the distinction everywhere it matters (spawn toast,
  a ⧉ nameplate mark, a banner in the talk dialog, and the twin's own
  spawn prompt warning it that the original still writes to the same
  directory). Verified end-to-end against a live session, including a
  denied twin `git commit` caught by the permission gate.
- **Phase 5 — World expansion & Map (§1a, §20).** The village square
  is now the hub cell of a 3×3 world. The tavern, watchtower/scrying
  pool, and pond/dock moved out to their own areas; the Ruins,
  Frontier (merchant wagon), Arena (stone ring), and Shopping District
  (shuttered stalls awaiting Phase 6) are new ground. Tree lines with
  gapped crossings separate areas; discovery is walking somewhere for
  the first time (persisted); the 🗺 Map shows discovered areas,
  your position, live pins (board count, camp overflow, merchant,
  raid, the dock during a long wait), and fast travel to anywhere
  you've been. The §14 ward fence now rings the village cell — hooks
  govern the village, not the wilderness.
- **Phase 6 — Shops & marketplace (§5b).** The Shopping District's
  three stalls opened as real marketplace browsers, each with its own
  keeper: the Skill Apothecary (stocked live from `anthropics/skills`;
  buying copies the skill folder into `.claude/skills/`), the Plugin
  Smithy (the official `anthropics/claude-code` marketplace; buying
  writes the documented `enabledPlugins` + `extraKnownMarketplaces`
  keys into `.claude/settings.json`), and the Connector Emporium (the
  MCP registry at registry.modelcontextprotocol.io; buying writes the
  server into `.mcp.json`, remote or npx form). Selling back reverses
  each. No mana — installing costs no tokens (§5b). Shelves restock
  every 30 minutes, keep the last good stock when a registry is
  unreachable, and a "just in" shelf plus a 🛍 Map pin surface items
  this player hasn't seen on a previous visit.

### Upcoming phases
- **Phase 7 — Customization & extensibility (§19).** The in-app editor
  surface, scoped/reversible changes, and the error boundary with
  in-world crash recovery. Deliberately last: highest-risk phase
  (arbitrary changes to a running tool), so it should land once
  everything it could break — including the simplified interaction
  model and the larger world — is itself stable.

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

1. **Spawn via the summon menu** (§8) — Agent Quest starts the session
   and holds the handle from the beginning.
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

**Repo-as-village mapping: dropped entirely.** An earlier pass
considered a literal top-level mapping (one house/district per
directory or module). Revisited and removed — it didn't serve a real
purpose. What an agent is doing (thought bubble, journal, quest log)
already communicates *what's happening*; tying that to *where it's
standing* in a village added rendering and layout complexity without
adding understanding. The village is now a single shared space; file
and module context surfaces as text, not geography.

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
  invisible fence at the village boundary that physically stops an NPC
  from taking a blocked action, regardless of which agent it is.
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

## 18. Tutorials & onboarding

Given how much this doc has accumulated — a control scheme, several
overlays, shops, a Chronicle, cheat codes — new users (including future
you, six months from now) need a real way to learn it in-world rather
than a wiki page nobody opens.

- **A guide NPC in the starting area** who walks you through the
  basics on first launch: movement, talking to an agent, the summon
  menu, the Mirror. Skippable, not forced, but present by default for a
  first run.
- **Contextual signposts, not just an intro.** Small in-world hint
  prompts the first time you're near something new — the first time a
  permission request fires, a one-line prompt about shield/palm; the
  first time a subagent returns, a one-line note about the grader gate.
  Teaches features at the moment they first matter, not all up front.
- **A full reference, always available from the pause menu** — every
  keybind, every action, every overlay, searchable — for whenever the
  in-world hints aren't enough or you just want to look something up
  directly, the same way a real settings/help screen would work.
- **Re-playable, not one-time.** The guide NPC and signposts should be
  revisitable on demand (not just first-launch), since new features
  added over time (§17) will need their own onboarding moments without
  requiring a full tutorial replay.

## 19. Customization & extensibility

The tool should support changing itself through the UI — someone should
be able to conceptually reshape the world, add a new quest type, adjust
a mechanic, without needing to leave the app or touch a config file
directly.

- **An in-app editor surface**, reachable from the pause menu, that
  lets you describe or directly adjust world/feature behavior —
  ranging from cosmetic (recolor the village, rename buildings) to
  structural (add a new side-quest type, change what a hook's ward
  looks like, adjust the mana formula).
- **Changes should be scoped and reversible.** Whatever the editor
  produces needs a clear "preview before apply" step and a one-click
  revert, since letting someone reshape their own live tool is only
  safe if undoing a bad change is just as easy as making it.
- **This needs a real error boundary, not an afterthought.** Since
  customization means arbitrary changes to a running app, a broken
  edit has to fail gracefully rather than take down the whole session
  — wrapping the customizable surfaces (not the core control loop) in
  an error boundary that catches a crash without losing the underlying
  agent sessions, which should keep running underneath regardless of
  what the UI layer is doing.
- **The crash message should stay in-world, not throw you into a stack
  trace.** Something like the village briefly glitching or "a rift has
  torn open" with a clear "revert to before this change" action — in
  keeping with the game framing everywhere else in this doc, but still
  giving a real, actionable way out rather than just being cute about
  an actual failure.
- **Isolate the blast radius.** A bad customization to, say, the
  Tavern's rendering shouldn't be able to take down the Mirror or the
  control loop for an active agent — the error boundary should be
  scoped tightly enough that customization risk stays contained to
  whatever was actually changed.

## 20. The Map (world navigation)

Deliberately distinct from the Mirror (§4). The Mirror answers "what
are my agents doing" — it's agent-focused. The Map answers "where do I
go" — it's geography-focused, and becomes necessary once the world is
more than one screen (§1a).

- **Shows the named areas** (Village Square, Shopping District, Tavern,
  Ruins, Watchtower, Frontier, Arena, Docks) and your current position
  within them.
- **Discovery, not everything visible up front.** Areas you haven't
  physically walked to yet stay greyed out/unlabeled until first visit
  — a small, classic exploration reward rather than the whole world
  being handed to you on the first map open.
- **Fast travel to any discovered area.** Once you've been somewhere,
  the Map lets you warp straight back — keeping a bigger world from
  meaning more tedious walking every time, while still preserving the
  first-visit discovery moment.
- **Live pins for real signals**, not just static geography: open quest
  board items (§9a), active bounties (§9b), shops with new stock
  (§5b), and NPC camp clusters (§12) all show as pins, so a bigger
  world doesn't mean losing track of where your attention is actually
  needed.
- **Reachable the same way as the other overlays** — a persistent
  on-screen button per the simplified interaction model (§7a), not a
  memorized hotkey.
