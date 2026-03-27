# NEXT STEPS — Active Issues + Actions

> Updated: 2026-03-27
> **ENGINE LOCKED — Calibration complete. No further play-resolution tuning.**

---

## Engine Phase: CLOSED

All play-resolution calibration is complete. The issues below were evaluated and closed.
See `ENGINE_STATE.md` for the final metrics snapshot and rationale.

### P1 — Scoring deficit (21.4 vs 22.0 floor)
**Closed — accepted.** `offenseAdvantage` locked at 0.065. Increasing to 0.070 would push
pass yards and completion% out of range. Structural gap is within real-world NFL variance.

### P2 — WR leader inflation
**Closed — resolved.** WR leader now 1,891 (target 1,500–1,900 ✓). Achieved by moving
ROLE_MULT to config and reducing WR1 multipliers + increasing target weight noise.

### P3 — RZ TD% high (65.1%)
**Closed — accepted structural issue.** Drive endpoint bias. Do not tune directly.

### P4 — All-scrimmage 20+ borderline
**Closed — resolved.** Now at 6.0 (at floor, within range ✓).

---

## Next Phase: Higher-Level Systems

Focus shifts from simulation accuracy to gameplay depth and content systems.

### Candidates (not prioritized — for future session planning)

- **Player archetypes** — distinct playstyle identities beyond ratings (pocket passer vs. scrambler,
  power back vs. receiving back, zone-scheme CB vs. press-man, etc.)
- **Progression system review** — ensure player development curves feel meaningful over a 10-year
  franchise; aging curves, breakout seasons, decline
- **Route-based playbook system** — was shelved; may revisit when design is ready
- **Scouting depth** — draft class uncertainty, bust/breakout variance
- **Trade AI improvements** — smarter team-need evaluation, win-now vs. rebuild logic
- **Contract/cap improvements** — cap pressure, dead money, extensions

---

## Do Not Touch (locked — see LOCKED_VALUES.md)

- All play-resolution constants in `config.ts`
- `offenseAdvantage` (locked at 0.065)
- Explosive play system (`bigPlay`, `breakawayUpgrade*`, `yacBreakaway*`)
- `baseYACYards`, `coverageResistance`, `baseSackChance`
- Red zone penalties
- `TUNING.personnel.roleMult`
- `targetWeightExponent`, `targetWeightNoise`
