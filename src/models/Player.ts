// ── Position ──────────────────────────────────────────────────────────────────

export type Position =
  | 'QB'
  | 'RB' | 'WR' | 'TE'
  | 'OT' | 'OG' | 'C'
  | 'DE' | 'DT'
  | 'OLB' | 'MLB'
  | 'CB' | 'FS' | 'SS'
  | 'K' | 'P';

// ── Personality (non-QB only) ─────────────────────────────────────────────────

/**
 * Meta-game ratings that affect contracts, development, and penalties.
 * Not used by the play-simulation engine directly.
 */
export interface PersonalityRatings {
  workEthic:  number; // 1-99  higher → better progression / training rolls
  loyalty:    number; // 1-99  higher → lower contract demands
  greed:      number; // 1-99  higher → higher contract demands
  discipline: number; // 1-99  higher → lower injury chance, fewer penalties
}

// ── Position-specific ratings ─────────────────────────────────────────────────

export interface QBRatings {
  position: 'QB';
  // Visible to GM via scouting
  armStrength:    number;
  pocketPresence: number;
  mobility:       number;
  // Hidden — engine only, never exposed through scouting
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
  speed:       number;   // GDD: athleticism / lateral range
  pursuit:     number;   // GDD: angles and tracking
  awareness:   number;   // assignment correctness and pre-snap reads
  personality: PersonalityRatings;
}

export interface CBRatings {
  position: 'CB';
  // GDD: coverage split into man and zone — each has distinct engine role
  manCoverage:  number;  // 1-on-1 vs receiver routes (RouteRunning+Speed matchup)
  zoneCoverage: number;  // zone assignment reads and discipline
  ballSkills:   number;  // INT and PBU creation
  speed:        number;  // separation prevention, closes on routes
  size:         number;  // situational; contested-catch influence
  awareness:    number;  // pre-snap reads, assignment correctness
  tackling:     number;  // open-field tackle (used in YAC resolution)
  personality:  PersonalityRatings;
}

export interface SafetyRatings {
  position: 'FS' | 'SS';
  // GDD: coverage split into man and zone
  manCoverage:  number;  // TE/slot man coverage
  zoneCoverage: number;  // centerfield/zone reads (primary for most safeties)
  ballSkills:   number;
  speed:        number;
  size:         number;
  awareness:    number;  // read recognition; also feeds hidden Range derivation
  tackling:     number;  // open-field tackle (used in YAC resolution)
  // range is a HIDDEN DERIVED stat — NOT stored here.
  // Formula: Range = (speed * 0.6) + (awareness * 0.4)
  // Do NOT expose in UI. See calcRange() below.
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

// ── Overall calculation ───────────────────────────────────────────────────────

export function calcOverall(ratings: AnyRatings): number {
  switch (ratings.position) {
    case 'QB':
      return Math.round(
        ratings.decisionMaking * 0.22 +
        ratings.shortAccuracy  * 0.18 +
        ratings.mediumAccuracy * 0.15 +
        ratings.pocketPresence * 0.15 +
        ratings.deepAccuracy   * 0.10 +
        ratings.processing     * 0.10 +
        ratings.armStrength    * 0.07 +
        ratings.mobility       * 0.03
      );
    case 'RB':
      return Math.round(
        ratings.speed        * 0.25 +
        ratings.vision       * 0.20 +
        ratings.power        * 0.20 +
        ratings.elusiveness  * 0.20 +
        ratings.ballSecurity * 0.15
      );
    case 'WR':
      return Math.round(
        ratings.hands        * 0.30 +
        ratings.routeRunning * 0.25 +
        ratings.speed        * 0.25 +
        ratings.yac          * 0.12 +
        ratings.size         * 0.08
      );
    case 'TE':
      return Math.round(
        ratings.hands        * 0.25 +
        ratings.blocking     * 0.22 +
        ratings.routeRunning * 0.20 +
        ratings.speed        * 0.15 +
        ratings.yac          * 0.10 +
        ratings.size         * 0.08
      );
    case 'OT':
    case 'OG':
    case 'C':
      return Math.round(
        ratings.passBlocking * 0.45 +
        ratings.runBlocking  * 0.40 +
        ratings.awareness    * 0.15
      );
    case 'DE':
    case 'DT':
      return Math.round(
        ratings.passRush    * 0.45 +
        ratings.runDefense  * 0.35 +
        ratings.discipline  * 0.20
      );
    case 'OLB':
    case 'MLB':
      return Math.round(
        ratings.runDefense  * 0.26 +
        ratings.speed       * 0.20 +
        ratings.pursuit     * 0.18 +
        ratings.coverage    * 0.18 +
        ratings.awareness   * 0.12 +
        ratings.passRush    * 0.06
      );
    case 'CB':
      // Range is derived (speed*0.6 + awareness*0.4) — not stored, not in overall
      return Math.round(
        ratings.manCoverage  * 0.25 +
        ratings.speed        * 0.25 +
        ratings.zoneCoverage * 0.20 +
        ratings.ballSkills   * 0.15 +
        ratings.awareness    * 0.10 +
        ratings.tackling     * 0.03 +
        ratings.size         * 0.02
      );
    case 'FS':
    case 'SS':
      // Range is derived (speed*0.6 + awareness*0.4) — not stored, not directly in overall
      // but speed and awareness ARE in overall, so range quality is captured indirectly
      return Math.round(
        ratings.zoneCoverage * 0.25 +
        ratings.speed        * 0.22 +
        ratings.manCoverage  * 0.15 +
        ratings.awareness    * 0.15 +
        ratings.ballSkills   * 0.13 +
        ratings.tackling     * 0.07 +
        ratings.size         * 0.03
      );
    case 'K':
    case 'P':
      return Math.round(
        ratings.kickPower    * 0.45 +
        ratings.kickAccuracy * 0.40 +
        ratings.composure    * 0.15
      );
  }
}

// ── Scouting ──────────────────────────────────────────────────────────────────

export function clamp(n: number): number {
  return Math.max(1, Math.min(99, n));
}

/** Variance shrinks as scoutingLevel rises: level 0 → ±25, level 100 → ±2 */
function scoutVariance(scoutingLevel: number): number {
  return Math.round(25 - (scoutingLevel / 100) * 23);
}

function noise(v: number): number {
  return Math.round((Math.random() - 0.5) * 2 * v);
}

/**
 * Apply scouting noise to a rating value.
 * QB hidden sub-ratings are always returned as 50 (not exposed to GM).
 */
function generateScoutedRatings(trueRatings: AnyRatings, scoutingLevel: number): AnyRatings {
  const v = scoutVariance(scoutingLevel);
  const n = () => noise(v);

  switch (trueRatings.position) {
    case 'QB':
      return {
        position:       'QB',
        // Visible — apply variance
        armStrength:    clamp(trueRatings.armStrength    + n()),
        pocketPresence: clamp(trueRatings.pocketPresence + n()),
        mobility:       clamp(trueRatings.mobility       + n()),
        // Accuracy is now visible (GDD: QB Accuracy is the primary visible category)
        shortAccuracy:  clamp(trueRatings.shortAccuracy  + n()),
        mediumAccuracy: clamp(trueRatings.mediumAccuracy + n()),
        deepAccuracy:   clamp(trueRatings.deepAccuracy   + n()),
        // Still hidden engine internals
        processing:     50,
        decisionMaking: 50,
      };
    case 'RB':
      return {
        position:     'RB',
        speed:        clamp(trueRatings.speed        + n()),
        elusiveness:  clamp(trueRatings.elusiveness  + n()),
        power:        clamp(trueRatings.power        + n()),
        vision:       clamp(trueRatings.vision       + n()),
        ballSecurity: clamp(trueRatings.ballSecurity + n()),
        personality:  trueRatings.personality,
      };
    case 'WR':
      return {
        position:     'WR',
        speed:        clamp(trueRatings.speed        + n()),
        routeRunning: clamp(trueRatings.routeRunning + n()),
        hands:        clamp(trueRatings.hands        + n()),
        yac:          clamp(trueRatings.yac          + n()),
        size:         clamp(trueRatings.size         + n()),
        personality:  trueRatings.personality,
      };
    case 'TE':
      return {
        position:     'TE',
        speed:        clamp(trueRatings.speed        + n()),
        routeRunning: clamp(trueRatings.routeRunning + n()),
        hands:        clamp(trueRatings.hands        + n()),
        yac:          clamp(trueRatings.yac          + n()),
        size:         clamp(trueRatings.size         + n()),
        blocking:     clamp(trueRatings.blocking     + n()),
        personality:  trueRatings.personality,
      };
    case 'OT':
    case 'OG':
    case 'C':
      return {
        position:     trueRatings.position,
        passBlocking: clamp(trueRatings.passBlocking + n()),
        runBlocking:  clamp(trueRatings.runBlocking  + n()),
        awareness:    clamp(trueRatings.awareness    + n()),
        personality:  trueRatings.personality,
      };
    case 'DE':
    case 'DT':
      return {
        position:    trueRatings.position,
        passRush:    clamp(trueRatings.passRush    + n()),
        runDefense:  clamp(trueRatings.runDefense  + n()),
        discipline:  clamp(trueRatings.discipline  + n()),
        personality: trueRatings.personality,
      };
    case 'OLB':
    case 'MLB':
      return {
        position:    trueRatings.position,
        passRush:    clamp(trueRatings.passRush    + n()),
        runDefense:  clamp(trueRatings.runDefense  + n()),
        coverage:    clamp(trueRatings.coverage    + n()),
        speed:       clamp(trueRatings.speed       + n()),
        pursuit:     clamp(trueRatings.pursuit     + n()),
        awareness:   clamp(trueRatings.awareness   + n()),
        personality: trueRatings.personality,
      };
    case 'CB':
      return {
        position:     'CB',
        manCoverage:  clamp(trueRatings.manCoverage  + n()),
        zoneCoverage: clamp(trueRatings.zoneCoverage + n()),
        ballSkills:   clamp(trueRatings.ballSkills   + n()),
        speed:        clamp(trueRatings.speed        + n()),
        size:         clamp(trueRatings.size         + n()),
        awareness:    clamp(trueRatings.awareness    + n()),
        tackling:     clamp(trueRatings.tackling     + n()),
        personality:  trueRatings.personality,
      };
    case 'FS':
    case 'SS':
      // Range is hidden and derived — NOT copied into scoutedRatings
      return {
        position:     trueRatings.position,
        manCoverage:  clamp(trueRatings.manCoverage  + n()),
        zoneCoverage: clamp(trueRatings.zoneCoverage + n()),
        ballSkills:   clamp(trueRatings.ballSkills   + n()),
        speed:        clamp(trueRatings.speed        + n()),
        size:         clamp(trueRatings.size         + n()),
        awareness:    clamp(trueRatings.awareness    + n()),
        tackling:     clamp(trueRatings.tackling     + n()),
        personality:  trueRatings.personality,
      };
    case 'K':
    case 'P':
      return {
        position:     trueRatings.position,
        kickPower:    clamp(trueRatings.kickPower    + n()),
        kickAccuracy: clamp(trueRatings.kickAccuracy + n()),
        composure:    clamp(trueRatings.composure    + n()),
        personality:  trueRatings.personality,
      };
  }
}

// ── Development trait ─────────────────────────────────────────────────────────

export type DevTrait = 'superDev' | 'normal' | 'lateBloomer' | 'bust' | 'declining';

/**
 * Returns a randomly-selected development trait.
 * Distribution: superDev 5%, lateBloomer 20%, bust 15%, declining 10%, normal 50%.
 * Hardcoded (not from TUNING) because models can't import engine config.
 */
export function randomDevTrait(): DevTrait {
  const r = Math.random();
  if (r < 0.05) return 'superDev';
  if (r < 0.25) return 'lateBloomer';
  if (r < 0.40) return 'bust';
  if (r < 0.50) return 'declining';
  return 'normal';
}

// ── Salary ────────────────────────────────────────────────────────────────────

export function calcSalary(overall: number): number {
  return Math.max(1, Math.round(overall / 10));
}

// ── Hidden derived stat: Safety Range ─────────────────────────────────────────

/**
 * Range is a HIDDEN DERIVED stat for safeties only.
 * Formula: Range = (speed * 0.6) + (awareness * 0.4)
 * Used by the engine for deep-pass coverage reduction.
 * Per GDD: Do NOT expose in UI.
 */
export function calcRange(safety: SafetyRatings): number {
  return clamp(Math.round(safety.speed * 0.6 + safety.awareness * 0.4));
}

// ── Player interface ──────────────────────────────────────────────────────────

export interface ContractDemand {
  salary: number;
  years:  number;
}

export interface Player {
  id:                    string;
  name:                  string;
  position:              Position;
  age:                   number;
  /**
   * True for players on their first professional contract (age ≤ 23 at creation).
   * Cleared when a player signs a new deal after their rookie contract expires.
   */
  isRookie:              boolean;
  contractDemand?:       ContractDemand;
  scoutingLevel:         number;   // 0-100
  trueRatings:           AnyRatings; // engine only — never sent to GM directly
  scoutedRatings:        AnyRatings; // GM-visible; QB hidden fields set to 50
  overall:               number;   // derived from trueRatings
  scoutedOverall:        number;   // derived from scoutedRatings
  salary:                number;
  yearsRemaining:        number;
  injuryWeeksRemaining:  number;   // 0 = healthy
  stamina:               number;   // 1-99: cardio/endurance — affects in-game fatigue buildup
  /** Hidden development archetype — influences yearly progression curves. */
  devTrait:              DevTrait;
  /** Seasons completed as a professional (0 = rookie year, increments each offseason). */
  yearsPro:              number;
  /** College the player attended; preserved from Prospect at draft time. */
  college?:              string;
  /** ID of the originating Prospect (before the "p-" player-id prefix). Used to look up scoutingData and draftBoard entries. */
  prospectId?:           string;
}

export interface PlayerOptions {
  scoutingLevel?:  number;    // default 60
  yearsRemaining?: number;    // default: 3–4 for rookies, 1–3 for veterans
  isRookie?:       boolean;   // default: age <= 23
  stamina?:        number;    // default: random 50–90
  devTrait?:       DevTrait;  // default: randomDevTrait()
  yearsPro?:       number;    // default: 0
  college?:        string;
  prospectId?:     string;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createPlayer(
  id: string,
  name: string,
  position: Position,
  age: number,
  trueRatings: AnyRatings,
  options: PlayerOptions = {},
): Player {
  const isRookie     = options.isRookie ?? (age <= 23);
  const scoutingLevel = options.scoutingLevel ?? 60;
  // Rookies get 3–4 year contracts; veterans get 1–3 years.
  const yearsRemaining = options.yearsRemaining
    ?? (isRookie
      ? Math.floor(Math.random() * 2) + 3   // 3 or 4
      : Math.floor(Math.random() * 3) + 1); // 1, 2, or 3

  const scoutedRatings = generateScoutedRatings(trueRatings, scoutingLevel);
  const overall        = calcOverall(trueRatings);

  return {
    id,
    name,
    position,
    age,
    isRookie,
    scoutingLevel,
    trueRatings,
    scoutedRatings,
    overall,
    scoutedOverall: calcOverall(scoutedRatings),
    salary:         calcSalary(overall),
    yearsRemaining,
    injuryWeeksRemaining: 0,
    stamina:  options.stamina  ?? (50 + Math.floor(Math.random() * 41)), // 50–90
    devTrait: options.devTrait ?? randomDevTrait(),
    yearsPro: options.yearsPro ?? 0,
    ...(options.college    !== undefined && { college:    options.college }),
    ...(options.prospectId !== undefined && { prospectId: options.prospectId }),
  };
}

export function refreshScouting(player: Player): Player {
  const scoutedRatings = generateScoutedRatings(player.trueRatings, player.scoutingLevel);
  return {
    ...player,
    scoutedRatings,
    scoutedOverall: calcOverall(scoutedRatings),
  };
}

export function scoutBar(level: number): string {
  const filled = Math.round(level / 20);
  return '■'.repeat(filled) + '□'.repeat(5 - filled);
}
