// ── Position-specific ratings (mirroring backend models/Player.ts) ────────────

export interface PersonalityRatings {
  workEthic:  number;
  loyalty:    number;
  greed:      number;
  discipline: number;
}

export interface QBRatings {
  position: 'QB';
  // Visible to GM via scouting
  armStrength:    number;
  pocketPresence: number;
  mobility:       number;
  // Hidden fields are set to 50 in scoutedRatings; do not display to user
  shortAccuracy:  number;
  mediumAccuracy: number;
  deepAccuracy:   number;
  processing:     number;
  decisionMaking: number;
}

export interface RBRatings {
  position: 'RB';
  speed:        number;
  acceleration: number;
  power:        number;
  agility:      number;
  vision:       number;
  ballSecurity: number;
  passBlocking: number;
  routeRunning: number;
  personality:  PersonalityRatings;
}

export interface WRRatings {
  position: 'WR';
  speed:        number;
  acceleration: number;
  catching:     number;
  routeRunning: number;
  separation:   number;
  release:      number;
  blocking:     number;
  personality:  PersonalityRatings;
}

export interface TERatings {
  position: 'TE';
  strength:     number;
  speed:        number;
  catching:     number;
  routeRunning: number;
  blocking:     number;
  release:      number;
  personality:  PersonalityRatings;
}

export interface OLRatings {
  position: 'OT' | 'OG' | 'C';
  passBlocking: number;
  runBlocking:  number;
  strength:     number;
  agility:      number;
  awareness:    number;
  personality:  PersonalityRatings;
}

export interface DLRatings {
  position: 'DE' | 'DT';
  passRush:    number;
  runStop:     number;
  strength:    number;
  athleticism: number;
  motor:       number;
  personality: PersonalityRatings;
}

export interface LBRatings {
  position: 'OLB' | 'MLB';
  passRush:    number;
  runStop:     number;
  coverage:    number;
  athleticism: number;
  awareness:   number;
  pursuit:     number;
  personality: PersonalityRatings;
}

export interface CBRatings {
  position: 'CB';
  manCoverage:  number;
  zoneCoverage: number;
  ballSkills:   number;
  press:        number;
  speed:        number;
  athleticism:  number;
  personality:  PersonalityRatings;
}

export interface SafetyRatings {
  position: 'FS' | 'SS';
  zoneCoverage: number;
  manCoverage:  number;
  ballSkills:   number;
  range:        number;
  hitPower:     number;
  athleticism:  number;
  personality:  PersonalityRatings;
}

export interface SpecialTeamsRatings {
  position: 'K' | 'P';
  kickPower:    number;
  kickAccuracy: number;
  composure:    number;
  personality:  PersonalityRatings;
}

export type AnyRatings =
  | QBRatings
  | RBRatings
  | WRRatings
  | TERatings
  | OLRatings
  | DLRatings
  | LBRatings
  | CBRatings
  | SafetyRatings
  | SpecialTeamsRatings;

/** Extract the visible (non-hidden) ratings for display. For QB, omits hidden sub-ratings. */
export function getVisibleRatings(ratings: AnyRatings): Record<string, number> {
  switch (ratings.position) {
    case 'QB':
      return {
        'Arm Str':    ratings.armStrength,
        'Pocket':     ratings.pocketPresence,
        'Mobility':   ratings.mobility,
      };
    case 'RB':
      return {
        Speed:        ratings.speed,
        Accel:        ratings.acceleration,
        Power:        ratings.power,
        Agility:      ratings.agility,
        Vision:       ratings.vision,
        'Ball Sec':   ratings.ballSecurity,
      };
    case 'WR':
      return {
        Speed:        ratings.speed,
        Catching:     ratings.catching,
        'Route Run':  ratings.routeRunning,
        Separation:   ratings.separation,
        Release:      ratings.release,
      };
    case 'TE':
      return {
        Catching:     ratings.catching,
        'Route Run':  ratings.routeRunning,
        Blocking:     ratings.blocking,
        Strength:     ratings.strength,
        Speed:        ratings.speed,
      };
    case 'OT':
    case 'OG':
    case 'C':
      return {
        'Pass Blk':   ratings.passBlocking,
        'Run Blk':    ratings.runBlocking,
        Strength:     ratings.strength,
        Agility:      ratings.agility,
        Awareness:    ratings.awareness,
      };
    case 'DE':
    case 'DT':
      return {
        'Pass Rush':  ratings.passRush,
        'Run Stop':   ratings.runStop,
        Strength:     ratings.strength,
        Athleticism:  ratings.athleticism,
        Motor:        ratings.motor,
      };
    case 'OLB':
    case 'MLB':
      return {
        'Run Stop':   ratings.runStop,
        Coverage:     ratings.coverage,
        Athleticism:  ratings.athleticism,
        Awareness:    ratings.awareness,
        Pursuit:      ratings.pursuit,
      };
    case 'CB':
      return {
        'Man Cov':    ratings.manCoverage,
        'Zone Cov':   ratings.zoneCoverage,
        'Ball Skl':   ratings.ballSkills,
        Press:        ratings.press,
        Speed:        ratings.speed,
      };
    case 'FS':
    case 'SS':
      return {
        'Zone Cov':   ratings.zoneCoverage,
        Range:        ratings.range,
        Athleticism:  ratings.athleticism,
        'Hit Power':  ratings.hitPower,
        'Ball Skl':   ratings.ballSkills,
      };
    case 'K':
    case 'P':
      return {
        'Kick Pwr':   ratings.kickPower,
        'Kick Acc':   ratings.kickAccuracy,
        Composure:    ratings.composure,
      };
  }
}

// ── Player ────────────────────────────────────────────────────────────────────

export interface Player {
  id:                   string;
  name:                 string;
  position:             string;
  age:                  number;
  scoutedOverall:       number;
  scoutedRatings:       AnyRatings;
  salary:               number;
  yearsRemaining:       number;
  injuryWeeksRemaining: number;
  scoutingLevel:        number;
  stamina:              number;
  isRookie?:            boolean;
  contractDemand?:      { salary: number; years: number };
}

// ── Team ──────────────────────────────────────────────────────────────────────

export type OffensiveScheme =
  | 'balanced'
  | 'short_passing'
  | 'deep_passing'
  | 'run_inside'
  | 'run_outside';

export type DefensiveScheme =
  | 'balanced'
  | 'run_focus'
  | 'speed_defense'
  | 'stop_short_pass'
  | 'stop_deep_pass'
  | 'aggressive';

export interface PlaycallingWeights {
  /** Percentage of plays that are runs (0–100) */
  runPct:        number;
  /** Of run plays, percentage that are inside runs (0–100) */
  insideRunPct:  number;
  /** Of pass plays, percentage that are short passes (0–100) */
  shortPassPct:  number;
  /** Of pass plays, percentage that are medium passes (0–100) */
  mediumPassPct: number;
}

export interface Coach {
  id:               string;
  name:             string;
  role:             'HC' | 'OC' | 'DC';
  overall:          number;
  offensiveScheme?: OffensiveScheme;
  defensiveScheme?: DefensiveScheme;
}

export interface CoachingStaff {
  hc: Coach;
  oc: Coach;
  dc: Coach;
}

// ── Gameplan ──────────────────────────────────────────────────────────────────

export type DefensiveFocus    = 'balanced' | 'stop_inside_run' | 'stop_outside_run' | 'stop_short_pass' | 'stop_deep_pass';
export type OffensivePlaybook = 'balanced' | 'spread' | 'power_run' | 'vertical' | 'west_coast';
export type DefensivePlaybook = 'balanced' | 'four_three' | 'three_four' | 'nickel_heavy' | 'zone_heavy';
export type Tempo             = 'slow' | 'normal' | 'fast';
export type PlayActionUsage   = 'low' | 'medium' | 'high';
export type PassEmphasis      = 'conservative' | 'balanced' | 'aggressive';
export type RunEmphasis       = 'light' | 'balanced' | 'heavy';

export interface GameplanSettings {
  passEmphasis:      PassEmphasis;
  runEmphasis:       RunEmphasis;
  tempo:             Tempo;
  playAction:        PlayActionUsage;
  defensiveFocus:    DefensiveFocus;
  offensivePlaybook: OffensivePlaybook;
  defensivePlaybook: DefensivePlaybook;
}

export const DEFAULT_GAMEPLAN: GameplanSettings = {
  passEmphasis:      'balanced',
  runEmphasis:       'balanced',
  tempo:             'normal',
  playAction:        'medium',
  defensiveFocus:    'balanced',
  offensivePlaybook: 'balanced',
  defensivePlaybook: 'balanced',
};

// ── Team ──────────────────────────────────────────────────────────────────────

export interface Team {
  id:           string;
  name:         string;
  abbreviation: string;
  ownerId?:     string;
  roster:       Player[];
  depthChart?:  Record<string, (Player | null)[]>;
  coaches:      CoachingStaff;
  playcalling:  PlaycallingWeights;
  gameplan?:    GameplanSettings;
}

// ── Game events ───────────────────────────────────────────────────────────────

export type PlayType =
  | 'inside_run' | 'outside_run'
  | 'short_pass' | 'medium_pass' | 'deep_pass'
  | 'sack' | 'interception' | 'fumble'
  | 'field_goal' | 'punt';

export type PlayResult =
  | 'success' | 'fail' | 'touchdown' | 'turnover'
  | 'field_goal_good' | 'field_goal_miss';

export interface PlayEvent {
  type:           PlayType;
  offenseTeamId:  string;
  defenseTeamId:  string;
  result:         PlayResult;
  yards:          number;
  quarter:        number;
  down:           number;
  distance:       number;
  yardLine:       number;
  firstDown?:     boolean;
  ballCarrier?:   string;       // last name (display)
  target?:        string;       // last name (display)
  ballCarrierId?: string;       // player.id
  targetId?:      string;       // player.id
  defPlayerId?:   string;       // player.id of defensive player
}

// ── Box score ──────────────────────────────────────────────────────────────────

export interface PlayerGameStats {
  playerId:           string;
  name:               string;
  teamId:             string;
  completions:        number;
  attempts:           number;
  passingYards:       number;
  passingTDs:         number;
  interceptions:      number;
  sacksAllowed:       number;
  carries:            number;
  rushingYards:       number;
  rushingTDs:         number;
  targets:            number;
  receptions:         number;
  receivingYards:     number;
  receivingTDs:       number;
  sacks:              number;
  interceptionsCaught: number;
}

export interface TeamGameStats {
  teamId:          string;
  score:           number;
  pointsByQuarter: [number, number, number, number];
  totalYards:      number;
  rushingYards:    number;
  passingYards:    number;
  firstDowns:      number;
  turnovers:       number;
  sacksAllowed:    number;
}

export interface GameBoxScore {
  home:    TeamGameStats;
  away:    TeamGameStats;
  players: Record<string, PlayerGameStats>; // keyed by player.id
}

// ── Season stats ───────────────────────────────────────────────────────────────

export interface PlayerSeasonStats {
  year:              number;
  teamId:            string;
  teamAbbreviation:  string;
  gamesPlayed:       number;
  completions:       number;
  attempts:          number;
  passingYards:      number;
  passingTDs:        number;
  interceptions:     number;
  sacksAllowed:      number;
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

export interface Game {
  id:        string;
  week:      number;
  homeTeam:  Team;
  awayTeam:  Team;
  homeScore: number;
  awayScore: number;
  status:    'scheduled' | 'in_progress' | 'final';
  events:    PlayEvent[];
  boxScore?: GameBoxScore;
}

export interface Season {
  year:  number;
  games: Game[];
}

// ── Awards & history ──────────────────────────────────────────────────────────

export type AwardType =
  | 'MVP'
  | 'OPOY'
  | 'DPOY'
  | 'OROY'
  | 'DROY'
  | 'Coach_of_Year'
  | 'Comeback_Player'
  | 'AllPro1'
  | 'AllPro2'
  | 'Champion';

export interface AwardRecord {
  type:        AwardType;
  year:        number;
  playerId?:   string;
  playerName?: string;
  coachId?:    string;
  coachName?:  string;
  teamId?:     string;
  teamName?:   string;
  position?:   string; // All-Pro position group
}

export interface SeasonAwards {
  year:   number;
  awards: AwardRecord[];
}

export interface CoachSeasonRecord {
  year:            number;
  teamId:          string;
  teamName:        string;
  wins:            number;
  losses:          number;
  ties:            number;
  madePlayoffs:    boolean;
  wonChampionship: boolean;
}

export interface TeamSeasonHistory {
  year:               number;
  wins:               number;
  losses:             number;
  ties:               number;
  pointsFor:          number;
  pointsAgainst:      number;
  madePlayoffs:       boolean;
  championshipRound?: 'semifinal' | 'championship' | 'champion';
}

export interface PlayerSeasonHistoryLine {
  year:             number;
  teamId:           string;
  teamAbbreviation: string;
  gamesPlayed:      number;
  passingYards:     number;
  passingTDs:       number;
  interceptions:    number;
  rushingYards:     number;
  rushingTDs:       number;
  receivingYards:   number;
  receivingTDs:     number;
  receptions:       number;
  sacks:            number;
  interceptionsCaught: number;
}

export interface RetiredPlayerRecord {
  playerId:       string;
  name:           string;
  position:       string;
  retirementYear: number;
  finalAge:       number;
  finalOverall:   number;
}

export interface LeagueHistory {
  seasonAwards:    SeasonAwards[];
  championsByYear: Record<number, { teamId: string; teamName: string }>;
  playerHistory:   Record<string, PlayerSeasonHistoryLine[]>;
  teamHistory:     Record<string, TeamSeasonHistory[]>;
  coachHistory:    Record<string, CoachSeasonRecord[]>;
  retiredPlayers:  RetiredPlayerRecord[];
}

// ── League ────────────────────────────────────────────────────────────────────

export type LeaguePhase = 'regular_season' | 'postseason' | 'offseason' | 'draft';

export interface DraftSlot {
  round:       number;
  pick:        number;
  overallPick: number;
  teamId:      string;
  teamName:    string;
  playerId?:   string;
  playerName?: string;
  playerPos?:  string;
}

export interface Draft {
  year:           number;
  players:        Player[];
  slots:          DraftSlot[];
  currentSlotIdx: number;
  complete:       boolean;
}

export type PlayoffRound = 'wildcard' | 'divisional' | 'conference' | 'championship';

export interface PlayoffMatchup {
  id:            string;
  round:         PlayoffRound;
  topSeedId:     string;
  bottomSeedId:  string;
  topSeed?:      number;
  bottomSeed?:   number;
  winnerSeed?:   number;
  conference?:   'IC' | 'SC';
  game?:         Game;
  winnerId?:     string;
}

export interface PlayoffBracket {
  year:           number;
  currentRound:   PlayoffRound | 'complete';
  matchups:       PlayoffMatchup[];
  icChampionId?:  string;
  scChampionId?:  string;
  championId?:    string;
  championName?:  string;
}

export interface Division {
  conference: 'IC' | 'SC';
  division:   'North' | 'South' | 'East' | 'West';
  teamIds:    string[];
}

export interface SeasonRecord {
  year:         number;
  championId:   string;
  championName: string;
}

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
  fromAssets: TradeAsset[];
  toAssets:   TradeAsset[];
  status:     'pending' | 'accepted' | 'rejected';
}

// ── News ──────────────────────────────────────────────────────────────────────

export type NewsType =
  | 'game_result'
  | 'playoff_result'
  | 'championship'
  | 'award'
  | 'signing'
  | 'trade'
  | 'retirement';

export interface NewsItem {
  id:        string;
  type:      NewsType;
  headline:  string;
  body:      string;
  week:      number;
  year:      number;
  createdAt: number;
  teamIds:   string[];
  playerIds: string[];
}

// ── League ────────────────────────────────────────────────────────────────────

export interface League {
  id:                   string;
  name:                 string;
  displayName:          string;
  visibility:           'public' | 'private';
  commissionerId?:      string;
  inviteCode?:          string;
  maxUsers?:            number;
  advanceSchedule?:     string;
  phase:                LeaguePhase;
  playoff?:             PlayoffBracket;
  draft?:               Draft;
  seasonHistory:        SeasonRecord[];
  history:              LeagueHistory;
  activities:           Activity[];
  tradeProposals:       TradeProposal[];
  notifications:        LeagueNotification[];
  draftPickOwnership?:  Record<string, string>;
  teams:                Team[];
  userTeamId:           string;
  currentSeason:        Season;
  currentWeek:          number;
  freeAgents:           Player[];
  divisions:            Division[];
  currentSeasonStats:   Record<string, PlayerSeasonStats>;
  scoutingBudget:       number;
  developmentBudget:    number;
  ownerBudget:          number;
  news:                 NewsItem[];
}

// ── Standings ─────────────────────────────────────────────────────────────────

export interface Standing {
  team: Team;
  w:    number;
  l:    number;
  t:    number;
  pf:   number;
  pa:   number;
}

export function computeStandings(league: League): Standing[] {
  const map = new Map<string, Standing>();
  for (const team of league.teams) {
    map.set(team.id, { team, w: 0, l: 0, t: 0, pf: 0, pa: 0 });
  }
  for (const game of league.currentSeason.games) {
    if (game.status !== 'final') continue;
    const home = map.get(game.homeTeam.id)!;
    const away = map.get(game.awayTeam.id)!;
    home.pf += game.homeScore; home.pa += game.awayScore;
    away.pf += game.awayScore; away.pa += game.homeScore;
    if (game.homeScore > game.awayScore)      { home.w++; away.l++; }
    else if (game.awayScore > game.homeScore) { away.w++; home.l++; }
    else                                       { home.t++; away.t++; }
  }
  return [...map.values()].sort(
    (a, b) => b.w - a.w || (b.pf - b.pa) - (a.pf - a.pa),
  );
}
