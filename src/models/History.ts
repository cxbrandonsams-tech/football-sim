export type AwardType =
  | 'MVP'
  | 'OPOY'              // Offensive Player of the Year
  | 'DPOY'              // Defensive Player of the Year
  | 'OROY'              // Offensive Rookie of the Year
  | 'DROY'              // Defensive Rookie of the Year
  | 'Coach_of_Year'
  | 'Comeback_Player'   // Comeback Player of the Year
  | 'AllPro1'           // 1st Team All-Pro
  | 'AllPro2'           // 2nd Team All-Pro
  | 'Champion';

export interface AwardRecord {
  type:        AwardType;
  year:        number;
  playerId?:   string;
  playerName?: string;
  coachId?:    string;   // Coach_of_Year only
  coachName?:  string;   // Coach_of_Year only
  teamId?:     string;
  teamName?:   string;
  position?:   string;   // All-Pro position group (e.g. 'QB', 'WR', 'DE')
}

export interface SeasonAwards {
  year:   number;
  awards: AwardRecord[];
}

/** Per-season stat line stored in player history. */
export interface PlayerSeasonStats {
  year:              number;
  teamId:            string;
  teamAbbreviation:  string;
  gamesPlayed:       number;
  // Passing
  completions:       number;
  attempts:          number;
  passingYards:      number;
  passingTDs:        number;
  interceptions:     number;   // thrown
  sacksAllowed:      number;   // sacks taken (QB)
  // Rushing
  carries:           number;
  rushingYards:      number;
  rushingTDs:        number;
  // Receiving
  targets:           number;
  receptions:        number;
  receivingYards:    number;
  receivingTDs:      number;
  // Defense
  sacks:             number;
  interceptionsCaught: number;
  // TODO Phase 3: forcedFumbles, passesDefended, tackles
}

/** Cumulative career stats (derived by summing season history). */
export interface PlayerCareerStats {
  seasons:           number;
  completions:       number;
  attempts:          number;
  passingYards:      number;
  passingTDs:        number;
  interceptions:     number;
  carries:           number;
  rushingYards:      number;
  rushingTDs:        number;
  targets:           number;
  receptions:        number;
  receivingYards:    number;
  receivingTDs:      number;
  sacks:             number;
  interceptionsCaught: number;
}

export interface CoachSeasonRecord {
  year:             number;
  teamId:           string;
  teamName:         string;
  wins:             number;
  losses:           number;
  ties:             number;
  madePlayoffs:     boolean;
  wonChampionship:  boolean;
}

export interface GMRecord {
  year:             number;
  teamId:           string;
  teamName:         string;
  wins:             number;
  losses:           number;
  madePlayoffs:     boolean;
  wonChampionship:  boolean;
}

export interface TeamSeasonHistory {
  year:              number;
  wins:              number;
  losses:            number;
  ties:              number;
  pointsFor:         number;
  pointsAgainst:     number;
  madePlayoffs:      boolean;
  /** Deepest playoff round reached. 'champion' = won it all. */
  championshipRound?: 'wildcard' | 'divisional' | 'conference' | 'championship' | 'champion';
}

export interface RetiredPlayerRecord {
  playerId:       string;
  name:           string;
  position:       string;
  retirementYear: number;
  finalAge:       number;
  finalOverall:   number;
}

// ── Ring of Honor ─────────────────────────────────────────────────────────────

/** A durable snapshot of a player's franchise legacy — stored per team. */
export interface RingOfHonorEntry {
  playerId:              string;
  name:                  string;
  position:              string;
  inductedYear:          number;
  yearsWithTeam:         number;
  teamLegacyScore:       number;
  awardsWithTeam:        Record<string, number>;
  championshipsWithTeam: number;
  /** True if the player cleared the higher jersey-retirement threshold. */
  jerseyRetired:         boolean;
}

// ── Hall of Fame ──────────────────────────────────────────────────────────────

export type LegacyTier =
  | 'none'
  | 'outside_shot'
  | 'building'
  | 'strong'
  | 'likely'
  | 'hall_of_famer';

export interface HallOfFameEntry {
  playerId:      string;
  name:          string;
  position:      string;
  inductionYear: number;
  yearsPlayed:   number;
  legacyScore:   number;
  legacyTier:    LegacyTier;
  careerStats:   PlayerCareerStats;
  awardsCount:   Record<string, number>;  // award type → count
  championships: number;
  teamIds:       string[];
  teamNames:     string[];
}

export interface LeagueHistory {
  seasonAwards:    SeasonAwards[];
  championsByYear: Record<number, { teamId: string; teamName: string }>;
  /** Per-player history: playerId → list of season stat lines (one per year) */
  playerHistory:   Record<string, PlayerSeasonStats[]>;
  /** Per-team history: teamId → list of season records (one per year) */
  teamHistory:     Record<string, TeamSeasonHistory[]>;
  /** Per-coach history: coachId → list of season records (one per year) */
  coachHistory:    Record<string, CoachSeasonRecord[]>;
  /** Players who have retired, in order of retirement. Stat history is in playerHistory. */
  retiredPlayers:  RetiredPlayerRecord[];
  /** Hall of Fame members, in order of induction. */
  hallOfFame:      HallOfFameEntry[];
  /** Ring of Honor — per team, in order of induction. */
  ringOfHonor:     Record<string, RingOfHonorEntry[]>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function emptyLeagueHistory(): LeagueHistory {
  return {
    seasonAwards:    [],
    championsByYear: {},
    playerHistory:   {},
    teamHistory:     {},
    coachHistory:    {},
    retiredPlayers:  [],
    hallOfFame:      [],
    ringOfHonor:     {},
  };
}

export function emptyPlayerCareerStats(): PlayerCareerStats {
  return {
    seasons: 0, completions: 0, attempts: 0, passingYards: 0, passingTDs: 0,
    interceptions: 0, carries: 0, rushingYards: 0, rushingTDs: 0,
    targets: 0, receptions: 0, receivingYards: 0, receivingTDs: 0,
    sacks: 0, interceptionsCaught: 0,
  };
}

/** Derive career stats by summing all season lines for a player. */
export function deriveCareerStats(seasons: PlayerSeasonStats[]): PlayerCareerStats {
  const career = emptyPlayerCareerStats();
  career.seasons = seasons.length;
  for (const s of seasons) {
    career.completions        += s.completions;
    career.attempts           += s.attempts;
    career.passingYards       += s.passingYards;
    career.passingTDs         += s.passingTDs;
    career.interceptions      += s.interceptions;
    career.carries            += s.carries;
    career.rushingYards       += s.rushingYards;
    career.rushingTDs         += s.rushingTDs;
    career.targets            += s.targets;
    career.receptions         += s.receptions;
    career.receivingYards     += s.receivingYards;
    career.receivingTDs       += s.receivingTDs;
    career.sacks              += s.sacks;
    career.interceptionsCaught += s.interceptionsCaught;
  }
  return career;
}
