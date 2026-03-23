import { type Position, createPlayer } from '../models/Player';
import { type Team } from '../models/Team';
import { type Standing } from '../models/Standings';

export interface DraftPick {
  round: number;
  pick: number;
  team: Team;
  player: ReturnType<typeof createPlayer>;
}

// ── Name pool ─────────────────────────────────────────────────────────────────

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

// Weighted position pool — roughly proportional to real roster composition
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

function randRating(): number {
  // Rookies range from 40–80, weighted toward 50–70
  return Math.max(40, Math.min(80, Math.round(45 + Math.random() * 30 + Math.random() * 10)));
}

let draftIdCounter = 1;

function randomName(): string {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateDraftClass(year: number, count = 40): ReturnType<typeof createPlayer>[] {
  draftIdCounter = 1;
  return Array.from({ length: count }, () => {
    const position = pick(POSITION_POOL);
    const age = 21 + Math.floor(Math.random() * 3); // 21–23
    return createPlayer(
      `draft-${year}-${draftIdCounter++}`,
      randomName(),
      position,
      age,
      { skill: randRating(), athleticism: randRating(), iq: randRating() },
      { scoutingLevel: 10, yearsRemaining: 4 },
    );
  });
}

// Returns teams in draft order: worst record first
export function getDraftOrder(standings: Standing[]): Team[] {
  return [...standings].reverse().map(s => s.team);
}
