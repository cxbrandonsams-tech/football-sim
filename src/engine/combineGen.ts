/**
 * Combine / Pro Day results generator.
 *
 * Generates athletic testing results for each prospect based on their
 * hidden true ratings + random variance. Results are public (no scouting
 * required) and influence stock movement perception.
 *
 * Does NOT change true ratings — only reveals information.
 */

import { type Prospect, type CombineResults, type CombineStockMove } from '../models/Prospect';

function randFloat(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

function randInt(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/**
 * Extract a speed-like rating from any position's ratings.
 * Returns 50 as default if no speed-like field exists.
 */
function getSpeedRating(p: Prospect): number {
  const r = p.trueRatings as unknown as Record<string, unknown>;
  if (typeof r['speed'] === 'number') return r['speed'];
  if (typeof r['mobility'] === 'number') return r['mobility'];
  return 50;
}

function getStrengthRating(p: Prospect): number {
  const r = p.trueRatings as unknown as Record<string, unknown>;
  if (typeof r['power'] === 'number') return r['power'];
  if (typeof r['runBlocking'] === 'number') return r['runBlocking'];
  if (typeof r['runDefense'] === 'number') return r['runDefense'];
  if (typeof r['blocking'] === 'number') return r['blocking'];
  return 50;
}

function getAgilityRating(p: Prospect): number {
  const r = p.trueRatings as unknown as Record<string, unknown>;
  if (typeof r['elusiveness'] === 'number') return r['elusiveness'];
  if (typeof r['routeRunning'] === 'number') return r['routeRunning'];
  if (typeof r['manCoverage'] === 'number') return r['manCoverage'];
  return 50;
}

/**
 * Generate combine results for a single prospect.
 *
 * Results are based on true ratings + random noise.
 * 40 time: lower is better (faster). Based on speed rating.
 * Bench: higher is better. Based on strength/power.
 * Jumps/agility: based on athletic profile.
 */
export function generateCombineResults(p: Prospect): CombineResults {
  const speed    = getSpeedRating(p);
  const strength = getStrengthRating(p);
  const agility  = getAgilityRating(p);
  const ovr      = p.trueOverall;

  // Noise factor: ±10% randomness
  const noise = () => 0.9 + Math.random() * 0.2;

  // 40-yard dash: elite (4.28) to poor (5.10). Lower = better.
  // Rating 90 → ~4.35, Rating 50 → ~4.65, Rating 20 → ~4.95
  const fortyBase = 5.10 - (speed / 100) * 0.80;
  const fortyYard = +(fortyBase * noise()).toFixed(2);

  // Bench press (225 lb reps): 5–35 reps based on strength
  const benchBase = 5 + (strength / 100) * 28;
  const benchPress = Math.max(3, Math.round(benchBase * noise()));

  // Vertical jump: 25–42 inches
  const vertBase = 25 + (speed * 0.5 + agility * 0.5) / 100 * 16;
  const vertJump = +(vertBase * noise()).toFixed(1);

  // Broad jump: 100–135 inches
  const broadBase = 100 + (speed * 0.6 + strength * 0.4) / 100 * 32;
  const broadJump = Math.round(broadBase * noise());

  // 3-cone: 6.50–7.40 seconds (lower = better)
  const coneBase = 7.40 - (agility / 100) * 0.85;
  const threeCone = +(coneBase * noise()).toFixed(2);

  // Shuttle: 3.95–4.55 seconds (lower = better)
  const shuttleBase = 4.55 - (agility / 100) * 0.55;
  const shuttle = +(shuttleBase * noise()).toFixed(2);

  // Stock movement: compare combine performance to expected for their draft round
  // A prospect who tests better than expected for their projected slot = rising
  const expectedSpeed = 50 + (7 - p.trueRound) * 7; // higher round → higher expected
  const speedDelta = speed - expectedSpeed;
  const combinePerformance = (
    (speed > expectedSpeed + 8 ? 1 : speed < expectedSpeed - 8 ? -1 : 0)
    + (strength > 60 ? 0.5 : strength < 35 ? -0.5 : 0)
    + (agility > 60 ? 0.5 : agility < 35 ? -0.5 : 0)
  );

  let stockMove: CombineStockMove;
  if (combinePerformance >= 1.0) stockMove = 'rising';
  else if (combinePerformance <= -1.0) stockMove = 'falling';
  else stockMove = 'neutral';

  // Headline
  let headline: string;
  if (stockMove === 'rising') {
    if (fortyYard < 4.40) headline = 'Blazing speed turns heads at the combine';
    else if (benchPress >= 28) headline = 'Impressive strength on display';
    else headline = 'Strong overall athletic testing';
  } else if (stockMove === 'falling') {
    if (fortyYard > 4.80) headline = 'Slower-than-expected 40 time raises questions';
    else if (benchPress <= 10) headline = 'Concerns about physical strength';
    else headline = 'Below-average athletic testing';
  } else {
    headline = 'Tested as expected — no surprises';
  }

  return { fortyYard, benchPress, vertJump, broadJump, threeCone, shuttle, stockMove, headline };
}

/**
 * Generate combine results for all prospects in a draft class.
 */
export function generateAllCombineResults(prospects: Prospect[]): void {
  for (const p of prospects) {
    p.combine = generateCombineResults(p);
  }
}
