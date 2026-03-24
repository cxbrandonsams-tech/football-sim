/**
 * Scouting engine — draft-class generation and scouting-report production.
 *
 * Key design:
 *  - generateDraftClass(year)  →  Prospect[] (full hidden data, server-side only)
 *  - generateScoutingReport()  →  ScoutingReport (truth filtered through level + scout quality)
 *  - convertProspectToPlayer() →  Player (called when a prospect is actually drafted)
 *
 * Reports are grounded in true ratings but never expose exact values.
 * Better scouts and higher scouting levels reduce noise, never eliminate it entirely.
 */

import {
  createPlayer, calcOverall, clamp, randomDevTrait,
  type Position, type AnyRatings, type PersonalityRatings,
} from '../models/Player';
import { type Player }         from '../models/Player';
import {
  type Prospect, type ProspectTier, type ScoutingReport, type DraftClass,
} from '../models/Prospect';
import { TUNING } from './config';

// ── Name / college pools ──────────────────────────────────────────────────────

const FIRST_NAMES = [
  'Jordan','Marcus','Devon','Tyler','Andre','Keaton','Jaylen','Malik',
  'Darius','Trent','Calvin','Elijah','Nate','Reggie','Byron','Corey',
  'Isaiah','Damien','Trey','Zach','Cole','Aaron','Evan','Derek',
  'Jalen','Ray','Omar','Brendan','Victor','Dante','DeShawn','Kwame',
  'Miles','Xavier','Patrick','Chase','Hunter','Logan','Deon','Kevon',
  'Terrell','Quincy','Antoine','Dashawn','Rondell','Broderick','Shaun','Kendall',
];

const LAST_NAMES = [
  'Smith','Johnson','Williams','Brown','Davis','Miller','Wilson','Moore',
  'Taylor','Anderson','Thomas','Jackson','White','Harris','Martin',
  'Thompson','Robinson','Clark','Lewis','Walker','Hall','Allen','Young',
  'King','Wright','Hill','Scott','Green','Adams','Baker','Carter',
  'Reed','Nelson','Sanders','Ross','Bryant','Simmons','Ford','Washington',
  'Coleman','Banks','Benson','Gaines','Payne','Watts','Holt','Cross',
];

const COLLEGES = [
  'Alabama','Ohio State','Georgia','Michigan','LSU','USC','Notre Dame',
  'Texas','Florida','Penn State','Oklahoma','Clemson','Oregon',
  'Wisconsin','Nebraska','Iowa','Texas A&M','Auburn','Tennessee',
  'Utah','Miami','Florida State','Virginia Tech','Pittsburgh',
  'California','Stanford','Northwestern','Vanderbilt','Duke',
  'North Carolina','Wake Forest','Boston College','Missouri','Ole Miss',
  'South Carolina','Kentucky','West Virginia','Arizona State','Kansas State',
  'Baylor','TCU','Oklahoma State','Utah State','San Jose State',
];

const POSITION_POOL: Position[] = [
  'QB','QB',
  'RB','RB','RB',
  'WR','WR','WR','WR',
  'TE','TE',
  'OT','OT','OT',
  'OG','OG','OG',
  'C','C',
  'DE','DE','DE',
  'DT','DT','DT',
  'OLB','OLB','OLB',
  'MLB','MLB',
  'CB','CB','CB','CB',
  'FS','FS',
  'SS','SS',
  'K','P',
];

interface PhysicalRange { minH: number; maxH: number; minW: number; maxW: number; }

const PHYSICAL: Record<string, PhysicalRange> = {
  QB:  { minH: 73, maxH: 78, minW: 205, maxW: 245 },
  RB:  { minH: 68, maxH: 73, minW: 195, maxW: 230 },
  WR:  { minH: 69, maxH: 75, minW: 170, maxW: 210 },
  TE:  { minH: 74, maxH: 79, minW: 240, maxW: 270 },
  OT:  { minH: 76, maxH: 80, minW: 290, maxW: 330 },
  OG:  { minH: 74, maxH: 77, minW: 290, maxW: 330 },
  C:   { minH: 73, maxH: 76, minW: 280, maxW: 320 },
  DE:  { minH: 74, maxH: 77, minW: 245, maxW: 280 },
  DT:  { minH: 73, maxH: 76, minW: 285, maxW: 320 },
  OLB: { minH: 73, maxH: 76, minW: 230, maxW: 260 },
  MLB: { minH: 72, maxH: 75, minW: 230, maxW: 255 },
  CB:  { minH: 70, maxH: 74, minW: 175, maxW: 200 },
  FS:  { minH: 72, maxH: 75, minW: 195, maxW: 215 },
  SS:  { minH: 72, maxH: 75, minW: 210, maxW: 230 },
  K:   { minH: 72, maxH: 75, minW: 185, maxW: 210 },
  P:   { minH: 72, maxH: 75, minW: 185, maxW: 215 },
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]!; }
function randInt(min: number, max: number): number { return min + Math.floor(Math.random() * (max - min + 1)); }
function displayHeight(inches: number): string { return `${Math.floor(inches / 12)}'${inches % 12}"`; }

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

// ── Rating generation ─────────────────────────────────────────────────────────

type DraftTier = 'elite' | 'starter' | 'depth';

function rTier(tier: DraftTier): number {
  const [base, spread]: [number, number] =
    tier === 'elite'   ? [76, 7]  :
    tier === 'starter' ? [63, 9]  :
                         [49, 10];
  return clamp(Math.round(base + (Math.random() - 0.5) * 2 * spread));
}

function personality(tier: DraftTier): PersonalityRatings {
  return { workEthic: rTier(tier), loyalty: rTier(tier), greed: rTier(tier), discipline: rTier(tier) };
}

function makeRatings(position: Position, tier: DraftTier): AnyRatings {
  const r = () => rTier(tier);
  switch (position) {
    case 'QB':  return { position: 'QB', armStrength: r(), pocketPresence: r(), mobility: r(),
      shortAccuracy: r(), mediumAccuracy: r(), deepAccuracy: r(), processing: r(), decisionMaking: r() };
    case 'RB':  return { position: 'RB', speed: r(), elusiveness: r(), power: r(),
      vision: r(), ballSecurity: r(), personality: personality(tier) };
    case 'WR':  return { position: 'WR', speed: r(), routeRunning: r(), hands: r(),
      yac: r(), size: r(), personality: personality(tier) };
    case 'TE':  return { position: 'TE', speed: r(), routeRunning: r(), hands: r(),
      yac: r(), size: r(), blocking: r(), personality: personality(tier) };
    case 'OT':  return { position: 'OT', passBlocking: r(), runBlocking: r(), awareness: r(), personality: personality(tier) };
    case 'OG':  return { position: 'OG', passBlocking: r(), runBlocking: r(), awareness: r(), personality: personality(tier) };
    case 'C':   return { position: 'C',  passBlocking: r(), runBlocking: r(), awareness: r(), personality: personality(tier) };
    case 'DE':  return { position: 'DE', passRush: r(), runDefense: r(), discipline: r(), personality: personality(tier) };
    case 'DT':  return { position: 'DT', passRush: r(), runDefense: r(), discipline: r(), personality: personality(tier) };
    case 'OLB': return { position: 'OLB', passRush: r(), runDefense: r(), coverage: r(), speed: r(), pursuit: r(), personality: personality(tier) };
    case 'MLB': return { position: 'MLB', passRush: r(), runDefense: r(), coverage: r(), speed: r(), pursuit: r(), personality: personality(tier) };
    case 'CB':  return { position: 'CB', coverage: r(), ballSkills: r(), speed: r(), size: r(), personality: personality(tier) };
    case 'FS':  return { position: 'FS', coverage: r(), ballSkills: r(), speed: r(), size: r(), range: r(), personality: personality(tier) };
    case 'SS':  return { position: 'SS', coverage: r(), ballSkills: r(), speed: r(), size: r(), range: r(), personality: personality(tier) };
    case 'K':   return { position: 'K',  kickPower: r(), kickAccuracy: r(), composure: r(), personality: personality(tier) };
    case 'P':   return { position: 'P',  kickPower: r(), kickAccuracy: r(), composure: r(), personality: personality(tier) };
  }
}

function trueRoundFromOverall(overall: number): number {
  // overall 90 → ~round 1; overall 39 → ~round 7
  const raw    = 7 - (overall - 39) / 7;
  const jitter = Math.random() < 0.30 ? (Math.random() < 0.5 ? 1 : -1) : 0;
  return Math.max(1, Math.min(7, Math.round(raw + jitter)));
}

function tierToPotential(tier: DraftTier): ProspectTier {
  if (tier === 'elite')   return Math.random() < 0.70 ? 'elite' : 'day1';
  if (tier === 'starter') return Math.random() < 0.50 ? 'day1'  : 'day2';
  return Math.random() < 0.30 ? 'day2' : Math.random() < 0.60 ? 'day3' : 'udfa';
}

// ── Rating-to-text lookup ─────────────────────────────────────────────────────

interface RatingEntry { key: string; value: number; hiText: string; loText: string; }

function getRatingEntries(ratings: AnyRatings): RatingEntry[] {
  switch (ratings.position) {
    case 'QB': return [
      { key:'armStrength',    value: ratings.armStrength,    hiText:'Exceptional arm strength and velocity on every throw',       loText:'Arm strength limits the deep game' },
      { key:'pocketPresence', value: ratings.pocketPresence, hiText:'Elite composure, stands tall in a collapsing pocket',        loText:'Gets rattled and bails too early under pressure' },
      { key:'mobility',       value: ratings.mobility,       hiText:'Athletic and dangerous as a runner outside the pocket',       loText:'Limited mobility as an extension of the offense' },
      { key:'shortAccuracy',  value: ratings.shortAccuracy,  hiText:'Pinpoint on timing routes and quick throws underneath',       loText:'Too many misses on short-area timing throws' },
      { key:'mediumAccuracy', value: ratings.mediumAccuracy, hiText:'Consistent accuracy at intermediate depth',                   loText:'Accuracy drops noticeably on mid-range targets' },
      { key:'deepAccuracy',   value: ratings.deepAccuracy,   hiText:'Drops it in the bucket on deep balls',                       loText:'Deep ball accuracy is a clear concern on film' },
      { key:'processing',     value: ratings.processing,     hiText:'Quick to read coverage and identify the right target',       loText:'Slow to process and hesitates through his reads' },
      { key:'decisionMaking', value: ratings.decisionMaking, hiText:'Smart decision-maker, takes care of the football',           loText:'Risky decision-making under pressure costs him' },
    ];
    case 'RB': return [
      { key:'speed',        value: ratings.speed,        hiText:'Blazing speed with legitimate home-run ability',              loText:'Speed limits his big-play ceiling at this level' },
      { key:'elusiveness',  value: ratings.elusiveness,  hiText:'Exceptional change of direction and open-field wiggle',       loText:'Limited ability to make defenders miss in space' },
      { key:'power',        value: ratings.power,        hiText:'Powerful runner who falls forward for extra yards',            loText:'Gets stopped in his tracks by physical defenders' },
      { key:'vision',       value: ratings.vision,       hiText:'Natural vision reading blocks and finding creases',           loText:'Struggles to set up blocks and find cutback lanes' },
      { key:'ballSecurity', value: ratings.ballSecurity, hiText:'Excellent ball security, takes care of the football',         loText:'Fumble risk that must be cleaned up at the next level' },
    ];
    case 'WR': return [
      { key:'speed',        value: ratings.speed,        hiText:'Elite speed and a consistent vertical threat downfield',       loText:'Average speed limits separation potential' },
      { key:'routeRunning', value: ratings.routeRunning, hiText:'Crisp, precise routes with sharp breaks at every level',      loText:'Route running needs refinement at the pro level' },
      { key:'hands',        value: ratings.hands,        hiText:'Reliable hands, makes the tough catches in traffic',          loText:'Drops are a recurring problem on film' },
      { key:'yac',          value: ratings.yac,          hiText:'Exceptional after-the-catch ability, turns short gains long', loText:'Limited ability to create after the catch' },
      { key:'size',         value: ratings.size,         hiText:'Size advantage in contested catch situations',                loText:'Smaller frame can be a disadvantage on contested balls' },
    ];
    case 'TE': return [
      { key:'hands',        value: ratings.hands,        hiText:'Reliable hands in traffic and over the middle',               loText:'Catching inconsistency will cost him targets' },
      { key:'blocking',     value: ratings.blocking,     hiText:'Physical and capable as an in-line blocker',                  loText:'Blocking needs significant development to play early' },
      { key:'routeRunning', value: ratings.routeRunning, hiText:'Athletic mover with a varied and well-run route tree',        loText:'Route tree is limited for the position' },
      { key:'yac',          value: ratings.yac,          hiText:'Dangerous after the catch, hard to bring down in space',      loText:'Stops at the catch point rather than creating yards' },
      { key:'speed',        value: ratings.speed,        hiText:'Rare speed for the position, creates real matchup problems',  loText:'Limited speed reduces his mismatch potential' },
    ];
    case 'OT': case 'OG': case 'C': return [
      { key:'passBlocking', value: ratings.passBlocking, hiText:'Stout in pass protection, anchors well vs. bull rushes',      loText:'Gives up pressure and struggles on spin/speed moves' },
      { key:'runBlocking',  value: ratings.runBlocking,  hiText:'Dominant in the run game, drives defenders off the ball',    loText:'Inconsistent run blocker who gets washed out' },
      { key:'awareness',    value: ratings.awareness,    hiText:'Smart and communicates well, handles stunts and games',       loText:'Gets confused by complex defensive stunts' },
    ];
    case 'DE': case 'DT': return [
      { key:'passRush',    value: ratings.passRush,    hiText:'Relentless pass rusher with a varied and effective move set',  loText:'Pass rush production is inconsistent on film' },
      { key:'runDefense',  value: ratings.runDefense,  hiText:'Stout against the run, holds his gap with authority',         loText:'Gets pushed around and washed out vs. the run' },
      { key:'discipline',  value: ratings.discipline,  hiText:'Disciplined gap integrity, never out of position',            loText:'Gets caught out of gap responsibility too often' },
    ];
    case 'OLB': case 'MLB': return [
      { key:'runDefense',  value: ratings.runDefense,  hiText:'Physical tackler who fills the hole with authority',           loText:'Struggles to disengage blocks and reach the ball' },
      { key:'coverage',    value: ratings.coverage,    hiText:'Natural coverage instincts, mirrors well in open space',       loText:'Coverage is a significant liability vs. spread teams' },
      { key:'speed',       value: ratings.speed,       hiText:'Athletic range to cover sideline-to-sideline',                loText:'Limited athleticism affects his range and recovery' },
      { key:'pursuit',     value: ratings.pursuit,     hiText:'Elite pursuit angles, rarely overruns or loses contain',      loText:'Takes poor pursuit angles and gets cut back on' },
    ];
    case 'CB': return [
      { key:'coverage',    value: ratings.coverage,    hiText:'Can lock receivers down in man or zone coverage',             loText:'Struggles to stay with quicker receivers' },
      { key:'speed',       value: ratings.speed,       hiText:'Closing speed to run with any receiver on the field',        loText:'Average speed is a liability against speed receivers' },
      { key:'ballSkills',  value: ratings.ballSkills,  hiText:'Ball hawk who goes up and takes the football away',          loText:'Ball skills and playmaking need improvement' },
      { key:'size',        value: ratings.size,        hiText:'Size advantage in contested catch situations',               loText:'Smaller frame is a disadvantage on contested catches' },
    ];
    case 'FS': case 'SS': return [
      { key:'coverage',    value: ratings.coverage,    hiText:'Natural center fielder who covers ground effortlessly',      loText:'Zone coverage reads are slow and inconsistent' },
      { key:'range',       value: ratings.range,       hiText:'Elite range that erases the deep half of the field',        loText:'Limited range restricts the coverage he can play' },
      { key:'speed',       value: ratings.speed,       hiText:'Fluid and athletic, takes great angles to the football',    loText:'Average athleticism limits positional versatility' },
      { key:'ballSkills',  value: ratings.ballSkills,  hiText:'Ball hawk with instincts to read and jump routes',          loText:'Ball skills need improvement at the next level' },
    ];
    case 'K': case 'P': return [
      { key:'kickPower',    value: ratings.kickPower,    hiText:'Powerful leg with range from 55+ yards',                    loText:'Limited leg strength restricts the playable range' },
      { key:'kickAccuracy', value: ratings.kickAccuracy, hiText:'Consistent and reliable accuracy across field conditions',  loText:'Accuracy under pressure is a real concern' },
      { key:'composure',    value: ratings.composure,    hiText:'Ice in his veins in high-pressure, high-stakes moments',   loText:'Composure and nerves are a genuine concern' },
    ];
  }
}

// ── Grade / notes helpers ─────────────────────────────────────────────────────

function gradeFromRange(min: number, max: number): string {
  const mid = (min + max) / 2;
  if (mid <= 1.5) return 'First-round prospect';
  if (mid <= 2.5) return 'Day 1 / early Day 2 talent';
  if (mid <= 3.5) return 'Day 2 prospect';
  if (mid <= 4.5) return 'Mid-round value';
  if (mid <= 5.5) return 'Day 3 pick';
  return 'Late-round flyer';
}

const LEVEL_NOTES = [
  '',
  'Initial scouting pass — limited film review. Preliminary report only.',
  'Second evaluation complete. A clearer picture is emerging.',
  'Full evaluation finished. This is our most thorough assessment.',
];

const TIER_NOTES: Record<ProspectTier, string[]> = {
  elite: ['Has the tools to be a franchise cornerstone.', 'Rare talent — special prospect at this position.'],
  day1:  ['Looks like an early impact player at the next level.', 'Strong prospect with legitimate starting upside.'],
  day2:  ['Solid mid-round value with a clear role.', 'Developmental prospect with real upside in the right system.'],
  day3:  ['Late-round pick with a specific role to fill.', 'Special-teams contributor with developmental upside.'],
  udfa:  ['Fringe prospect, but not without tools.', 'Could stick on a practice squad in the right situation.'],
};

// ── Public API — report generation ───────────────────────────────────────────

export function generateScoutingReport(
  prospect:     Prospect,
  scoutLevel:   1 | 2 | 3,
  scoutOverall: number,
): ScoutingReport {
  const cfg     = TUNING.scouting;
  const entries = getRatingEntries(prospect.trueRatings);

  // Noise added to each rating before ranking (less noise = more accurate strengths/weaknesses shown)
  const baseNoise    = scoutLevel === 1 ? cfg.ratingNoiseL1 : scoutLevel === 2 ? cfg.ratingNoiseL2 : cfg.ratingNoiseL3;
  const qualityAdj   = (70 - scoutOverall) * cfg.scoutQualityFactor;
  const totalNoise   = Math.max(0, baseNoise + qualityAdj);

  const noisy = entries.map(e => ({
    ...e,
    noisyValue: e.value + (Math.random() - 0.5) * 2 * totalNoise,
  }));
  noisy.sort((a, b) => b.noisyValue - a.noisyValue);

  const [strCount, wkCount] = scoutLevel === 1 ? [2, 1] : scoutLevel === 2 ? [3, 2] : [4, 2];
  const strengths  = noisy.slice(0, strCount).map(e => e.hiText);
  const weaknesses = noisy.slice(noisy.length - wkCount).map(e => e.loText);

  // Projected round — tighter range at higher levels; scout quality adjusts variance
  const baseVariance     = scoutLevel === 1 ? cfg.roundVarianceL1 : scoutLevel === 2 ? cfg.roundVarianceL2 : cfg.roundVarianceL3;
  const qualityRoundAdj  = Math.round((70 - scoutOverall) * 0.03);
  const effectiveVariance = Math.max(0, baseVariance + qualityRoundAdj);
  // At level 1, center can drift ±1 from reality (scouts guess wrong sometimes)
  const centerNoise = scoutLevel === 1 ? (Math.floor(Math.random() * 3) - 1) : 0;
  const center      = prospect.trueRound + centerNoise;
  const projectedRound = {
    min: Math.max(1, center - effectiveVariance),
    max: Math.min(7, center + effectiveVariance),
  };

  const grade      = gradeFromRange(projectedRound.min, projectedRound.max);
  const levelNote  = LEVEL_NOTES[scoutLevel] ?? '';
  // Only hint at prospect tier from level 2 onward
  const tierNote   = scoutLevel >= 2
    ? (pick(TIER_NOTES[prospect.truePotential]))
    : '';
  const notes      = [levelNote, tierNote].filter(Boolean).join(' ');
  const confidence = scoutLevel === 1 ? 'low' as const : scoutLevel === 2 ? 'medium' as const : 'high' as const;

  return { projectedRound, grade, strengths, weaknesses, confidence, notes };
}

// ── Public API — draft class generation ──────────────────────────────────────

function makeProspect(id: string, tier: DraftTier): Prospect {
  const position    = pick(POSITION_POOL);
  const age         = 21 + Math.floor(Math.random() * 3);
  const trueRatings = makeRatings(position, tier);
  const trueOverall = calcOverall(trueRatings);
  const phys        = PHYSICAL[position] ?? { minH: 72, maxH: 75, minW: 200, maxW: 230 };
  const height      = displayHeight(randInt(phys.minH, phys.maxH));
  const weight      = randInt(phys.minW, phys.maxW);

  return {
    id,
    name:          `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    position,
    age,
    college:       pick(COLLEGES),
    height,
    weight,
    trueOverall,
    trueRatings,
    truePotential: tierToPotential(tier),
    trueRound:     trueRoundFromOverall(trueOverall),
    devTrait:      randomDevTrait(),
  };
}

export function generateDraftClass(year: number): DraftClass {
  const tiers: { tier: DraftTier; count: number }[] = [
    { tier: 'elite',   count: 20  },
    { tier: 'starter', count: 130 },
    { tier: 'depth',   count: 150 },
  ];
  let idx = 0;
  const prospects: Prospect[] = [];
  for (const { tier, count } of tiers) {
    for (let i = 0; i < count; i++) {
      prospects.push(makeProspect(`prospect-${year}-${idx}`, tier));
      idx++;
    }
  }
  return { year, prospects: shuffle(prospects) };
}

// ── Public API — prospect → player conversion ─────────────────────────────────

/** Convert a scouted Prospect into a rostered Player when they are drafted. */
export function convertProspectToPlayer(prospect: Prospect): Player {
  return createPlayer(
    `p-${prospect.id}`,
    prospect.name,
    prospect.position as import('../models/Player').Position,
    prospect.age,
    prospect.trueRatings,
    {
      scoutingLevel:  15,
      isRookie:       true,
      yearsRemaining: 3 + Math.floor(Math.random() * 2),
      college:        prospect.college,
      prospectId:     prospect.id,
      devTrait:       prospect.devTrait,
      yearsPro:       0,
    },
  );
}

// ── Public API — budget helpers ───────────────────────────────────────────────

/** Convert a team's scouting budget tier to a points pool. */
export function budgetToPoints(scoutingBudget: number): number {
  return scoutingBudget * TUNING.scouting.pointsPerBudgetUnit;
}
