import { type Player } from './Player';
import { type Coach } from './Coach';
import { type Team } from './Team';
import { type Game } from './Game';
import { type Season, createSeason } from './Season';
import { type LeagueHistory, type PlayerSeasonStats, type GmCareer, emptyLeagueHistory } from './History';
import { type NewsItem } from './News';
import { buildDepthChart } from './DepthChart';
import { type DraftClass } from './Prospect';
import { type CommentaryStyle } from './PlayEvent';

// ── Draft ─────────────────────────────────────────────────────────────────────

export interface DraftSlot {
  round:        number;   // 1–7
  pick:         number;   // 1–32 within the round
  overallPick:  number;   // 1–224 globally
  teamId:       string;
  teamName:     string;
  playerId?:    string;
  playerName?:  string;
  playerPos?:   string;
}

export interface Draft {
  year:           number;
  players:        Player[];    // undrafted prospects; removed as picks are made
  slots:          DraftSlot[];
  currentSlotIdx: number;      // index of next pick to be made
  complete:       boolean;
}

export const OWNER_BUDGET = 30;

// ── Conference / Division structure ──────────────────────────────────────────

export type ConferenceName = 'IC' | 'SC';   // Iron Conference / Shield Conference
export type DivisionName   = 'North' | 'South' | 'East' | 'West';

export interface Division {
  conference: ConferenceName;
  division:   DivisionName;
  teamIds:    string[];
}

// ── Budget ────────────────────────────────────────────────────────────────────

export interface BudgetAllocation {
  scouting:    number;
  development: number;
}

// ── Phase / Bracket ───────────────────────────────────────────────────────────

export type LeaguePhase = 'regular_season' | 'postseason' | 'offseason' | 'draft';

/** All rounds in postseason order plus the terminal 'complete' state. */
export type PlayoffRound = 'wildcard' | 'divisional' | 'conference' | 'championship' | 'complete';

/** One seed entry from the initial playoff field (14 total, 7 per conference). */
export interface PlayoffSeed {
  seed:        number;       // 1–7
  teamId:      string;
  teamName:    string;
  conference:  ConferenceName;
  isDivWinner: boolean;
}

export interface PlayoffMatchup {
  id:           string;
  round:        PlayoffRound;
  /** Absent on the league championship (cross-conference). */
  conference?:  ConferenceName;
  /** Seed number of the home/top team. Lower = better. */
  topSeed:      number;
  bottomSeed:   number;
  topSeedId:    string;
  bottomSeedId: string;
  game?:        Game;
  winnerId?:    string;
  /** Seed of the winner, carried forward for next-round re-seeding. */
  winnerSeed?:  number;
}

export interface PlayoffBracket {
  year:            number;
  currentRound:    PlayoffRound;
  /** All 14 initial seeds (7 IC + 7 SC). Immutable after bracket creation. */
  seeds:           PlayoffSeed[];
  matchups:        PlayoffMatchup[];
  icChampionId?:   string;
  scChampionId?:   string;
  championId?:     string;
  championName?:   string;
}

export interface SeasonRecord {
  year:          number;
  championId:    string;
  championName:  string;
}

// ── Activity / Notification / Trade ──────────────────────────────────────────

export interface Activity {
  id:        string;
  message:   string;
  createdAt: number;
}

export interface LeagueNotification {
  id:        string;
  teamId:    string;
  message:   string;
  createdAt: number;
  read:      boolean;
}

export type TradeAsset =
  | { type: 'player'; playerId: string; playerName: string; playerPos: string; playerOvr: number }
  | { type: 'pick'; year: number; round: number; originalTeamId: string; originalTeamName: string };

export interface TradeProposal {
  id:         string;
  fromTeamId: string;
  toTeamId:   string;
  fromAssets: TradeAsset[];   // what fromTeam gives to toTeam
  toAssets:   TradeAsset[];   // what toTeam gives to fromTeam
  status:     'pending' | 'accepted' | 'rejected';
  /** Set when the proposal is resolved (accepted or rejected). */
  completedAt?:    number;   // epoch ms
  completedWeek?:  number;
  completedPhase?: string;
}

// ── League meta profile ──────────────────────────────────────────────────────

export interface MetaProfile {
  passRate:   number;  // 0–1 league-wide pass rate
  runRate:    number;  // 0–1
  deepRate:   number;  // 0–1 fraction of passes that are deep
  totalCalls: number;
}

// ── League ────────────────────────────────────────────────────────────────────

export interface League {
  id:                   string;
  name:                 string;
  displayName:          string;
  visibility:           'public' | 'private';
  commissionerId:       string;
  inviteCode?:          string;
  maxUsers?:            number;
  advanceSchedule?:     string;
  lastAdvanceTime?:     number;
  phase:                LeaguePhase;
  playoff?:             PlayoffBracket;
  draft?:               Draft;
  seasonHistory:        SeasonRecord[];
  history:              LeagueHistory;          // full awards + champions log
  divisions:            Division[];             // conference/division structure
  activities:           Activity[];
  tradeProposals:       TradeProposal[];
  notifications:        LeagueNotification[];
  /** "${year}:${round}:${originalTeamId}" → ownerTeamId; only entries that differ from default ownership. */
  draftPickOwnership:   Record<string, string>;
  teams:                Team[];
  userTeamId:           string;
  currentSeason:        Season;
  currentWeek:          number;
  freeAgents:           Player[];
  /** Current-season accumulated player stats — refreshed after each week. Keyed by player.id. */
  currentSeasonStats:   Record<string, PlayerSeasonStats>;
  /** News feed — most recent items first, capped at 500. */
  news:                 NewsItem[];
  /** Milestone deduplication: playerId → array of milestone keys already fired (e.g. "passingYards:1000"). */
  milestonesHit:        Record<string, string[]>;
  commentaryStyle?:     CommentaryStyle;
  ownerBudget:          number;
  budgetAllocation:     BudgetAllocation;
  aiBudgetAllocations:  Record<string, BudgetAllocation>;
  scoutingBudget:       number;
  developmentBudget:    number;
  /** Pre-draft prospect pool, generated at the start of each offseason. */
  draftClass?:          DraftClass;
  /** Pool of unemployed coaches available for hire. */
  unemployedCoaches:    Coach[];
  /** GM career tracking — present whenever a user manages a team in this league. */
  gmCareer?:            GmCareer;
  /** League-wide offensive meta profile — computed each week from all teams' playStats. */
  metaProfile?:         MetaProfile;
  /** College football data for the current draft cycle (standings, leaders). */
  collegeData?:         import('./College').CollegeData;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_ALLOCATION: BudgetAllocation = { scouting: 15, development: 15 };

export interface LeagueOptions {
  displayName?:     string;
  visibility?:      'public' | 'private';
  commissionerId?:  string;
  inviteCode?:      string;
  maxUsers?:        number;
  advanceSchedule?: string;
  divisions?:       Division[];
}

export function createLeague(
  id:         string,
  name:       string,
  teams:      Team[],
  userTeamId: string,
  year:       number,
  options:    LeagueOptions = {},
): League {
  const preparedTeams = teams.map(t =>
    t.id === userTeamId
      ? { ...t, depthChart: buildDepthChart(t.roster, true) }
      : t
  );

  return {
    id,
    name,
    displayName:        options.displayName    ?? name,
    visibility:         options.visibility     ?? 'public',
    commissionerId:     options.commissionerId ?? '',
    ...(options.inviteCode      !== undefined && { inviteCode:      options.inviteCode }),
    ...(options.maxUsers        !== undefined && { maxUsers:        options.maxUsers }),
    ...(options.advanceSchedule !== undefined && { advanceSchedule: options.advanceSchedule }),
    phase:              'regular_season',
    seasonHistory:      [],
    history:            emptyLeagueHistory(),
    divisions:          options.divisions ?? [],
    activities:         [],
    tradeProposals:     [],
    notifications:      [],
    draftPickOwnership: {},
    teams:              preparedTeams,
    userTeamId,
    currentSeason:      createSeason(year, preparedTeams, options.divisions ?? []),
    currentWeek:        1,
    freeAgents:         [],
    currentSeasonStats: {},
    ownerBudget:        OWNER_BUDGET,
    budgetAllocation:   DEFAULT_ALLOCATION,
    aiBudgetAllocations: {},
    scoutingBudget:     DEFAULT_ALLOCATION.scouting,
    developmentBudget:  DEFAULT_ALLOCATION.development,
    news:               [],
    milestonesHit:      {},
    unemployedCoaches:  [],
  };
}

/**
 * Resolve the user's team within a league.
 * In multiplayer: pass userId to find team by ownerId.
 * Falls back to league.userTeamId for single-player / CLI usage.
 */
export function getUserTeam(league: League, userId?: string): Team {
  if (userId) {
    const owned = league.teams.find(t => t.ownerId === userId);
    if (owned) return owned;
  }
  const team = league.teams.find(t => t.id === league.userTeamId);
  if (!team) throw new Error(`User team ${league.userTeamId} not found in league`);
  return team;
}

export function getWeekGames(league: League, week: number): Game[] {
  return league.currentSeason.games.filter(g => g.week === week);
}

export function getCompletedGames(league: League): Game[] {
  return league.currentSeason.games.filter(g => g.status === 'final');
}

/** Find all teams in the same division as the given team. */
export function getDivisionTeams(league: League, teamId: string): Team[] {
  const div = league.divisions.find(d => d.teamIds.includes(teamId));
  if (!div) return [];
  return league.teams.filter(t => div.teamIds.includes(t.id));
}
