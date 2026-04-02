# Minds, The Game — Master Project Plan

*Living document — v0.1 · April 2, 2026*
*Drop this into Project Knowledge so every session has full context.*

---

## 1. Vision & Pillars

### The Elevator Pitch
**Minds** is a mind-bending, emergent simulation where the world reshapes itself based on how you *think*, *feel*, and *commit*. Every playthrough is different because the game's reality is a mirror of the player's internal choices — not just their button presses.

### Core Parable
> You create your own reality through directed focus, emotional commitment, and diligent effort.

This isn't just story dressing. It's the *central mechanic*. The game systems literally encode this idea: what you pay attention to grows, what you invest emotion in becomes vivid, and what you work at persistently transforms.

### Three Pillars

| Pillar | Meaning | Mechanical Expression |
|--------|---------|----------------------|
| **Directed Focus** | Attention shapes reality | A perception system — what you observe, examine, and name becomes more real and interactive in the world |
| **Emotional Commitment** | Feeling fuels change | An emotional resonance system — the intensity and type of emotional investment you bring to encounters determines how deeply the world responds |
| **Diligent Effort** | Persistence transforms | A practice/mastery loop — repeated, intentional action in a domain causes compounding, non-linear breakthroughs |

### Sub-Theme: Consciousness
The game quietly explores what consciousness *is* — through the player's experience of it. Are you the observer? The decider? Both? Neither? This never lectures; it emerges through play. Possible touchstones: panpsychism, the hard problem, Jungian archetypes, lucid dreaming, meditation states.

---

## 2. Genre & Experience Recommendation

Given the pillars, I recommend a **first-person exploration / emergent simulation hybrid** — somewhere between *Outer Wilds* (curiosity-driven discovery), *Baba Is You* (reality-rule manipulation), and *Dwarf Fortress* (deep emergent systems). Here's the rationale:

### Why This Genre Fits
- **First-person perspective** makes the "you are the observer" parable literal — the camera *is* consciousness
- **Exploration over combat** keeps the focus on attention and discovery rather than reflexes
- **Emergent simulation** delivers the replay value you want — the world genuinely behaves differently based on internal state, not just branching dialogue
- **Puzzle-adjacent** without being a puzzle game — the player figures out the *rules of reality*, which shift

### Experience Flow
A typical session should feel like: curiosity → observation → hypothesis → emotional investment → breakthrough → world transformation → new mystery. This loop is the game.

---

## 3. Technical Architecture

### 3.1 Platform Decision: Web-First (TypeScript + WebGL)

**Recommended stack for v1:**

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Runtime | TypeScript | Type safety for complex systems, huge ecosystem |
| Renderer | Three.js or Babylon.js | 3D first-person, runs in browser, exportable to desktop via Electron/Tauri |
| ECS Framework | bitECS or custom | Entity-Component-System is the natural fit for emergent behavior + modularity |
| State Management | Custom event bus + immutable state | Enables save/load, time manipulation, mod inspection |
| Build | Vite | Fast dev iteration |
| Desktop wrapper | Tauri (later) | Lightweight native shell when ready |

**Why web-first:** Zero-friction distribution, instant sharing of mods/stories, natural fit for AI integration via API calls, and you can always wrap it for desktop later. The modularity goal is *much* easier when the engine speaks JavaScript modules.

### 3.2 The Modular Engine: "Mindcore"

The engine should be designed as a set of independent, swappable systems that communicate through a shared event bus and entity store. This is the key to your modularity and modding goals.

```
┌─────────────────────────────────────────────────┐
│                   MINDCORE                       │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │Perception│  │ Emotion  │  │   Mastery    │   │
│  │ System   │  │ System   │  │   System     │   │
│  └────┬─────┘  └────┬─────┘  └──────┬───────┘   │
│       │              │               │           │
│       └──────────┬───┴───────────────┘           │
│                  │                                │
│           ┌──────▼──────┐                        │
│           │  Event Bus  │                        │
│           └──────┬──────┘                        │
│                  │                                │
│  ┌───────┬──────┼──────┬──────────┐              │
│  │       │      │      │          │              │
│  ▼       ▼      ▼      ▼          ▼              │
│ World  Render  Audio  Narrative  AI Bridge       │
│ State  Engine  Engine  Engine    (optional)       │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │          Mod / Story Layer               │    │
│  │   (loadable content packs & scripts)     │    │
│  └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

**Key design principles:**
- Every system is a plugin that registers with the event bus
- World state is a single, serializable data structure (enables save/load, replay, time-rewind)
- Mods are just new systems + content packs loaded at runtime
- The AI Bridge is one more system, not a special case — it listens to events and emits events like everything else

### 3.3 Core Systems — Deep Dive

#### A. Perception System (Pillar: Directed Focus)
This is the most unique system and the heart of the game.

**How it works:**
- The world contains far more than the player can see at any moment
- What the player looks at, clicks on, hovers over, or names gets "observed"
- Observed things gain *coherence* — they become more detailed, interactive, and persistent
- Unobserved things *decohere* — they blur, simplify, or shift when you're not looking
- This is not random — it follows consistent rules that the player can learn

**Technical implementation:**
- Every entity has an `observation_level` (0.0 = quantum fog, 1.0 = fully real)
- A "gaze raycaster" tracks what the player is looking at each frame
- Observation decays over time when not attended to
- Entities can have "observation thresholds" — they only reveal behaviors at certain levels
- The world literally renders differently based on observation state (shader-driven)

**Why this is fun:**
- It creates genuine discovery — you find things by *paying attention*, not by following quest markers
- It naturally produces different playthroughs — two players focusing on different things see different worlds
- It's the parable made literal: your attention creates your reality

#### B. Emotion System (Pillar: Emotional Commitment)
Not a mood meter. An actual system of resonance between the player and the world.

**How it works:**
- Player actions carry *emotional signatures* based on context and choice patterns
- The world has emotional states that resonate or clash with the player's
- Resonance amplifies effects; dissonance creates resistance or surprise
- Emotional states aren't labeled with words — they're expressed through color, sound, physics, and behavior

**Technical implementation:**
- Emotions modeled as vectors in a multi-dimensional space (not discrete categories)
- Player's emotional vector is inferred from: choice speed, exploration patterns, interaction style, revisitation behavior
- World entities have emotional "fields" that interact with the player's vector
- Resonance = dot product alignment → amplification effects
- No explicit UI for emotions — the player *feels* it through the world's response

**Design constraint:** The player should never see a number or label for their emotions. The system is invisible. They only experience its effects.

#### C. Mastery System (Pillar: Diligent Effort)
Not an XP bar. A system of compounding returns and non-linear breakthroughs.

**How it works:**
- Every action domain (e.g., "shaping stone," "listening to wind," "navigating darkness") has a hidden mastery curve
- Early repetition yields small improvements
- At certain thresholds, breakthroughs unlock qualitatively new abilities — not just stat boosts
- Mastery in one domain can create unexpected synergies with others
- Abandoned practices slowly atrophy (but faster to re-learn)

**Technical implementation:**
- Mastery modeled as sigmoid curves with plateau → breakthrough → plateau patterns
- Cross-domain synergy matrix (configurable per mod/story)
- Breakthroughs trigger world-state changes, not just player-stat changes
- Practice detection is nuanced — rote repetition yields less than intentional variation

#### D. Seed System (The Constellation)
The player's first act of consciousness — and their first act of directed focus.

**How it works:**
- Before the world exists, the player enters a dark space containing a **constellation of orbs**
- Each orb has a distinct visual identity: color, pulse pattern, luminosity, movement behavior
- The player selects one (or a small cluster), and that selection becomes the **seed** for their playthrough
- The seed biases the starting world state — which entities are closer to coherence, which emotional frequencies are dominant, which mastery domains have early affordances
- Seeds are *not* character classes or difficulty modes — they're more like tuning forks that set the initial resonance of reality

**What the seed affects:**
- Initial observation landscape (what's nearly visible vs. deeply hidden)
- Starting emotional field of the world (warm/cool, tense/calm, curious/guarded)
- Which mastery domains present early opportunities
- Subtle narrative seeding (which "realizations" are closer to the surface)

**Design philosophy:**
- In v1, seeds are unlabeled — the player chooses based purely on visual/intuitive attraction (this *is* the parable: your first choice shapes your reality, and you make it based on feeling, not information)
- In later versions, labels or hints can be added for accessibility and replayability
- Seeds are data-driven and moddable — story packs can define their own constellation
- The constellation itself can evolve across playthroughs (seeds the player has chosen before might look different)

**Technical implementation:**
- A `seed` is a JSON config: initial entity observation levels, emotion vector biases, mastery affordance weights, narrative flags
- The constellation UI is a standalone Three.js scene (could double as a menu/title screen)
- Seed selection emits a `seed_selected` event on the bus; all systems read their initial state from it
- Seed configs live in the story pack, making them fully moddable

---

## 4. Content & Narrative Architecture

### 4.1 The Base Story: "Awakening"
The first story/campaign that ships with v1. It teaches the systems through experience.

**Premise:** You wake in a space that is barely there — a fog of potential. As you observe, feel, and act, a world coalesces around you. But other forces are also observing, feeling, and acting. The world you build is shared — or contested — with presences you can't fully see.

**Structure:** Not linear acts. Instead, a web of **realizations** — moments where the player understands something new about how the world works. These can happen in any order. The "ending" depends on which realizations you've had, how deeply you've invested, and what kind of world you've built.

**Narrative delivery:** No cutscenes, no dialogue boxes. Story emerges from: environmental storytelling, the behavior of entities, patterns the player notices, and (with AI integration) responsive, contextual text woven into the world itself.

### 4.2 Story/Mod Format
Stories are content packs that include:
- Entity definitions (new things in the world)
- System configurations (tweak perception decay rates, emotion mappings, mastery curves)
- Event scripts (trigger sequences based on world state)
- Asset bundles (models, textures, sounds)
- Narrative fragments (text, contextual descriptions)

**File format:** JSON manifests + asset folders. Stories can depend on other stories (expansion model).

---

## 5. AI Integration Plan

### 5.1 Philosophy
AI isn't a gimmick here. It's the system that makes the "consciousness" theme come alive. The AI is another mind in the game — not omniscient, not a character, but a *responsive presence* that makes the world feel genuinely aware.

### 5.2 Integration Points

| Feature | AI Role | Implementation |
|---------|---------|---------------|
| **Dynamic world narration** | Generates contextual, poetic descriptions of what the player is experiencing | LLM API call triggered by observation events; text appears in-world, not in UI |
| **Emergent entity behavior** | Entities can "think" and respond in novel ways beyond scripted logic | Lightweight LLM inference for entity decision-making at key moments |
| **Dream sequences** | Fully AI-generated environments based on the player's accumulated state | API call with full player state → generates environment description → procedural generation from description |
| **The Mirror** | An in-game entity that reflects the player's patterns back to them | LLM analyzes player behavior patterns and generates reflective, Socratic observations |
| **Mod creation assist** | AI helps players create their own stories/mods through natural language | Separate tooling — Claude API integration in the mod editor |

### 5.3 Technical Approach
- All AI calls go through the **AI Bridge** system on the event bus
- Calls are async and non-blocking — the game never pauses waiting for AI
- Responses are cached and reused where possible
- The game is fully playable without AI (graceful degradation to scripted fallbacks)
- AI context includes: current world state, player's emotional vector, observation history, mastery profile

---

## 6. Multiplayer Vision (Phase 2+)

### 6.1 Concept: Shared Reality
When multiplayer arrives, the core question becomes: *what happens when two minds observe the same world?*

- Each player's perception system is independent — they literally see different versions of the same space
- Where perceptions overlap, reality is stronger (co-observation)
- Where they conflict, reality is unstable (observation interference)
- Emotional resonance between players creates shared experiences
- This is cooperative by default but naturally produces interesting tension

### 6.2 Technical Approach
- Server-authoritative world state with client-side perception filtering
- WebSocket or WebRTC for real-time sync
- Each player's observation and emotion state is private; only world-state effects are shared
- Start with 2-player co-op before scaling

---

## 7. Development Phases

### Phase 0: Foundation (Weeks 1–4)
- [ ] Set up TypeScript + Vite + Three.js project scaffold
- [ ] Implement ECS core (entities, components, systems, event bus)
- [ ] Build basic first-person camera and movement
- [ ] Create world state serialization (save/load from day one)
- [ ] Establish the mod/plugin loading architecture
- [ ] Build seed constellation scene (orb rendering, selection interaction)
- [ ] Implement seed config format and `seed_selected` event flow
- **Deliverable:** A player can walk around in an empty 3D space. Systems can be registered and communicate. World state saves and loads. Seed selection flows into world initialization.

### Phase 1: The Perception System (Weeks 5–8)
- [ ] Implement gaze raycasting and observation tracking
- [ ] Build observation level component and decay logic
- [ ] Create shader pipeline for observation-dependent rendering (fog ↔ detail)
- [ ] Design and place 20+ entities with varying observation thresholds
- [ ] Playtest the core loop: look → observe → discover
- **Deliverable:** Walking around a world where things come into focus when you look at them, and fade when you don't. Discovery feels magical.

### Phase 2: Emotion & Mastery (Weeks 9–14)
- [ ] Implement emotion vector system and inference from player behavior
- [ ] Build emotional field components for world entities
- [ ] Create resonance/dissonance effects (visual, audio, behavioral)
- [ ] Implement mastery tracking with sigmoid curves and breakthrough events
- [ ] Design cross-domain synergy matrix for base story
- [ ] Integrate all three systems — perception, emotion, mastery feeding each other
- **Deliverable:** The world responds to how you feel and what you practice. Breakthroughs transform the environment.

### Phase 3: Content & Narrative (Weeks 15–20)
- [ ] Build the "Awakening" base story content
- [ ] Create environmental storytelling assets and placements
- [ ] Implement realization tracking and ending conditions
- [ ] Design and build 3–5 distinct world regions
- [ ] Sound design for emotional states and observation levels
- [ ] Playtest full loop with outside testers
- **Deliverable:** A complete, compelling 2–4 hour experience.

### Phase 4: AI Integration (Weeks 21–26)
- [ ] Build the AI Bridge system on the event bus
- [ ] Implement dynamic world narration (observation-triggered)
- [ ] Create The Mirror entity with behavioral analysis
- [ ] Build dream sequence generator
- [ ] Design graceful degradation (no-AI fallbacks for all features)
- [ ] Load test and optimize API call patterns
- **Deliverable:** The world feels alive and aware. AI enhances without creating dependency.

### Phase 5: Polish & Modding (Weeks 27–32)
- [ ] Build mod editor / story creation tools
- [ ] Document the modding API and story format
- [ ] Performance optimization pass
- [ ] Accessibility review
- [ ] Final art and sound pass
- [ ] Package for web distribution
- **Deliverable:** Shippable v1.0 with modding support.

### Phase 6: Multiplayer (Phase 2 — separate timeline)
- [ ] Design shared-reality protocol
- [ ] Implement server-authoritative state sync
- [ ] Build perception divergence rendering
- [ ] 2-player co-op testing
- [ ] Scale considerations

---

## 8. Open Questions & Decisions Needed

These are choices that will shape the project significantly. We should resolve them early:

1. **Art style** — Abstract/minimalist (faster, reinforces "reality is what you make it") vs. naturalistic (more immersive, harder to produce)?
2. **Audio engine** — Web Audio API (built-in, limited) vs. Tone.js or FMOD/Wwise (richer, more complex)?
3. **Scope of v1** — Is 2–4 hours right for the base story, or should we aim shorter (1 hour) for a tighter proof of concept?
4. **AI provider** — Claude API, OpenAI, local models, or abstracted to support multiple?
5. **Monetization** — Free with paid expansions? Paid upfront? Free with optional AI features?
6. **Solo dev or team?** — This plan assumes 1–2 developers. More people would compress the timeline but add coordination cost.
7. **Name** — Is "Minds" the final name? (Important for branding, domain, etc.)

---

## 9. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Perception system feels gimmicky, not deep | Medium | Critical | Extensive early prototyping in Phase 1; playtest heavily before moving on |
| Emotion inference feels wrong or invasive | Medium | High | Keep it invisible; never label emotions; err toward subtlety |
| AI integration adds latency that breaks flow | High | Medium | All AI calls are async with scripted fallbacks; aggressive caching |
| Scope creep from modularity ambitions | High | High | Ship base story first; modding tools are Phase 5, not Phase 1 |
| WebGL performance with observation-dependent rendering | Medium | Medium | LOD strategy; budget observation shader effects early |
| Replay value doesn't materialize | Low | Critical | The emergent systems must genuinely produce different outcomes; verify with metrics in playtesting |

---

## 10. Session Handoff Protocol

When starting a new chat session on this project, paste this summary:

> **Project:** Minds, The Game
> **Type:** First-person emergent exploration/simulation (web-first, TypeScript + Three.js)
> **Core parable:** You create your own reality through directed focus, emotional commitment, and diligent effort
> **Three systems:** Perception (attention → reality), Emotion (resonance → amplification), Mastery (practice → breakthrough)
> **Engine:** "Mindcore" — modular ECS with event bus, plugin architecture, mod support
> **AI:** Integrated as one more system on the event bus — dynamic narration, The Mirror, dream sequences
> **Current phase:** [UPDATE THIS]
> **Refer to:** Full project plan in Project Knowledge

---

*This document should be updated as decisions are made. Version it by changing the date and version number at the top.*