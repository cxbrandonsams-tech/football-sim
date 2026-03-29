# DOCS GUARDRAILS — Behavioral Contract

> **This is not a design document. This is a behavioral contract.**
> It defines strict rules for how developers and AI assistants are permitted to modify this project.
> Violations of these rules can break engine calibration, corrupt game balance, or create unmaintainable code.

---

## 1. Core Principles

**These are LOCKED. They are not suggestions.**

| Principle | Status |
|-----------|--------|
| The simulation engine is **complete and locked**. | NON-NEGOTIABLE |
| No engine tuning occurs unless the user **explicitly requests it**. | NON-NEGOTIABLE |
| Realism over arcade behavior, always. | NON-NEGOTIABLE |
| No duplicate systems. One system owns each responsibility. | NON-NEGOTIABLE |
| Single source of truth per domain. If two docs disagree, one is wrong. | NON-NEGOTIABLE |
| Every player rating must affect simulation. No decorative stats. | NON-NEGOTIABLE |
| All tuning constants live in `config.ts`. No hardcoded magic numbers in engine functions. | NON-NEGOTIABLE |

---

## 2. Document Ownership Rules

Every system in this project has exactly one canonical document. That document is the **source of truth**. Other documents may reference or summarize, but they do not define.

| Document | Owns | Authority |
|----------|------|-----------|
| `ENGINE_STATE.md` | Engine validation metrics, accepted structural gaps, engine architecture notes | Final word on what the engine produces and why |
| `LOCKED_VALUES.md` | Every frozen constant in `config.ts` | Final word on what values are set and their lock status |
| `TUNING_LOG.md` | Chronological history of every calibration change | Final word on why values were changed |
| `game-design.md` | Player ratings, overall formulas, simulation pipeline phases | Final word on how ratings map to engine behavior |
| `FRANCHISE_SOURCE_OF_TRUTH.md` | League structure, coaching, awards, history, playbook architecture, product philosophy | Final word on non-engine game design |
| `NEXT_STEPS.md` | Development roadmap and priorities | Final word on what to build next — NOT a design spec |
| `ARCHITECTURE.md` | System design, data model, persistence, deployment, multi-league isolation | Final word on how the system is built |
| `PLAYBOOKS_AND_FORMATIONS.md` | Formation definitions, play structure, bucket logic, selection pipeline | Final word on playbook implementation details |
| `CLAUDE.md` | Developer instructions, codebase conventions, deployment procedures | Final word on how to work in this repo |

### Rules

1. **No system should be defined in more than one place.** If league structure is described in both `FRANCHISE_SOURCE_OF_TRUTH.md` and `ARCHITECTURE.md`, the franchise doc owns the design; the architecture doc may describe the data model shape but defers to the franchise doc for design intent.

2. **Summaries are allowed; definitions are not.** `NEXT_STEPS.md` may say "engine is locked" as a summary, but `ENGINE_STATE.md` is where that decision is documented and justified.

3. **When two documents conflict, the designated owner wins.** If `CLAUDE.md` says one thing about playbook design and `FRANCHISE_SOURCE_OF_TRUTH.md` says another, the franchise doc wins. Fix the conflict — do not leave it.

4. **`NEXT_STEPS.md` is a roadmap, not a design authority.** It describes what to build, not how. It cannot override design decisions in other docs.

---

## 3. Engine Protection Rules

**CRITICAL — Read this section in full before touching any file in `src/engine/`.**

### DO NOT

- Modify play resolution formulas (`simulatePlay`, pass/run pipelines)
- Adjust success probabilities, yard distributions, or outcome weights
- Change sack, fumble, interception, or penalty calculations
- Add new randomness sources to the core engine
- Alter the statistical output profile of the simulation
- Modify any value listed in `LOCKED_VALUES.md`
- "Fix" engine output that "looks wrong" without explicit user approval
- Add new engine phases or modify the phase execution order

### UNLESS

The user **explicitly requests** engine tuning with clear intent. Phrases like "the engine seems off" or "scores look low" are observations, not requests. Do not act on them without confirmation.

### If a proposed change touches engine logic

**STOP.** Before proceeding:

1. State which engine file and function would be modified
2. Explain what the change would do to simulation output
3. Identify which values in `LOCKED_VALUES.md` would be affected
4. Wait for explicit user confirmation

This applies even if the change seems minor. A single constant change can shift dozens of downstream metrics.

---

## 4. Change Safety Workflow

Before making **any** change to this project, follow this checklist:

### Step 1: Identify ownership
Which document owns the system being changed? (See Section 2.)

### Step 2: Verify lock status
Is the system LOCKED? Check:
- `ENGINE_STATE.md` — is the engine locked? (Yes.)
- `LOCKED_VALUES.md` — is the specific value frozen?
- `FRANCHISE_SOURCE_OF_TRUTH.md` — is the section marked LOCKED?

If LOCKED: **do not modify without explicit user request.**

### Step 3: Check for conflicts
Does the proposed change contradict any existing document? Search for the relevant concept across all docs before proceeding.

### Step 4: Confirm philosophy alignment
Does the change align with:
- Realism over arcade behavior?
- Existing pipeline architecture?
- Single-source-of-truth discipline?

### If any step fails

**STOP and ask.** Do not guess. Do not interpret creatively. Do not assume the user would want it.

---

## 5. Anti-Patterns

**The following are strictly forbidden.**

### Arcade mechanics
- Do not add "momentum" systems, "clutch" bonuses, rubber-banding, or comeback mechanics that override realistic probability.
- Do not add hidden multipliers that make games artificially close or dramatic.
- If a feature makes the simulation less realistic to make it more "fun," it violates core principles.

### Duplicate systems
- Do not create a parallel playbook system alongside the existing one.
- Do not create a second rating system, a second scouting system, or a second trade system.
- If a system already exists, extend it. Do not rebuild it.

### Ignoring locked values
- Do not change a value in `config.ts` without checking `LOCKED_VALUES.md`.
- Do not assume a value is safe to change because it is not marked LOCKED — check the doc first.
- "I'll just adjust it slightly" is not an exemption.

### Treating NEXT_STEPS.md as a design spec
- `NEXT_STEPS.md` says what to build, not how to build it.
- If it says "add player archetypes," that does not authorize inventing an archetype system without checking `game-design.md` and `FRANCHISE_SOURCE_OF_TRUTH.md` first.

### Reactive engine tuning
- "The stats look off" is not a reason to change the engine.
- "The user's team keeps losing" is not a reason to change the engine.
- "Scores seem low" is not a reason to change the engine.
- The engine was validated against 1000+ games vs. NFL baselines. Anecdotal observations from small samples do not override that.

### Inventing new documentation
- Do not create new doc files that overlap with existing ones.
- If you need to document something, identify the correct existing doc and add it there.
- The documentation map in `ARCHITECTURE.md` Section 4 is the authority on which doc owns what.

---

## 6. Safe Extension Guidelines

New features should extend existing systems, not replace them.

### Extend, don't replace
- Adding a new formation? Add it to the `OFFENSIVE_FORMATIONS` array. Do not create a new formation system.
- Adding a new play type? It must map to an existing `PlayType` that the engine understands. Do not invent new engine play types.
- Adding a new tendency slider? Add it to `TeamTendencies`. Do not create a parallel tendencies model.

### Respect existing pipelines
- Play selection goes through `resolvePlay()` → `selectOffensivePlay()` → `weightedPick()`. New modifiers (like context or meta) are multipliers in the existing weight pipeline. They do not bypass it.
- The engine receives a `PlayType` and returns a `PlayEvent`. Nothing above the engine should modify how the engine resolves a play once it receives the type.

### Keep systems composable
- New features should plug into existing interfaces.
- If a feature requires changing a core interface (e.g., adding a field to `Team`), that is allowed — but the field should be optional and the system should degrade gracefully when it is absent (backward compatibility with existing leagues).

### Maintain determinism where possible
- The simulation engine uses `Math.random()` for probabilistic outcomes. This is acceptable.
- Presentation-layer randomness (commentary templates, recap headlines) should use deterministic seeding based on game/play data to prevent re-render flickering.
- Do not add randomness to systems that should be deterministic (e.g., rating calculations, overall formulas, trade valuations).

---

## 7. AI-Specific Instructions

**These instructions apply to Claude Code and any other AI assistant working on this codebase.**

### Do not "improve" locked systems
- If a system is working and locked, do not refactor it, optimize it, or "clean it up."
- Do not add error handling, type annotations, or documentation to engine files unless explicitly asked.
- The engine code is frozen. Leave it alone.

### Do not reinterpret documentation creatively
- If a doc says "do not modify," that means do not modify. It does not mean "modify carefully" or "modify if you think it's an improvement."
- If a doc says a system is "deprecated," that means do not use it or extend it. It does not mean "modernize it."
- Read docs literally, not aspirationally.

### Follow ownership strictly
- Before modifying any system, identify which doc owns it.
- If you cannot determine ownership, ask.
- Do not spread a system's definition across multiple files or documents.

### When unsure, ask
- If a task seems to conflict with these guardrails, stop and state the conflict.
- If a task is ambiguous about whether it touches engine logic, ask for clarification.
- If you are about to modify a file in `src/engine/`, pause and confirm.
- "I wasn't sure so I went ahead" is never acceptable. "I wasn't sure so I asked" always is.

### Do not add features beyond what was requested
- If asked to add a scouting report, add a scouting report. Do not also add a mock draft system, a prospect comparison tool, and a trade suggestion engine.
- Scope creep is a bug, not a feature.
- If a natural extension seems obvious, mention it. Do not build it.

### Do not create documentation for documentation's sake
- Do not add README files, CONTRIBUTING guides, or architectural decision records unless asked.
- Do not add JSDoc comments, inline documentation, or type annotations to files you did not modify.
- The project has a documentation system. Use it. Do not create a parallel one.

---

## Summary

This document exists because:
1. The engine was calibrated over multiple sessions against NFL statistical baselines. A single careless change can invalidate that work.
2. The documentation system has clear ownership boundaries. Violating them creates contradictions that compound over time.
3. AI assistants are powerful but literal-minded. Without explicit guardrails, they will "improve" things that should not be touched.

**When in doubt: stop, check the docs, and ask.**

---

*This contract applies to all contributors — human and AI. It is enforced by the project owner.*
