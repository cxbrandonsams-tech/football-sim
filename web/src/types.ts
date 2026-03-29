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
  // Accuracy sub-ratings — visible to GM (GDD: Accuracy is the primary QB visible category)
  shortAccuracy:  number;
  mediumAccuracy: number;
  deepAccuracy:   number;
  processing:     number;
  decisionMaking: number;
}

export interface RBRatings {
  position: 'RB';
  speed:        number;
  elusiveness:  number;
  power:        number;
  vision:       number;
  ballSecurity: number;
  personality:  PersonalityRatings;
}

export interface WRRatings {
  position: 'WR';
  speed:        number;
  routeRunning: number;
  hands:        number;
  yac:          number;
  size:         number;
  personality:  PersonalityRatings;
}

export interface TERatings {
  position: 'TE';
  speed:        number;
  routeRunning: number;
  hands:        number;
  yac:          number;
  size:         number;
  blocking:     number;
  personality:  PersonalityRatings;
}

export interface OLRatings {
  position: 'OT' | 'OG' | 'C';
  passBlocking: number;
  runBlocking:  number;
  awareness:    number;
  discipline:   number;
  personality:  PersonalityRatings;
}

export interface DLRatings {
  position: 'DE' | 'DT';
  passRush:    number;
  runDefense:  number;
  discipline:  number;
  personality: PersonalityRatings;
}

export interface LBRatings {
  position: 'OLB' | 'MLB';
  passRush:    number;
  runDefense:  number;
  coverage:    number;
  speed:       number;
  pursuit:     number;
  awareness:   number;
  discipline:  number;
  personality: PersonalityRatings;
}

export interface CBRatings {
  position: 'CB';
  manCoverage:  number;
  zoneCoverage: number;
  ballSkills:   number;
  speed:        number;
  size:         number;
  awareness:    number;
  discipline:   number;
  tackling:     number;
  personality:  PersonalityRatings;
}

export interface SafetyRatings {
  position: 'FS' | 'SS';
  // Range is a hidden derived stat (speed*0.6 + awareness*0.4) — NOT stored, NOT shown in UI
  manCoverage:  number;
  zoneCoverage: number;
  ballSkills:   number;
  speed:        number;
  size:         number;
  awareness:    number;
  discipline:   number;
  tackling:     number;
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
        'Arm Str':   ratings.armStrength,
        'Pocket':    ratings.pocketPresence,
        'Mobility':  ratings.mobility,
        'Acc (Sh)':  ratings.shortAccuracy,
        'Acc (Med)': ratings.mediumAccuracy,
        'Acc (Dp)':  ratings.deepAccuracy,
      };
    case 'RB':
      return {
        Speed:        ratings.speed,
        Elusiveness:  ratings.elusiveness,
        Power:        ratings.power,
        Vision:       ratings.vision,
        'Ball Sec':   ratings.ballSecurity,
      };
    case 'WR':
      return {
        Speed:        ratings.speed,
        'Route Run':  ratings.routeRunning,
        Hands:        ratings.hands,
        YAC:          ratings.yac,
        Size:         ratings.size,
      };
    case 'TE':
      return {
        Hands:        ratings.hands,
        'Route Run':  ratings.routeRunning,
        Blocking:     ratings.blocking,
        YAC:          ratings.yac,
        Speed:        ratings.speed,
      };
    case 'OT':
    case 'OG':
    case 'C':
      return {
        'Pass Blk':   ratings.passBlocking,
        'Run Blk':    ratings.runBlocking,
        Awareness:    ratings.awareness,
      };
    case 'DE':
    case 'DT':
      return {
        'Pass Rush':  ratings.passRush,
        'Run Def':    ratings.runDefense,
        Discipline:   ratings.discipline,
      };
    case 'OLB':
    case 'MLB':
      return {
        'Run Def':    ratings.runDefense,
        Coverage:     ratings.coverage,
        Speed:        ratings.speed,
        Pursuit:      ratings.pursuit,
        Awareness:    ratings.awareness,
      };
    case 'CB':
      // Range is hidden/derived — NOT shown; awareness + speed drive it implicitly
      return {
        'Man Cov':    ratings.manCoverage,
        'Zone Cov':   ratings.zoneCoverage,
        Speed:        ratings.speed,
        'Ball Skl':   ratings.ballSkills,
        Awareness:    ratings.awareness,
      };
    case 'FS':
    case 'SS':
      // Range is hidden/derived (speed*0.6 + awareness*0.4) — NOT shown per GDD
      return {
        'Zone Cov':   ratings.zoneCoverage,
        'Man Cov':    ratings.manCoverage,
        Speed:        ratings.speed,
        Awareness:    ratings.awareness,
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

// ── Scouting / Prospects ─────────────────────────────────────────────────────

export interface HeadScout {
  id:      string;
  name:    string;
  overall: number;
}

export type ScoutConfidence = 'low' | 'medium' | 'high';

export interface ScoutingReport {
  projectedRound: { min: number; max: number };
  grade:          string;
  strengths:      string[];
  weaknesses:     string[];
  confidence:     ScoutConfidence;
  notes:          string;
}

export interface ProspectScoutingState {
  prospectId:  string;
  scoutLevel:  0 | 1 | 2 | 3;
  pointsSpent: number;
  report:      ScoutingReport | null;
}

/** Prospect as received from the server — hidden fields (trueOverall etc.) are stripped. */
export type CombineStockMove = 'rising' | 'falling' | 'neutral';

export interface CombineResults {
  fortyYard:    number;
  benchPress:   number;
  vertJump:     number;
  broadJump:    number;
  threeCone:    number;
  shuttle:      number;
  stockMove:    CombineStockMove;
  headline:     string;
}

export interface ClientProspect {
  id:       string;
  name:     string;
  position: string;
  age:      number;
  college:  string;
  height:   string;
  weight:   number;
  combine?: CombineResults;
}

export interface DraftClass {
  year:      number;
  prospects: ClientProspect[];
}

// ── Salary cap ────────────────────────────────────────────────────────────────

export const CAP_LIMIT = 420;

// ── Player ────────────────────────────────────────────────────────────────────

export type DevTrait = 'superDev' | 'normal' | 'lateBloomer' | 'bust' | 'declining';

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
  devTrait:             DevTrait;
  yearsPro:             number;
  isRookie?:            boolean;
  contractDemand?:      { salary: number; years: number };
  college?:             string;
  prospectId?:          string;
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

export type CoachPersonality = 'conservative' | 'balanced' | 'aggressive';

export type CoachTrait =
  | 'talent_evaluator'
  | 'contract_negotiator'
  | 'offensive_pioneer'
  | 'quarterback_guru'
  | 'run_game_specialist'
  | 'defensive_architect'
  | 'pass_rush_specialist'
  | 'turnover_machine'
  | 'player_developer'
  | 'youth_developer'
  | 'veteran_stabilizer';

export interface Coach {
  id:               string;
  name:             string;
  role:             'HC' | 'OC' | 'DC';
  overall:          number;
  offensiveScheme?: OffensiveScheme;
  defensiveScheme?: DefensiveScheme;
  personality?:     CoachPersonality;
  trait?:           CoachTrait;
}

export interface CoachingStaff {
  hc: Coach;
  oc: Coach | null;
  dc: Coach | null;
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

// ── Play effectiveness stats ─────────────────────────────────────────────────

export interface PlayEffStats {
  calls:      number;
  totalYards: number;
  successes:  number;
  firstDowns: number;
  touchdowns: number;
  turnovers:  number;
}

// ── Team tendencies ──────────────────────────────────────────────────────────

export interface TeamTendencies {
  runPassBias:        number;
  aggressiveness:     number;
  playActionRate:     number;
  shotPlayRate:       number;
  blitzRate:          number;
  coverageAggression: number;
  runCommitment:      number;
}

export const DEFAULT_TENDENCIES: TeamTendencies = {
  runPassBias:        50,
  aggressiveness:     50,
  playActionRate:     50,
  shotPlayRate:       50,
  blitzRate:          50,
  coverageAggression: 50,
  runCommitment:      50,
};

// ── Coach archetypes ────────────────────────────────────────────────────────

export interface CoachArchetype {
  id:          string;
  name:        string;
  description: string;
  tendencies:  TeamTendencies;
}

export const COACH_ARCHETYPES: CoachArchetype[] = [
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'No strong lean in any direction — adapts to personnel.',
    tendencies: { runPassBias: 50, aggressiveness: 50, playActionRate: 50, shotPlayRate: 50, blitzRate: 50, coverageAggression: 50, runCommitment: 50 },
  },
  {
    id: 'west_coast',
    name: 'West Coast',
    description: 'Short, high-percentage passes to control the clock and move chains.',
    tendencies: { runPassBias: 62, aggressiveness: 30, playActionRate: 55, shotPlayRate: 25, blitzRate: 45, coverageAggression: 45, runCommitment: 45 },
  },
  {
    id: 'vertical',
    name: 'Vertical',
    description: 'Push the ball downfield with deep shots and aggressive play calls.',
    tendencies: { runPassBias: 68, aggressiveness: 78, playActionRate: 40, shotPlayRate: 75, blitzRate: 55, coverageAggression: 55, runCommitment: 40 },
  },
  {
    id: 'run_heavy',
    name: 'Run Heavy',
    description: 'Pound the rock, control time of possession, and wear down defenses.',
    tendencies: { runPassBias: 25, aggressiveness: 35, playActionRate: 60, shotPlayRate: 30, blitzRate: 45, coverageAggression: 40, runCommitment: 60 },
  },
  {
    id: 'play_action',
    name: 'Play Action',
    description: 'Lean on a credible run threat to open up the passing game.',
    tendencies: { runPassBias: 40, aggressiveness: 58, playActionRate: 82, shotPlayRate: 55, blitzRate: 50, coverageAggression: 50, runCommitment: 50 },
  },
  {
    id: 'aggressive_defense',
    name: 'Aggressive Defense',
    description: 'Blitz-heavy, press coverage — generate turnovers and disrupt the QB.',
    tendencies: { runPassBias: 50, aggressiveness: 50, playActionRate: 50, shotPlayRate: 50, blitzRate: 78, coverageAggression: 75, runCommitment: 45 },
  },
  {
    id: 'coverage_defense',
    name: 'Coverage Defense',
    description: 'Sit back in zone, take away big plays, and let the pass rush get home.',
    tendencies: { runPassBias: 50, aggressiveness: 50, playActionRate: 50, shotPlayRate: 50, blitzRate: 25, coverageAggression: 28, runCommitment: 40 },
  },
  {
    id: 'run_stop_defense',
    name: 'Run Stop Defense',
    description: 'Stack the box and shut down the ground game — dare them to throw.',
    tendencies: { runPassBias: 50, aggressiveness: 50, playActionRate: 50, shotPlayRate: 50, blitzRate: 55, coverageAggression: 45, runCommitment: 80 },
  },
];

// ── Front-office personality ──────────────────────────────────────────────────

export type FrontOfficePersonality =
  | 'balanced'
  | 'aggressive'
  | 'conservative'
  | 'win_now'
  | 'rebuilder'
  | 'development';

// ── Team ──────────────────────────────────────────────────────────────────────

export interface Team {
  id:             string;
  name:           string;
  abbreviation:   string;
  ownerId?:       string;
  roster:         Player[];
  depthChart?:    Record<string, (Player | null)[]>;
  coaches:        CoachingStaff;
  playcalling:    PlaycallingWeights;
  gameplan?:          GameplanSettings;
  tendencies?:        TeamTendencies;
  formationDepthCharts?: Record<string, Partial<Record<OffensiveSlot, string | null>>>;
  offensivePlan?:        OffensivePlan;
  packageDepthCharts?:   Record<string, Partial<Record<DefensiveSlot, string | null>>>;
  defensivePlan?:        DefensivePlan;
  playStats?: Record<string, PlayEffStats>;
  bucketStats?: Record<string, Record<string, PlayEffStats>>;
  customOffensivePlays?: OffensivePlay[];
  customOffensivePlaybooks?: Playbook[];
  customDefensivePlays?: DefensivePlay[];
  customDefensivePlaybooks?: DefPlaybook[];
  scout?:         HeadScout;
  scoutingBudget?: number;
  scoutingPoints?: number;
  scoutingData?:  Record<string, ProspectScoutingState>;
  draftBoard?:    string[];
  /** Persistent front-office building philosophy. */
  frontOffice?:   FrontOfficePersonality;
}

// ── Game events ───────────────────────────────────────────────────────────────

export type PlayType =
  | 'inside_run' | 'outside_run'
  | 'short_pass' | 'medium_pass' | 'deep_pass'
  | 'sack' | 'scramble' | 'interception' | 'fumble'
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
  explanation?:   string[];    // play selection reasoning
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
  tackles:            number;
}

export interface ScoringPlay {
  quarter:    number;
  teamId:     string;
  type:       'touchdown_run' | 'touchdown_pass' | 'touchdown_return' | 'field_goal';
  /** playerId of the ball carrier (RB/QB on runs; receiver on passing TDs; kicker on FGs) */
  scorerId:   string;
  /** playerId of the QB on passing TDs */
  assistId?:  string;
  yards:      number;
  homeScore:  number;
  awayScore:  number;
  /** Index of the source PlayEvent in the game's events[] array */
  eventIndex: number;
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
  home:         TeamGameStats;
  away:         TeamGameStats;
  players:      Record<string, PlayerGameStats>; // keyed by player.id
  scoringPlays: ScoringPlay[];
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
  tackles:           number;
}

export interface Game {
  id:        string;
  week:      number;
  homeTeam:  Team;
  awayTeam:  Team;
  homeScore: number;
  awayScore: number;
  status:    'scheduled' | 'in_progress' | 'final';
  /** Absent for completed games in the league blob; fetch via GET /league/:id/game/:gameId/events */
  events?:   PlayEvent[];
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
  tackles:          number;
}

export interface RetiredPlayerRecord {
  playerId:       string;
  name:           string;
  position:       string;
  retirementYear: number;
  finalAge:       number;
  finalOverall:   number;
}

export type LegacyTier = 'none' | 'outside_shot' | 'building' | 'strong' | 'likely' | 'hall_of_famer';

export interface HofCareerStats {
  seasons:             number;
  passingYards:        number;
  passingTDs:          number;
  rushingYards:        number;
  rushingTDs:          number;
  receivingYards:      number;
  receivingTDs:        number;
  receptions:          number;
  sacks:               number;
  interceptionsCaught: number;
}

// ── Ring of Honor ─────────────────────────────────────────────────────────────

export interface RingOfHonorEntry {
  playerId:              string;
  name:                  string;
  position:              string;
  inductedYear:          number;
  yearsWithTeam:         number;
  teamLegacyScore:       number;
  awardsWithTeam:        Record<string, number>;
  championshipsWithTeam: number;
  jerseyRetired:         boolean;
}

export interface HallOfFameEntry {
  playerId:      string;
  name:          string;
  position:      string;
  inductionYear: number;
  yearsPlayed:   number;
  legacyScore:   number;
  legacyTier:    LegacyTier;
  careerStats:   HofCareerStats;
  awardsCount:   Record<string, number>;
  championships: number;
  teamIds:       string[];
  teamNames:     string[];
}

export interface LeagueHistory {
  seasonAwards:    SeasonAwards[];
  championsByYear: Record<number, { teamId: string; teamName: string }>;
  playerHistory:   Record<string, PlayerSeasonHistoryLine[]>;
  teamHistory:     Record<string, TeamSeasonHistory[]>;
  coachHistory:    Record<string, CoachSeasonRecord[]>;
  retiredPlayers:  RetiredPlayerRecord[];
  hallOfFame:      HallOfFameEntry[];
  ringOfHonor:     Record<string, RingOfHonorEntry[]>;
}

// ── GM Career ─────────────────────────────────────────────────────────────────

export interface GmSeasonRecord {
  year:              number;
  teamId:            string;
  teamName:          string;
  wins:              number;
  losses:            number;
  ties:              number;
  madePlayoffs:      boolean;
  wonChampionship:   boolean;
  draftPicksMade:    number;
  tradesMade:        number;
  faSigningsMade:    number;
}

export interface GmAchievement {
  id:           string;
  label:        string;
  description:  string;
  unlockedYear: number;
}

export type ReputationTier = 'Hot Seat' | 'Unproven' | 'Respected' | 'Proven Winner' | 'Elite';
export type ReputationTrend = 'rising' | 'stable' | 'falling';

export interface GmCareer {
  teamId:                    string;
  teamName:                  string;
  startYear:                 number;
  seasons:                   GmSeasonRecord[];
  achievements:              GmAchievement[];
  legacyScore:               number;
  reputation?:               number;
  prevReputation?:           number;
  currentSeasonDraftPicks:   number;
  currentSeasonTrades:       number;
  currentSeasonFaSignings:   number;
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
  completedAt?:    number;
  completedWeek?:  number;
  completedPhase?: string;
}

// ── News ──────────────────────────────────────────────────────────────────────

export type NewsType =
  | 'game_result'
  | 'playoff_result'
  | 'championship'
  | 'award'
  | 'signing'
  | 'trade'
  | 'retirement'
  | 'draft_pick'
  | 'big_performance'
  | 'upset'
  | 'weekly_recap'
  | 'milestone'
  | 'stat_race'
  | 'streak'
  | 'hall_of_fame'
  | 'coach_change'
  | 'ring_of_honor'
  | 'retired_jersey'
  | 'gm_milestone';

export interface NewsMention {
  id:         string;
  name:       string;
  entityType: 'player' | 'team';
}

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
  mentions?: NewsMention[];
}

// ── League meta profile ──────────────────────────────────────────────────────

export interface MetaProfile {
  passRate:   number;
  runRate:    number;
  deepRate:   number;
  totalCalls: number;
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
  draftClass?:          DraftClass;
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
  unemployedCoaches:    Coach[];
  divisions:            Division[];
  currentSeasonStats:   Record<string, PlayerSeasonStats>;
  scoutingBudget:       number;
  developmentBudget:    number;
  ownerBudget:          number;
  news:                 NewsItem[];
  milestonesHit:        Record<string, string[]>;
  gmCareer?:            GmCareer;
  metaProfile?:         MetaProfile;
  collegeData?:         CollegeData;
}

// ── College data ──────────────────────────────────────────────────────────────

export interface CollegeTeam {
  name:       string;
  conference: string;
  wins:       number;
  losses:     number;
}

export interface CollegeStatLeader {
  name:       string;
  prospectId: string;
  college:    string;
  stat:       string;
  category:   'passing' | 'rushing' | 'receiving' | 'sacks' | 'interceptions';
}

export interface CollegeData {
  year:       number;
  conferences: { name: string; teams: CollegeTeam[] }[];
  statLeaders: CollegeStatLeader[];
}

// ── Playbook / Formation system ───────────────────────────────────────────────

export type OffensiveSlot     = 'X' | 'Z' | 'SLOT' | 'TE' | 'RB' | 'FB';
export type OffensivePersonnel = '11' | '12' | '21' | '22' | '10' | '00';

export interface OffensiveFormation {
  id:        string;
  name:      string;
  personnel: OffensivePersonnel;
  slots:     OffensiveSlot[];
}

export type RouteTag = 'SHORT' | 'MEDIUM' | 'DEEP';

export interface SlotRoute {
  slot:     OffensiveSlot;
  routeTag: RouteTag;
}

export interface OffensivePlay {
  id:               string;
  name:             string;
  formationId:      string;
  engineType:       string;
  conceptId?:       string;
  routes?:          SlotRoute[];
  ballCarrierSlot?: OffensiveSlot;
  isPlayAction?:    boolean;
}

export interface PlaybookEntry {
  playId:  string;
  weight:  number;
}

export interface Playbook {
  id:      string;
  name:    string;
  entries: PlaybookEntry[];
}

export type DownDistanceBucket =
  | 'FIRST_10' | 'FIRST_LONG' | 'FIRST_MEDIUM' | 'FIRST_SHORT'
  | 'SECOND_LONG' | 'SECOND_MEDIUM' | 'SECOND_SHORT'
  | 'THIRD_LONG' | 'THIRD_MEDIUM' | 'THIRD_SHORT'
  | 'FOURTH_LONG' | 'FOURTH_MEDIUM' | 'FOURTH_SHORT';

export type OffensivePlan = Record<DownDistanceBucket, string>;

// ── Defensive package / playbook system ──────────────────────────────────────

export type DefensiveSlot =
  | 'DE1' | 'DE2'
  | 'DT1' | 'DT2' | 'NT'
  | 'LB1' | 'LB2' | 'LB3' | 'LB4'
  | 'OLB1' | 'OLB2' | 'ILB1' | 'ILB2'
  | 'CB1' | 'CB2' | 'NCB' | 'DC1' | 'DC2'
  | 'FS' | 'SS';

export type DefensivePersonnel = '4-3' | '3-4' | '4-2-5' | '4-1-6' | '4-0-7' | '5-3-3';

export interface DefensivePackage {
  id:          string;
  name:        string;
  personnel:   DefensivePersonnel;
  slots:       DefensiveSlot[];
  description?: string;
}

export type DefensiveFrontLabel =
  | 'four_three' | 'three_four' | 'nickel' | 'dime' | 'quarter' | 'goal_line';

export type DefensiveCoverage =
  | 'cover_0' | 'cover_1' | 'cover_2' | 'cover_3' | 'cover_4' | 'cover_6'
  | 'tampa_2' | 'man_under';

export type BlitzTag =
  | 'lb_blitz' | 'cb_blitz' | 'safety_blitz' | 'zone_blitz';

export interface DefensivePlay {
  id:        string;
  name:      string;
  packageId: string;
  front:     DefensiveFrontLabel;
  coverage:  DefensiveCoverage;
  blitz?:    BlitzTag;
}

export interface DefPlaybookEntry {
  playId:  string;
  weight:  number;
}

export interface DefPlaybook {
  id:      string;
  name:    string;
  entries: DefPlaybookEntry[];
}

export type DefensivePlan = Record<DownDistanceBucket, string>;

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
