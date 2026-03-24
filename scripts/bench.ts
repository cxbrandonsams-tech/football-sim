/**
 * Simulation benchmark — 1000 plays with average ratings (all = 50).
 * Replicates the exact engine math from simulateGame.ts / config.ts.
 * Run: npx ts-node scripts/bench.ts
 */

import { TUNING } from '../src/engine/config';

const cfg = TUNING;
const N   = 1_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function avg(...v: number[]): number {
  return v.reduce((a, b) => a + b, 0) / v.length;
}

// ── Average ratings ───────────────────────────────────────────────────────────

const R = 50; // every rating

// ── Play type selection (balanced gameplan, default playcalling) ───────────────
// runPct=42%, insideRunPct=55%, shortPassPct=40%, mediumPassPct=35%, deepPassPct=25%

type PlayType = 'inside_run' | 'outside_run' | 'short_pass' | 'medium_pass' | 'deep_pass';

function selectPlay(): PlayType {
  if (Math.random() < 0.42) {
    return Math.random() < 0.55 ? 'inside_run' : 'outside_run';
  }
  const r = Math.random();
  if (r < 0.40) return 'short_pass';
  if (r < 0.75) return 'medium_pass';
  return 'deep_pass';
}

// ── Separation (exact copy of resolveSeparation from simulateGame.ts) ─────────

function resolveSeparation(
  depth: 'short' | 'medium' | 'deep',
  pressureLevel: number,
  paBonus: number,
): number {
  const wrRoute = R; const wrSpeed = R;
  const cbMan   = R; const cbZone  = R; const cbAwar = R; const cbSpd = R;
  const lbAwar  = R; const lbSpd   = R;
  const sfSpeed = R; const sfAwar  = R;
  const sfZone  = R;

  let wrScore: number;
  let defScore: number;

  if (depth === 'short') {
    wrScore  = wrRoute * 0.65 + wrSpeed * 0.35;
    defScore = cbMan   * 0.55 + cbSpd   * 0.30 + cbAwar * 0.15;
  } else if (depth === 'medium') {
    wrScore = wrRoute * 0.55 + wrSpeed * 0.45;
    const primaryCoverage = cbZone * 0.55 + cbAwar * 0.35 + cbSpd * 0.10;
    const closingHelp     = lbAwar * 0.65 + lbSpd  * 0.35;
    defScore = primaryCoverage * 0.70 + closingHelp * 0.30;
  } else {
    wrScore = wrSpeed * 0.70 + wrRoute * 0.30;
    // Range = speed*0.6 + awareness*0.4 (hidden derived)
    const sfRange = sfSpeed * 0.6 + sfAwar * 0.4;
    const cbDef   = cbSpd  * 0.60 + cbZone * 0.40;
    const sfDef   = sfRange * 0.70 + sfZone * 0.30;
    defScore = avg(cbDef, sfDef);
  }

  const base            = wrScore / (wrScore + defScore * cfg.pass.coverageResistance + 1);
  const pressurePenalty = pressureLevel * 0.08;
  return clamp(base + paBonus - pressurePenalty, 0, 1);
}

// ── Throw quality (exact copy of resolveThrowQuality) ─────────────────────────

function resolveThrowQuality(
  depth: 'short' | 'medium' | 'deep',
  pressureLevel: number,
  separationScore: number,
): number {
  const accuracy = R; // shortAccuracy / mediumAccuracy / deepAccuracy all = 50
  const armStr   = R;

  const armWeight         = depth === 'short' ? 0.10 : depth === 'medium' ? 0.25 : 0.45;
  const effectiveAccuracy = accuracy * (1 - armWeight) + armStr * armWeight;

  const accuracyBase =
    depth === 'short'  ? cfg.pass.shortAccuracyBase  :
    depth === 'medium' ? cfg.pass.mediumAccuracyBase :
                         cfg.pass.deepAccuracyBase;

  const accuracyMod     = (effectiveAccuracy - 70) * cfg.pass.accuracyRatingScale;
  const pressurePenalty = pressureLevel * 0.18;
  const separationBonus = separationScore * cfg.pass.separationThrowScale;

  return clamp(accuracyBase + accuracyMod - pressurePenalty + separationBonus, 0, 1);
}

// ── Accumulators ──────────────────────────────────────────────────────────────

let passAttempts = 0;
let completions  = 0;
let interceptions = 0;
let sacks        = 0;
let scrambles    = 0;
let carries      = 0;

let passYardsTotal   = 0;  // on completions only
let yacTotal         = 0;  // post-catch delta
let rushYardsTotal   = 0;
let sackYardsTotal   = 0;

// ── Window state (mirrors resolveWindowState from simulateGame.ts) ────────────

type WindowState = 'open' | 'soft_open' | 'tight' | 'contested' | 'covered';

function resolveWindowState(separation: number): WindowState {
  const w = cfg.pass.window;
  if (separation >= w.openThreshold)      return 'open';
  if (separation >= w.softOpenThreshold)  return 'soft_open';
  if (separation >= w.tightThreshold)     return 'tight';
  if (separation >= w.contestedThreshold) return 'contested';
  return 'covered';
}

// ── Accumulators ──────────────────────────────────────────────────────────────

let sumSeparation  = 0;
let sumThrowQuality = 0;
let sumIntChanceRaw = 0;  // before cap, per incomplete attempt
let intChanceSamples = 0;
const windowCounts: Record<WindowState, number> = {
  open: 0, soft_open: 0, tight: 0, contested: 0, covered: 0,
};
let throwaways = 0;

// ── Simulate N plays ──────────────────────────────────────────────────────────

for (let i = 0; i < N; i++) {
  const type = selectPlay();

  if (type === 'inside_run' || type === 'outside_run') {
    // Run: standard rating-ratio approach
    carries++;
    const oRating  = R; // avg run off rating
    const dRating  = R;
    const baseProb = oRating / (oRating + dRating);
    const success  = Math.random() < clamp(baseProb + cfg.game.offenseAdvantage, 0.05, 0.95);

    let yards: number;
    if (success) {
      const base = type === 'inside_run'
        ? randInt(cfg.run.insideRunMin,  cfg.run.insideRunMax)
        : randInt(cfg.run.outsideRunMin, cfg.run.outsideRunMax);
      // Breakaway check — both use speed = 50 which is below breakawaySpeedThreshold (85)
      yards = base;
    } else {
      yards = randInt(cfg.run.failYardsMin, cfg.run.failYardsMax);
    }
    rushYardsTotal += yards;
    continue;
  }

  // ── Pass play ─────────────────────────────────────────────────────────────

  const depth: 'short' | 'medium' | 'deep' =
    type === 'short_pass'  ? 'short'  :
    type === 'medium_pass' ? 'medium' : 'deep';

  // Protection / sack check
  const dePassRush = R; const olBlocking = R;
  const advantage  = dePassRush - olBlocking;  // = 0
  const rawSackChance = clamp(
    cfg.pass.baseSackChance + advantage * cfg.pass.sackRatingScale,
    cfg.pass.minSackChance,
    cfg.pass.maxSackChance,
  );
  const qbMobility         = R;
  const mobilityBonus      = Math.max(0, (qbMobility - 50) * cfg.pass.mobilityReductionScale);
  const adjustedSackChance = Math.max(0, rawSackChance - mobilityBonus);
  const pressureLevel      = clamp((advantage / 50) * 0.8, 0, 1);
  const sackRoll           = Math.random();

  if (sackRoll < adjustedSackChance) {
    sacks++;
    sackYardsTotal += randInt(-8, -2);
    continue;
  }

  // Scramble — independent of sack window
  const scrambleChance =
    (cfg.pass.scrambleBaseOpportunity + pressureLevel * cfg.pass.scramblePressureScale)
    * (qbMobility / 100);
  if (Math.random() < scrambleChance) {
    scrambles++;
    const yards = randInt(cfg.pass.scrambleYardsMin, cfg.pass.scrambleYardsMax);
    rushYardsTotal += yards;
    continue;
  }

  passAttempts++;

  // Play-action bonus (medium = 0.04)
  const paBonus = cfg.gameplan.playAction['medium'];

  // Separation + throw quality
  const separation   = resolveSeparation(depth, pressureLevel, paBonus);
  const throwQuality = resolveThrowQuality(depth, pressureLevel, separation);
  sumSeparation   += separation;
  sumThrowQuality += throwQuality;

  // Window state
  const windowState = resolveWindowState(separation);
  windowCounts[windowState]++;
  const w   = cfg.pass.window;
  const qbDM = R; // avg decisionMaking = 50

  // QB throwaway on covered windows (avg DM=50 → 0% chance since base=0 and DM at threshold)
  if (windowState === 'covered') {
    const throwawayChance = Math.max(0,
      w.throwawayBaseChance
      + Math.max(0, qbDM - w.throwawayDMThreshold) * w.throwawayDMScale
      - pressureLevel * w.throwawayPressurePenalty,
    );
    if (Math.random() < throwawayChance) {
      throwaways++;
      passYardsTotal += 0;
      continue;
    }
  }

  // Window state success modifier
  const windowSuccessMods: Record<WindowState, number> = {
    open:       w.openSuccessMod,
    soft_open:  w.softOpenSuccessMod,
    tight:      w.tightSuccessMod,
    contested:  w.contestedSuccessMod,
    covered:    w.coveredSuccessMod,
  };
  let windowSuccessMod = windowSuccessMods[windowState];

  // Contested: WR hands vs CB ballSkills (avg=50 vs avg=50 → no change at avg)
  if (windowState === 'contested') {
    windowSuccessMod += (R - R) * w.contestedBallSkillsScale;
  }

  // Success probability (with window state mod)
  const successProb = clamp(throwQuality + cfg.game.offenseAdvantage + windowSuccessMod, 0.05, 0.95);
  const success     = Math.random() < successProb;

  if (!success) {
    // INT check with window state modifiers
    const cbCoverage   = R; const cbBallSkills = R;
    const intAdvantage    = (cbCoverage - qbDM) * cfg.pass.intCoverageScale;
    const ballSkillsBonus = Math.max(0, (cbBallSkills - 50) * cfg.pass.ballSkillsIntScale);
    const throwQualityBonus = Math.max(0, (0.5 - throwQuality) * cfg.pass.intThrowQualityScale);
    const pressureBonus   = pressureLevel * cfg.pass.intPressureScale;
    const windowIntMods: Record<WindowState, number> = {
      open: w.openIntMod, soft_open: w.softOpenIntMod, tight: w.tightIntMod,
      contested: w.contestedIntMod, covered: w.coveredIntMod,
    };
    const windowIntMod = windowIntMods[windowState];
    const badDMIntMod  = (windowState === 'tight' || windowState === 'contested' || windowState === 'covered')
      ? Math.max(0, (50 - qbDM) * w.badDMIntScale) : 0;
    const intChanceRaw    = cfg.pass.baseIntChance + intAdvantage + ballSkillsBonus
                            + throwQualityBonus + pressureBonus + windowIntMod + badDMIntMod;
    const intChance = clamp(intChanceRaw, cfg.pass.minIntChance, cfg.pass.maxIntChance);

    // Record raw (before cap) for diagnostic
    sumIntChanceRaw += intChanceRaw;
    intChanceSamples++;

    if (Math.random() < intChance) {
      interceptions++;
    }
    passYardsTotal += 0; // incompletion
    continue;
  }

  // Completion — yards
  completions++;
  const baseYards =
    depth === 'short'  ? randInt(cfg.passYards.shortMin,  cfg.passYards.shortMax)  :
    depth === 'medium' ? randInt(cfg.passYards.mediumMin, cfg.passYards.mediumMax) :
                         randInt(cfg.passYards.deepMin,   cfg.passYards.deepMax);

  // YAC phase — soft_open gives extra YAC bonus
  const wrYAC    = R; const cbTackle = R; const sfTackle = R; const lbPursue = R;
  const defYAC   = avg(cbTackle, sfTackle, lbPursue);
  const yacWindowBonus = windowState === 'soft_open' ? w.softOpenYACBonus : 0;
  const yacDelta = cfg.pass.baseYACYards + (wrYAC - defYAC) * cfg.pass.yacNetScale + yacWindowBonus;
  const finalYards = Math.max(0, Math.round(baseYards + yacDelta));

  passYardsTotal += finalYards;
  yacTotal       += yacDelta;
}

// ── Results ───────────────────────────────────────────────────────────────────

const totalPlays     = N;
const passInclSacks  = passAttempts + sacks + scrambles;
const incompletions  = passAttempts - completions;

console.log('\n══════════════════════════════════════════════');
console.log(' SIMULATION BENCHMARK — 1000 plays, avg ratings');
console.log('══════════════════════════════════════════════\n');

console.log('PLAY MIX');
console.log(`  Carries:       ${carries}  (${(carries/N*100).toFixed(1)}%)`);
console.log(`  Pass attempts: ${passAttempts}  (${(passAttempts/N*100).toFixed(1)}%)`);
console.log(`  Sacks:         ${sacks}  (${(sacks/N*100).toFixed(1)}%)`);
console.log(`  Scrambles:     ${scrambles}  (${(scrambles/N*100).toFixed(1)}%)`);

console.log('\nPASS STATS');
console.log(`  Completion %:        ${(completions/passAttempts*100).toFixed(1)}%`);
console.log(`  Interception %:      ${(interceptions/passAttempts*100).toFixed(2)}%  (per attempt)`);
console.log(`  INT % (per incompl): ${incompletions > 0 ? (interceptions/incompletions*100).toFixed(1) : '–'}%`);
console.log(`  Yards per attempt:   ${(passYardsTotal/passAttempts).toFixed(2)}`);
console.log(`  Yards per complet:   ${completions > 0 ? (passYardsTotal/completions).toFixed(2) : '–'}`);
console.log(`  Avg YAC per complet: ${completions > 0 ? (yacTotal/completions).toFixed(2) : '–'} yds`);
console.log(`  Sack rate:           ${(sacks/(passAttempts+sacks)*100).toFixed(1)}%  (sacks / dropbacks)`);
console.log(`  Scramble rate:       ${(scrambles/(passAttempts+sacks+scrambles)*100).toFixed(2)}%  (scrambles / dropbacks)`);

console.log('\nRUN STATS');
console.log(`  Yards per carry:     ${(rushYardsTotal/carries).toFixed(2)}`);

console.log('\nDIAGNOSTICS');
console.log(`  Avg separation score:       ${(sumSeparation/passAttempts).toFixed(4)}`);
console.log(`  Avg throw quality:          ${(sumThrowQuality/passAttempts).toFixed(4)}`);
console.log(`  Avg INT chance (pre-cap):   ${intChanceSamples > 0 ? (sumIntChanceRaw/intChanceSamples).toFixed(4) : '–'}`);
console.log(`  Throwaways:                 ${throwaways}`);
console.log('\nWINDOW STATE DISTRIBUTION (pass attempts)');
const wa = passAttempts;
console.log(`  open:      ${windowCounts.open}  (${(windowCounts.open/wa*100).toFixed(1)}%)`);
console.log(`  soft_open: ${windowCounts.soft_open}  (${(windowCounts.soft_open/wa*100).toFixed(1)}%)`);
console.log(`  tight:     ${windowCounts.tight}  (${(windowCounts.tight/wa*100).toFixed(1)}%)`);
console.log(`  contested: ${windowCounts.contested}  (${(windowCounts.contested/wa*100).toFixed(1)}%)`);
console.log(`  covered:   ${windowCounts.covered}  (${(windowCounts.covered/wa*100).toFixed(1)}%)`);

// ── Sensitivity analysis ──────────────────────────────────────────────────────
// Compute the delta in success probability when one rating moves 50 → 80

console.log('\n══════════════════════════════════════════════');
console.log(' SENSITIVITY: rating 50 vs 80 (medium pass baseline)');
console.log('══════════════════════════════════════════════\n');

function computePassSuccess(overrides: Partial<{
  shortAcc: number; medAcc: number; deepAcc: number; armStr: number;
  qbDecision: number;
  wrRoute: number; wrSpeed: number;
  cbZone: number; cbAwar: number; cbSpd: number; cbMan: number;
  cbBallSkills: number; cbManCov: number;
  lbAwar: number; lbSpd: number;
  sfSpeed: number; sfAwar: number;
  dePassRush: number; olBlocking: number;
}>, depth: 'medium' = 'medium'): { sep: number; throwQ: number; successP: number } {
  const o = { ...{
    shortAcc: 50, medAcc: 50, deepAcc: 50, armStr: 50,
    qbDecision: 50,
    wrRoute: 50, wrSpeed: 50,
    cbZone: 50, cbAwar: 50, cbSpd: 50, cbMan: 50,
    cbBallSkills: 50, cbManCov: 50,
    lbAwar: 50, lbSpd: 50,
    sfSpeed: 50, sfAwar: 50,
    dePassRush: 50, olBlocking: 50,
  }, ...overrides };

  // Pressure
  const adv      = o.dePassRush - o.olBlocking;
  const pressure = clamp((adv / 50) * 0.8, 0, 1);

  // Separation (medium)
  const wrS = o.wrRoute * 0.55 + o.wrSpeed * 0.45;
  const pc  = o.cbZone  * 0.55 + o.cbAwar  * 0.35 + o.cbSpd * 0.10;
  const ch  = o.lbAwar  * 0.65 + o.lbSpd   * 0.35;
  const ds  = pc * 0.70 + ch * 0.30;
  const sep = clamp(wrS / (wrS + ds * cfg.pass.coverageResistance + 1)
              + cfg.gameplan.playAction['medium'] - pressure * 0.08, 0, 1);

  // Throw quality (medium)
  const accuracy = o.medAcc;
  const armW     = 0.25;
  const effAcc   = accuracy * (1 - armW) + o.armStr * armW;
  const throwQ   = clamp(cfg.pass.mediumAccuracyBase
    + (effAcc - 70) * cfg.pass.accuracyRatingScale
    - pressure * 0.18
    + sep * cfg.pass.separationThrowScale, 0, 1);

  // Window state modifier
  const ws = resolveWindowState(sep);
  const wm = cfg.pass.window;
  const windowMods: Record<WindowState, number> = {
    open: wm.openSuccessMod, soft_open: wm.softOpenSuccessMod, tight: wm.tightSuccessMod,
    contested: wm.contestedSuccessMod, covered: wm.coveredSuccessMod,
  };
  let windowMod = windowMods[ws];
  if (ws === 'contested') windowMod += (50 - o.cbBallSkills) * wm.contestedBallSkillsScale;

  const successP = clamp(throwQ + cfg.game.offenseAdvantage + windowMod, 0.05, 0.95);
  return { sep, throwQ, successP };
}

function computeIntChance(throwQ: number, pressure: number, overrides?: {
  cbManCov?: number; qbDecision?: number; cbBallSkills?: number;
}): number {
  const cbManCov     = overrides?.cbManCov     ?? 50;
  const qbDecision   = overrides?.qbDecision   ?? 50;
  const cbBallSkills = overrides?.cbBallSkills ?? 50;
  const intAdvantage    = (cbManCov - qbDecision) * cfg.pass.intCoverageScale;
  const ballSkillsBonus = Math.max(0, (cbBallSkills - 50) * cfg.pass.ballSkillsIntScale);
  const tqBonus = Math.max(0, (0.5 - throwQ) * cfg.pass.intThrowQualityScale);
  const prBonus = pressure * cfg.pass.intPressureScale;
  return clamp(
    cfg.pass.baseIntChance + intAdvantage + ballSkillsBonus + tqBonus + prBonus,
    cfg.pass.minIntChance,
    cfg.pass.maxIntChance,
  );
}

const base = computePassSuccess({});
const ratings: [string, Partial<Parameters<typeof computePassSuccess>[0]>][] = [
  ['QB mediumAccuracy 50→80',  { medAcc:     80 }],
  ['QB armStrength 50→80',     { armStr:     80 }],
  ['QB decisionMaking 50→80',  { qbDecision: 80 }],
  ['WR routeRunning 50→80',    { wrRoute:    80 }],
  ['WR speed 50→80',           { wrSpeed:    80 }],
  ['CB zoneCoverage 50→80',    { cbZone:     80 }],
  ['CB awareness 50→80',       { cbAwar:     80 }],
  ['CB ballSkills 50→80',      { cbBallSkills: 80 }],
  ['CB manCoverage 50→80',     { cbManCov:   80 }],
  ['LB awareness 50→80',       { lbAwar:     80 }],
  ['DE passRush 50→80',        { dePassRush: 80 }],
  // OL passBlocking reduces sacks but doesn't appear in separation/throw math;
  // effect is shown via sack rate delta, not success% delta
];

console.log(`  Baseline (all 50): sep=${base.sep.toFixed(3)} throwQ=${base.throwQ.toFixed(3)} success=${(base.successP*100).toFixed(1)}%\n`);

type SensRow = { label: string; delta: number; intDelta: number; };
const rows: SensRow[] = [];

for (const [label, override] of ratings) {
  const r = computePassSuccess(override);
  const delta = r.successP - base.successP;
  const baseInt = computeIntChance(base.throwQ, 0);
  const newInt  = computeIntChance(r.throwQ, 0, {
    ...(override.cbManCov     !== undefined && { cbManCov:     override.cbManCov }),
    ...(override.qbDecision   !== undefined && { qbDecision:   override.qbDecision }),
    ...(override.cbBallSkills !== undefined && { cbBallSkills: override.cbBallSkills }),
  });
  const intDelta = newInt - baseInt;
  rows.push({ label, delta, intDelta });
  const sign = delta >= 0 ? '+' : '';
  console.log(`  ${label.padEnd(30)} success ${sign}${(delta*100).toFixed(1)}pp  INT ${intDelta >= 0 ? '+' : ''}${(intDelta*100).toFixed(2)}pp`);
}

const bySuccess = [...rows].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
const byInt     = [...rows].sort((a, b) => Math.abs(b.intDelta) - Math.abs(a.intDelta));

console.log('\n');
console.log(`  Biggest impact on PASS SUCCESS:       ${bySuccess[0]!.label}  (${(bySuccess[0]!.delta*100 >= 0 ? '+' : '')}${(bySuccess[0]!.delta*100).toFixed(1)}pp)`);
console.log(`  Biggest impact on INTERCEPTIONS:      ${byInt[0]!.label}  (INT ${byInt[0]!.intDelta >= 0 ? '+' : ''}${(byInt[0]!.intDelta*100).toFixed(2)}pp)`);

// OL passBlocking: affects sack rate only, not shown in success% above
const baseAdj    = clamp(cfg.pass.baseSackChance, cfg.pass.minSackChance, cfg.pass.maxSackChance);
const olImproved = clamp(cfg.pass.baseSackChance + (50 - 80) * cfg.pass.sackRatingScale,
                         cfg.pass.minSackChance, cfg.pass.maxSackChance);
console.log(`\n  Note — OL passBlocking 50→80: sack rate drops ${(baseAdj*100).toFixed(1)}% → ${(olImproved*100).toFixed(1)}%`);
console.log(`         (OL passBlocking only affects sack rate, not throw success)\n`);
