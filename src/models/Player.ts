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
  range:        number;  // only used for deep pass defense
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
        ratings.speed        * 0.22 +
        ratings.acceleration * 0.18 +
        ratings.vision       * 0.18 +
        ratings.agility      * 0.15 +
        ratings.power        * 0.15 +
        ratings.ballSecurity * 0.07 +
        ratings.passBlocking * 0.03 +
        ratings.routeRunning * 0.02
      );
    case 'WR':
      return Math.round(
        ratings.catching     * 0.25 +
        ratings.separation   * 0.22 +
        ratings.speed        * 0.20 +
        ratings.routeRunning * 0.18 +
        ratings.release      * 0.10 +
        ratings.acceleration * 0.03 +
        ratings.blocking     * 0.02
      );
    case 'TE':
      return Math.round(
        ratings.catching     * 0.25 +
        ratings.blocking     * 0.22 +
        ratings.routeRunning * 0.20 +
        ratings.strength     * 0.15 +
        ratings.speed        * 0.12 +
        ratings.release      * 0.06
      );
    case 'OT':
    case 'OG':
    case 'C':
      return Math.round(
        ratings.passBlocking * 0.35 +
        ratings.runBlocking  * 0.30 +
        ratings.strength     * 0.18 +
        ratings.awareness    * 0.12 +
        ratings.agility      * 0.05
      );
    case 'DE':
    case 'DT':
      return Math.round(
        ratings.passRush    * 0.35 +
        ratings.runStop     * 0.28 +
        ratings.athleticism * 0.20 +
        ratings.strength    * 0.12 +
        ratings.motor       * 0.05
      );
    case 'OLB':
    case 'MLB':
      return Math.round(
        ratings.runStop     * 0.28 +
        ratings.athleticism * 0.22 +
        ratings.pursuit     * 0.18 +
        ratings.coverage    * 0.15 +
        ratings.awareness   * 0.12 +
        ratings.passRush    * 0.05
      );
    case 'CB':
      return Math.round(
        ratings.manCoverage  * 0.30 +
        ratings.speed        * 0.25 +
        ratings.zoneCoverage * 0.20 +
        ratings.athleticism  * 0.12 +
        ratings.press        * 0.08 +
        ratings.ballSkills   * 0.05
      );
    case 'FS':
    case 'SS':
      return Math.round(
        ratings.zoneCoverage * 0.28 +
        ratings.athleticism  * 0.22 +
        ratings.range        * 0.18 +
        ratings.manCoverage  * 0.15 +
        ratings.hitPower     * 0.10 +
        ratings.ballSkills   * 0.07
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
        // Hidden — sentinel value, UI must not display these from scoutedRatings
        shortAccuracy:  50,
        mediumAccuracy: 50,
        deepAccuracy:   50,
        processing:     50,
        decisionMaking: 50,
      };
    case 'RB':
      return {
        position:     'RB',
        speed:        clamp(trueRatings.speed        + n()),
        acceleration: clamp(trueRatings.acceleration + n()),
        power:        clamp(trueRatings.power        + n()),
        agility:      clamp(trueRatings.agility      + n()),
        vision:       clamp(trueRatings.vision       + n()),
        ballSecurity: clamp(trueRatings.ballSecurity + n()),
        passBlocking: clamp(trueRatings.passBlocking + n()),
        routeRunning: clamp(trueRatings.routeRunning + n()),
        personality:  trueRatings.personality, // personality known accurately
      };
    case 'WR':
      return {
        position:     'WR',
        speed:        clamp(trueRatings.speed        + n()),
        acceleration: clamp(trueRatings.acceleration + n()),
        catching:     clamp(trueRatings.catching     + n()),
        routeRunning: clamp(trueRatings.routeRunning + n()),
        separation:   clamp(trueRatings.separation   + n()),
        release:      clamp(trueRatings.release      + n()),
        blocking:     clamp(trueRatings.blocking     + n()),
        personality:  trueRatings.personality,
      };
    case 'TE':
      return {
        position:     'TE',
        strength:     clamp(trueRatings.strength     + n()),
        speed:        clamp(trueRatings.speed        + n()),
        catching:     clamp(trueRatings.catching     + n()),
        routeRunning: clamp(trueRatings.routeRunning + n()),
        blocking:     clamp(trueRatings.blocking     + n()),
        release:      clamp(trueRatings.release      + n()),
        personality:  trueRatings.personality,
      };
    case 'OT':
    case 'OG':
    case 'C':
      return {
        position:     trueRatings.position,
        passBlocking: clamp(trueRatings.passBlocking + n()),
        runBlocking:  clamp(trueRatings.runBlocking  + n()),
        strength:     clamp(trueRatings.strength     + n()),
        agility:      clamp(trueRatings.agility      + n()),
        awareness:    clamp(trueRatings.awareness    + n()),
        personality:  trueRatings.personality,
      };
    case 'DE':
    case 'DT':
      return {
        position:    trueRatings.position,
        passRush:    clamp(trueRatings.passRush    + n()),
        runStop:     clamp(trueRatings.runStop     + n()),
        strength:    clamp(trueRatings.strength    + n()),
        athleticism: clamp(trueRatings.athleticism + n()),
        motor:       clamp(trueRatings.motor       + n()),
        personality: trueRatings.personality,
      };
    case 'OLB':
    case 'MLB':
      return {
        position:    trueRatings.position,
        passRush:    clamp(trueRatings.passRush    + n()),
        runStop:     clamp(trueRatings.runStop     + n()),
        coverage:    clamp(trueRatings.coverage    + n()),
        athleticism: clamp(trueRatings.athleticism + n()),
        awareness:   clamp(trueRatings.awareness   + n()),
        pursuit:     clamp(trueRatings.pursuit     + n()),
        personality: trueRatings.personality,
      };
    case 'CB':
      return {
        position:     'CB',
        manCoverage:  clamp(trueRatings.manCoverage  + n()),
        zoneCoverage: clamp(trueRatings.zoneCoverage + n()),
        ballSkills:   clamp(trueRatings.ballSkills   + n()),
        press:        clamp(trueRatings.press        + n()),
        speed:        clamp(trueRatings.speed        + n()),
        athleticism:  clamp(trueRatings.athleticism  + n()),
        personality:  trueRatings.personality,
      };
    case 'FS':
    case 'SS':
      return {
        position:     trueRatings.position,
        zoneCoverage: clamp(trueRatings.zoneCoverage + n()),
        manCoverage:  clamp(trueRatings.manCoverage  + n()),
        ballSkills:   clamp(trueRatings.ballSkills   + n()),
        range:        clamp(trueRatings.range        + n()),
        hitPower:     clamp(trueRatings.hitPower     + n()),
        athleticism:  clamp(trueRatings.athleticism  + n()),
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

// ── Salary ────────────────────────────────────────────────────────────────────

export function calcSalary(overall: number): number {
  return Math.max(1, Math.round(overall / 10));
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
}

export interface PlayerOptions {
  scoutingLevel?:  number;  // default 60
  yearsRemaining?: number;  // default: 3–4 for rookies, 1–3 for veterans
  isRookie?:       boolean; // default: age <= 23
  stamina?:        number;  // default: random 50–90
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
    stamina: options.stamina ?? (50 + Math.floor(Math.random() * 41)), // 50–90
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
