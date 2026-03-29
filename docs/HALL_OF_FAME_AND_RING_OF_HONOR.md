# Hall of Fame & Ring of Honor Systems

This document describes how the two legacy recognition systems work in the football simulation.

---

## Overview

The simulation has two distinct legacy systems:

- **Hall of Fame (HoF)** — League-wide career achievement. A player can be inducted once.
- **Ring of Honor (RoH)** — Team-specific legacy. A player can appear in multiple teams' Rings of Honor.

Both use **era-relative scoring** based on seasonal league rankings rather than fixed career stat thresholds, so a dominant player from Year 1 is evaluated the same as one from Year 20.

---

## Era-Relative Scoring (Core Concept)

Instead of "reach 50,000 passing yards for the Hall," players earn points by **ranking against their contemporaries each season**.

For every season a player participates, the system:
1. Gathers all players league-wide who recorded that stat
2. Ranks them by value (descending)
3. Awards points based on where the player finished

**HoF Seasonal Rank Points:**

| Finish | Points |
|--------|--------|
| 1st | 6 |
| 2nd-3rd | 4 |
| 4th-5th | 2 |
| 6th-10th | 1 |

**RoH Seasonal Rank Points:**

| Finish | Points |
|--------|--------|
| 1st | 5 |
| 2nd-3rd | 3 |
| 4th-5th | 2 |
| 6th-10th | 1 |

This is the **primary scoring component** (~60-70% of a typical player's score).

### Position-Specific Stats Tracked

| Position | Stats Ranked |
|----------|-------------|
| QB | Passing Yards, Passing TDs |
| RB | Rushing Yards, Rushing TDs |
| WR | Receiving Yards, Receiving TDs |
| TE | Receiving Yards, Receptions |
| OL | None (awards/longevity path) |
| DL | Sacks |
| LB | Tackles, Sacks |
| CB | Interceptions Caught |
| SAF | Interceptions Caught |
| ST | None (awards/longevity path) |

---

## Hall of Fame Scoring

A player's HoF legacy score is the sum of six components:

### 1. Seasonal League Rankings (~60-70% of score)
Points from era-relative rankings across all seasons played (see above).

### 2. Awards
Points per award earned across entire career:

| Award | Points |
|-------|--------|
| MVP | 25 |
| Offensive Player of Year | 15 |
| Defensive Player of Year | 15 |
| All-Pro 1st Team | 12 |
| All-Pro 2nd Team | 5 |
| Offensive Rookie of Year | 5 |
| Defensive Rookie of Year | 5 |
| Comeback Player | 3 |

### 3. Championships
**12 points** per championship ring.

### 4. Longevity
**2 points** per season played.

### 5. Career Stats (0.3x multiplier)
Career totals are multiplied by position-specific weights, then reduced by a 0.3x multiplier to keep seasonal dominance as the primary driver.

Example weights (before 0.3x):

| Position | Stat | Weight |
|----------|------|--------|
| QB | Passing Yards | 0.018 |
| QB | Passing TDs | 5.0 |
| RB | Rushing Yards | 0.050 |
| RB | Rushing TDs | 6.0 |
| WR | Receiving Yards | 0.050 |
| WR | Receiving TDs | 6.0 |
| DL | Sacks | 10.0 |
| CB | Interceptions | 12.0 |

OL and ST have zero stat weights — they qualify through awards and longevity.

### 6. All-Time Career Rank Bonus
Bonus for finishing in the all-time career stat leaderboard:

| All-Time Rank | Bonus |
|---------------|-------|
| Top 3 | 15 pts |
| Top 5 | 10 pts |
| Top 10 | 5 pts |

### Induction

- **Threshold:** 150 points
- **Timing:** Evaluated during each offseason for all retired players not yet inducted
- **Single induction:** A player enters the Hall once, period

---

## Ring of Honor Scoring

Team-specific legacy uses the same framework but scoped to a player's tenure with one team.

### Key Differences from HoF

| Aspect | HoF | RoH |
|--------|-----|-----|
| Scope | All teams, all seasons | Single team only |
| Induction threshold | 150 pts | 55 pts |
| Jersey retirement | N/A | 100 pts |
| Multi-induction | No | Yes (one per team) |
| Seasonal rank pts (1st) | 6 | 5 |
| Championship pts | 12 | 10 |
| Award pts (MVP) | 25 | 20 |
| Loyalty bonus | None | Yes |

### Loyalty Bonus (RoH only)
Players who stay with a team beyond 3 seasons earn extra points:
- **Formula:** `(seasons_with_team - 3) x 3` points
- A 10-season franchise player earns 21 bonus loyalty points

### Jersey Retirement
If a player's team legacy score reaches **100 points**, their jersey number is retired. This is tracked separately from basic RoH induction (55 pts).

---

## Legacy Tiers

Both active and retired players are classified into tiers based on their current score:

| Score | Tier | UI Color |
|-------|------|----------|
| 150+ | Hall of Famer | Gold |
| 130-149 | Likely Hall of Famer | Purple |
| 100-129 | Strong Candidate | Emerald |
| 70-99 | Building a Case | Blue |
| 40-69 | Outside Shot | Slate |
| 0-39 | No Case | Dark |

These tiers appear as colored meter bars in the player detail page and the HoF watch list.

---

## UI Display

### Player Detail Page
- **HoF Tracker** — meter bar showing score vs 150 threshold, colored by tier
- **RoH Tracker** — meter bar showing team-specific score vs 55/100 thresholds
- **HoF Badge** — gold star icon if inducted

### Dashboard
- **HoF Panel** — 4 most recent inductees with name, position, year

### Hall of Fame View (tab)
- **Inducted tab** — filterable by position/team, grouped by induction year, shows full career stats and award counts
- **Watch List tab** — retired players with score >= 40, sorted by score, shows legacy meter

### Ring of Honor View (tab)
- **Team selector** — tabs for each team with RoH entries
- **Position filter** — narrow by position group
- **Table** — name, position, years with team, legacy score, championships, jersey retirement indicator

---

## Data Storage

```
league.history.hallOfFame[]           — Array of HallOfFameEntry
league.history.ringOfHonor[teamId][]  — Map of teamId -> RingOfHonorEntry[]
```

Each entry captures: player ID, name, position, induction year, career stats, award counts, championship count, teams played for, and legacy score/tier.

---

## Quick Reference: All Constants

| Constant | Value | Source |
|----------|-------|--------|
| HoF induction threshold | 150 | config.ts |
| RoH induction threshold | 55 | config.ts |
| RoH jersey retirement | 100 | config.ts |
| Longevity (HoF) | 2 pts/yr | config.ts |
| Longevity (RoH) | 2 pts/yr | config.ts |
| Loyalty threshold | 3 seasons | config.ts |
| Loyalty bonus | 3 pts/yr over threshold | config.ts |
| Championship (HoF) | 12 pts | config.ts |
| Championship (RoH) | 10 pts | config.ts |
| Career stat multiplier | 0.3x | legacy.ts |
| Tier: Hall of Famer | 150+ | config.ts |
| Tier: Likely | 130+ | config.ts |
| Tier: Strong | 100+ | config.ts |
| Tier: Building | 70+ | config.ts |
| Tier: Outside Shot | 40+ | config.ts |
