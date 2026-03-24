import { calcOverall, calcSalary, createPlayer, clamp, type Position, type AnyRatings, type PersonalityRatings, type Player } from '../models/Player';
import { type Team } from '../models/Team';
import { type League, type Draft, type DraftSlot } from '../models/League';
import { calcStandings } from '../models/Standings';
import { buildDepthChart } from '../models/DepthChart';
import { getTeamDirection, posGroup, WANT_COUNTS } from './teamDirection';
import { convertProspectToPlayer } from './scoutingEngine';

// ── Name / position pools ─────────────────────────────────────────────────────

const FIRST_NAMES = [
  'Jordan', 'Marcus', 'Devon', 'Tyler', 'Andre', 'Keaton', 'Jaylen', 'Malik',
  'Darius', 'Trent', 'Calvin', 'Elijah', 'Nate', 'Reggie', 'Byron', 'Corey',
  'Isaiah', 'Damien', 'Trey', 'Zach', 'Cole', 'Aaron', 'Evan', 'Derek',
  'Jalen', 'Ray', 'Omar', 'Brendan', 'Victor', 'Dante',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Davis', 'Miller', 'Wilson', 'Moore',
  'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin',
  'Thompson', 'Robinson', 'Clark', 'Lewis', 'Walker', 'Hall', 'Allen', 'Young',
  'King', 'Wright', 'Hill', 'Scott', 'Green', 'Adams', 'Baker',
];

const POSITION_POOL: Position[] = [
  'QB', 'QB',
  'RB', 'RB', 'RB',
  'WR', 'WR', 'WR', 'WR',
  'TE', 'TE',
  'OT', 'OT', 'OT',
  'OG', 'OG', 'OG',
  'C', 'C',
  'DE', 'DE', 'DE',
  'DT', 'DT', 'DT',
  'OLB', 'OLB', 'OLB',
  'MLB', 'MLB',
  'CB', 'CB', 'CB', 'CB',
  'FS', 'FS',
  'SS', 'SS',
  'K',
  'P',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomName(): string {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}

type Tier = 'elite' | 'starter' | 'depth';

function r(tier: Tier): number {
  const [base, spread]: [number, number] =
    tier === 'elite'   ? [76, 7]  :
    tier === 'starter' ? [63, 9]  :
                         [49, 10];
  return clamp(Math.round(base + (Math.random() - 0.5) * 2 * spread));
}

function personality(tier: Tier): PersonalityRatings {
  return { workEthic: r(tier), loyalty: r(tier), greed: r(tier), discipline: r(tier) };
}

function makeRatings(position: Position, tier: Tier): AnyRatings {
  switch (position) {
    case 'QB': return {
      position: 'QB',
      armStrength: r(tier), pocketPresence: r(tier), mobility: r(tier),
      shortAccuracy: r(tier), mediumAccuracy: r(tier), deepAccuracy: r(tier),
      processing: r(tier), decisionMaking: r(tier),
    };
    case 'RB': return {
      position: 'RB',
      speed: r(tier), acceleration: r(tier), power: r(tier), agility: r(tier),
      vision: r(tier), ballSecurity: r(tier), passBlocking: r(tier), routeRunning: r(tier),
      personality: personality(tier),
    };
    case 'WR': return {
      position: 'WR',
      speed: r(tier), acceleration: r(tier), catching: r(tier), routeRunning: r(tier),
      separation: r(tier), release: r(tier), blocking: r(tier),
      personality: personality(tier),
    };
    case 'TE': return {
      position: 'TE',
      strength: r(tier), speed: r(tier), catching: r(tier), routeRunning: r(tier),
      blocking: r(tier), release: r(tier),
      personality: personality(tier),
    };
    case 'OT': return {
      position: 'OT',
      passBlocking: r(tier), runBlocking: r(tier), strength: r(tier), agility: r(tier), awareness: r(tier),
      personality: personality(tier),
    };
    case 'OG': return {
      position: 'OG',
      passBlocking: r(tier), runBlocking: r(tier), strength: r(tier), agility: r(tier), awareness: r(tier),
      personality: personality(tier),
    };
    case 'C': return {
      position: 'C',
      passBlocking: r(tier), runBlocking: r(tier), strength: r(tier), agility: r(tier), awareness: r(tier),
      personality: personality(tier),
    };
    case 'DE': return {
      position: 'DE',
      passRush: r(tier), runStop: r(tier), strength: r(tier), athleticism: r(tier), motor: r(tier),
      personality: personality(tier),
    };
    case 'DT': return {
      position: 'DT',
      passRush: r(tier), runStop: r(tier), strength: r(tier), athleticism: r(tier), motor: r(tier),
      personality: personality(tier),
    };
    case 'OLB': return {
      position: 'OLB',
      passRush: r(tier), runStop: r(tier), coverage: r(tier), athleticism: r(tier),
      awareness: r(tier), pursuit: r(tier),
      personality: personality(tier),
    };
    case 'MLB': return {
      position: 'MLB',
      passRush: r(tier), runStop: r(tier), coverage: r(tier), athleticism: r(tier),
      awareness: r(tier), pursuit: r(tier),
      personality: personality(tier),
    };
    case 'CB': return {
      position: 'CB',
      manCoverage: r(tier), zoneCoverage: r(tier), ballSkills: r(tier), press: r(tier),
      speed: r(tier), athleticism: r(tier),
      personality: personality(tier),
    };
    case 'FS': return {
      position: 'FS',
      zoneCoverage: r(tier), manCoverage: r(tier), ballSkills: r(tier), range: r(tier),
      hitPower: r(tier), athleticism: r(tier),
      personality: personality(tier),
    };
    case 'SS': return {
      position: 'SS',
      zoneCoverage: r(tier), manCoverage: r(tier), ballSkills: r(tier), range: r(tier),
      hitPower: r(tier), athleticism: r(tier),
      personality: personality(tier),
    };
    case 'K': return {
      position: 'K',
      kickPower: r(tier), kickAccuracy: r(tier), composure: r(tier),
      personality: personality(tier),
    };
    case 'P': return {
      position: 'P',
      kickPower: r(tier), kickAccuracy: r(tier), composure: r(tier),
      personality: personality(tier),
    };
  }
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}


// ── Public API ────────────────────────────────────────────────────────────────

export function generateTieredDraftClass(year: number): Player[] {
  const tiers: { tier: Tier; count: number }[] = [
    { tier: 'elite',   count: 20  },
    { tier: 'starter', count: 130 },
    { tier: 'depth',   count: 130 },
  ];
  let idx = 0;
  const prospects: Player[] = [];
  for (const { tier, count } of tiers) {
    for (let i = 0; i < count; i++) {
      const position = pick(POSITION_POOL);
      const age      = 21 + Math.floor(Math.random() * 3);
      const ratings  = makeRatings(position, tier);
      prospects.push(createPlayer(
        `draft-${year}-${idx}`,
        randomName(),
        position,
        age,
        ratings,
        { scoutingLevel: 15, isRookie: true, yearsRemaining: 3 + Math.floor(Math.random() * 2) },
      ));
      idx++;
    }
  }
  return shuffle(prospects);
}

export function aiPickProspect(available: Player[], team: Team, league: League): Player {
  const direction = getTeamDirection(team, league);

  // Count current roster by group
  const have: Record<string, number> = {};
  for (const p of team.roster) {
    const g = posGroup(p.position);
    have[g] = (have[g] ?? 0) + 1;
  }

  let best: Player = available[0]!;
  let bestScore = -Infinity;
  for (const p of available) {
    const group = posGroup(p.position);
    const want  = WANT_COUNTS[group] ?? 0;
    // Need bonus: missing depth at this position
    const posNeedBonus = Math.max(0, Math.min(15, (want - (have[group] ?? 0)) * 4));
    // Overstock penalty: already well above desired depth, avoid stacking
    const have_now = have[group] ?? 0;
    const overstockPenalty = want > 0 && have_now > want + 1 ? (have_now - want - 1) * 5 : 0;
    // Direction bonus: rebuilders value youth/upside; contenders value immediate impact
    let directionBonus = 0;
    if (direction === 'rebuilding' && p.age <= 22) directionBonus = 5;
    if (direction === 'contender'  && p.age >= 24) directionBonus = 3;

    const score = p.overall + posNeedBonus + directionBonus - overstockPenalty;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return best;
}

export function startDraft(league: League): League {
  const standings  = calcStandings(league.currentSeason);
  const draftOrder = [...standings].reverse().map(s => s.team); // worst record first
  const ROUNDS     = 7;
  const TEAMS      = draftOrder.length;

  const draftYear = league.currentSeason.year + 1;
  const slots: DraftSlot[] = [];
  for (let round = 1; round <= ROUNDS; round++) {
    for (let pick = 1; pick <= TEAMS; pick++) {
      const originalTeam = draftOrder[pick - 1]!;
      const ownerKey     = `${draftYear}:${round}:${originalTeam.id}`;
      const actualTeamId = league.draftPickOwnership[ownerKey] ?? originalTeam.id;
      const actualTeam   = league.teams.find(t => t.id === actualTeamId) ?? originalTeam;
      slots.push({
        round,
        pick,
        overallPick: (round - 1) * TEAMS + pick,
        teamId:      actualTeam.id,
        teamName:    actualTeam.name,
      });
    }
  }

  // Use scouted draft class if available; fall back to legacy generation.
  const prospects  = league.draftClass && league.draftClass.year === draftYear
    ? league.draftClass.prospects.map(convertProspectToPlayer)
    : generateTieredDraftClass(draftYear);
  const draft: Draft = {
    year:           draftYear,
    players:        prospects,
    slots,
    currentSlotIdx: 0,
    complete:       false,
  };

  // Keep draftClass available during the draft so the UI can reference scouting notes.
  // NOTE: CPU picks are NOT auto-advanced here — caller (doAdvance in server.ts) is responsible
  // for calling advanceToUserPick so the flow is explicit and testable.
  return { ...league, phase: 'draft', draft };
}

function applyPick(league: League, playerId: string, teamId: string): League {
  const draft = league.draft!;
  const player = draft.players.find(p => p.id === playerId);
  if (!player) throw new Error(`Player ${playerId} not found in draft pool`);

  const slot         = draft.slots[draft.currentSlotIdx]!;
  const updatedSlot: DraftSlot = {
    ...slot,
    playerId:   player.id,
    playerName: player.name,
    playerPos:  player.position,
  };

  const updatedSlots   = draft.slots.map((s, i) => i === draft.currentSlotIdx ? updatedSlot : s);
  const remainingPlayers = draft.players.filter(p => p.id !== playerId);
  const nextIdx        = draft.currentSlotIdx + 1;
  const isComplete     = nextIdx >= updatedSlots.length;

  const updatedTeams = league.teams.map(t => {
    if (t.id !== teamId) return t;
    const newRoster = [...t.roster, player];
    return {
      ...t,
      roster:     newRoster,
      depthChart: buildDepthChart(newRoster, teamId === league.userTeamId),
    };
  });

  const updatedDraft: Draft = {
    ...draft,
    players:        remainingPlayers,
    slots:          updatedSlots,
    currentSlotIdx: nextIdx,
    complete:       isComplete,
  };

  return { ...league, teams: updatedTeams, draft: updatedDraft };
}

/** Advance all CPU picks until the next user turn (or draft complete). */
export function advanceToUserPick(league: League): League {
  let cur = league;
  while (true) {
    const draft = cur.draft!;
    if (draft.complete || draft.players.length === 0) break;
    const slot = draft.slots[draft.currentSlotIdx]!;
    if (slot.teamId === cur.userTeamId) break;
    const team = cur.teams.find(t => t.id === slot.teamId)!;
    const prospect = aiPickProspect(draft.players, team, cur);
    cur = applyPick(cur, prospect.id, slot.teamId);
  }
  return cur;
}

/** Advance exactly one CPU pick. Returns an error if it is the user's turn. */
export function advanceOneCpuPick(league: League): { league: League; error?: string } {
  const draft = league.draft;
  if (!draft)         return { league, error: 'No active draft.' };
  if (draft.complete) return { league, error: 'Draft is already complete.' };

  const slot = draft.slots[draft.currentSlotIdx]!;
  if (slot.teamId === league.userTeamId)
    return { league, error: 'It is your turn to pick.' };

  const team    = league.teams.find(t => t.id === slot.teamId)!;
  const prospect = aiPickProspect(draft.players, team, league);
  return { league: applyPick(league, prospect.id, slot.teamId) };
}

export function makeDraftPick(league: League, playerId: string): { league: League; error?: string } {
  const draft = league.draft;
  if (!draft)           return { league, error: 'No active draft.' };
  if (draft.complete)   return { league, error: 'Draft is already complete.' };

  const slot = draft.slots[draft.currentSlotIdx]!;
  if (slot.teamId !== league.userTeamId)
    return { league, error: 'It is not your turn to pick.' };

  if (!draft.players.find(p => p.id === playerId))
    return { league, error: 'Player not available in draft pool.' };

  const afterUser = applyPick(league, playerId, league.userTeamId);
  // CPU picks are NOT auto-advanced — the client drives advancement via advance-draft-pick
  // or advance-to-user-pick endpoints so each CPU pick can be observed.
  return { league: afterUser };
}

export function simRemainingDraft(league: League): League {
  let cur = league;
  while (true) {
    const draft = cur.draft!;
    if (draft.complete || draft.players.length === 0) break;
    const slot = draft.slots[draft.currentSlotIdx]!;
    const team = cur.teams.find(t => t.id === slot.teamId)!;
    const prospect = aiPickProspect(draft.players, team, cur);
    cur = applyPick(cur, prospect.id, slot.teamId);
  }
  return cur;
}
