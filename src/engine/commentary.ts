/**
 * commentary.ts — Phase-based play-by-play commentary generation.
 *
 * Produces two outputs per play:
 *   commentaryFull  — rich multi-sentence broadcast paragraph (for "current play" display)
 *   commentaryLog   — compact one-liner (for historical play log)
 *
 * v3: multi-style system (neutral/hype/analytical), defender names, drive context,
 *     special situations, penalty integration, expanded phrase pools.
 */

import { type PlayEvent, type CommentaryMeta, type WindowState, type CommentaryStyle } from '../models/PlayEvent';

// ── Style State ──────────────────────────────────────────────────────────────

let _style: CommentaryStyle = 'neutral';

/** Set the active commentary style for subsequent generation calls. */
export function setCommentaryStyle(style: CommentaryStyle) { _style = style; }

// ── Utility ──────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/**
 * Style-aware pick: selects from a style-specific pool if provided,
 * falling back to neutral (the first argument).
 */
function sp(neutral: string[], hype?: string[], analytical?: string[]): string {
  if (_style === 'hype' && hype) return pick(hype);
  if (_style === 'analytical' && analytical) return pick(analytical);
  return pick(neutral);
}

/** Pick from array only ~50% of the time. Returns empty string otherwise. */
function maybePick(arr: string[], chance = 0.5): string {
  return Math.random() < chance ? pick(arr) : '';
}

// Situation helpers derived from the PlayEvent itself (no metadata needed)
function isRedZone(ev: PlayEvent): boolean { return ev.yardLine >= 80; }
function isGoalToGo(ev: PlayEvent): boolean { return ev.yardLine + ev.distance >= 100; }
function is3rdDown(ev: PlayEvent): boolean { return ev.down === 3; }
function is4thDown(ev: PlayEvent): boolean { return ev.down === 4; }
function isLongYardage(ev: PlayEvent): boolean { return ev.distance >= 8; }
function isShortYardage(ev: PlayEvent): boolean { return ev.distance <= 2; }

// ══════════════════════════════════════════════════════════════════════════════
// DRIVE CONTEXT OPENERS — prepended ~30% of the time when context adds info
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Narrative layer — generates drive-level and game-level context lines.
 * Fires probabilistically (~25-40% of plays) and picks the highest-priority
 * applicable context. Only one narrative line per play to avoid overload.
 */
function narrativeOpener(ev: PlayEvent): string {
  const meta = ev.commentaryMeta;
  if (!meta) return '';

  const prev = meta.prevPlayResult;
  const prevType = meta.prevPlayType;
  const driveNum = meta.drivePlayNum ?? 1;
  const driveYds = meta.driveYards ?? 0;
  const driveFDs = meta.driveFirstDowns ?? 0;
  const scoreDiff = meta.scoreDiff ?? 0;
  const consRuns = meta.consecutiveRuns ?? 0;
  const consPasses = meta.consecutivePasses ?? 0;
  const consCompletions = meta.consecutiveCompletions ?? 0;
  const consNegative = meta.consecutiveNegative ?? 0;
  const isPass = ev.type === 'short_pass' || ev.type === 'medium_pass' || ev.type === 'deep_pass';
  const isRun = ev.type === 'inside_run' || ev.type === 'outside_run';
  const prevWasPass = prevType === 'short_pass' || prevType === 'medium_pass' || prevType === 'deep_pass';

  // ── Priority 1: Game-critical situations (fire ~50%) ───────────────────

  // Two-minute drill urgency
  if (meta.isTwoMinute && scoreDiff < 0 && Math.random() < 0.45) {
    return pick([
      'Clock is ticking — they need to move fast.',
      'Running out of time here.',
      'Hurry-up, no huddle — they need points.',
      'The clock is not their friend.',
      'Every second counts now.',
    ]);
  }

  // Protecting a late lead
  if (meta.isTwoMinute && scoreDiff > 0 && isRun && Math.random() < 0.4) {
    return pick([
      'Trying to chew clock here.',
      'Run the ball, run the clock.',
      'Protecting the lead with the ground game.',
      'Just keep it moving and burn time.',
    ]);
  }

  // Big deficit comeback drive
  if (scoreDiff <= -14 && ev.quarter >= 3 && Math.random() < 0.3) {
    return pick([
      'They need a big play to get back in this.',
      'Down two scores, they have to push.',
      'It\'s now or never for this offense.',
      'Running out of opportunities to close the gap.',
    ]);
  }

  // Need points (any deficit in red zone)
  if (scoreDiff < 0 && isRedZone(ev) && Math.random() < 0.35) {
    return pick([
      'They need to come away with points here.',
      'Can\'t leave the red zone empty-handed.',
      'This is a must-score trip.',
    ]);
  }

  // ── Priority 2: Drive narrative (fire ~30-40%) ─────────────────────────

  // Stalled drive (multiple negative plays)
  if (consNegative >= 2 && Math.random() < 0.5) {
    return pick([
      'Nothing working on this drive so far.',
      'The offense is spinning its wheels.',
      'They need to find something that works.',
      'This drive is going nowhere fast.',
      'Two straight negative plays — they need a spark.',
    ]);
  }

  // After a sack
  if (prevType === 'sack' && Math.random() < 0.5) {
    return pick([
      'After the sack, they look to regroup.',
      'They need to settle things down after that sack.',
      'Coming off the sack, they try to get back on track.',
      'Shaking off the pressure play.',
    ]);
  }

  // Long, productive drive
  if (driveNum >= 8 && driveYds >= 40 && Math.random() < 0.35) {
    return pick([
      `${driveNum} plays into this drive now.`,
      'This has been a long, grinding drive.',
      'They just keep moving the chains.',
      `They've covered ${driveYds} yards on this drive.`,
      'Methodical drive — eating up the field.',
    ]);
  }

  // Drive rolling (multiple first downs)
  if (driveFDs >= 2 && driveNum >= 4 && Math.random() < 0.25) {
    return pick([
      'This drive is rolling now.',
      'The offense has found a rhythm.',
      'They\'re picking apart the defense on this drive.',
      'Everything is clicking right now.',
    ]);
  }

  // ── Priority 3: Streak calls (fire ~30-40%) ───────────────────────────

  // Completion streak
  if (consCompletions >= 3 && isPass && Math.random() < 0.45) {
    return pick([
      `That's ${consCompletions} straight completions.`,
      'The QB is locked in right now.',
      'He hasn\'t missed yet on this drive.',
      `${consCompletions} completions in a row — he's feeling it.`,
    ]);
  }

  // Consecutive runs
  if (consRuns >= 3 && isRun && Math.random() < 0.4) {
    return pick([
      `They keep pounding it — ${consRuns} straight runs.`,
      'They\'re committed to the ground game.',
      'Run, run, run — they\'re wearing the defense down.',
      'Another handoff — they\'re not going away from the run.',
    ]);
  }

  // Consecutive passes
  if (consPasses >= 3 && isPass && Math.random() < 0.35) {
    return pick([
      'All passing on this drive.',
      'They\'re throwing it every play.',
      'The run game is on the shelf for now.',
      `${consPasses} straight passes — they\'re airing it out.`,
    ]);
  }

  // ── Priority 4: Light context (fire ~20-30%) ──────────────────────────

  // After incompletion, trying again
  if (prev === 'fail' && prevWasPass && isPass && Math.random() < 0.3) {
    return pick([
      'Looking to connect this time.',
      'Trying again through the air.',
      'Back to the pass after the incompletion.',
    ]);
  }

  // First play of drive
  if (driveNum === 1 && Math.random() < 0.3) {
    return pick([
      'New drive.',
      'Starting fresh here.',
      'First play of the possession.',
      'New set of downs.',
    ]);
  }

  // Red zone entry
  if (isRedZone(ev) && driveNum > 1 && (meta.driveYards ?? 0) < 20 && Math.random() < 0.25) {
    return pick([
      'In the red zone now.',
      'Inside the twenty — time to finish.',
      'Scoring range here.',
    ]);
  }

  // General game situation (trailing by one score)
  if (scoreDiff >= -7 && scoreDiff < 0 && ev.quarter >= 3 && Math.random() < 0.15) {
    return pick([
      'Still a one-score game.',
      'Very much within striking distance.',
      'A touchdown ties it up.',
    ]);
  }

  // Building a lead
  if (scoreDiff >= 14 && isRun && Math.random() < 0.2) {
    return pick([
      'Running the ball with a comfortable lead.',
      'No need to take chances here.',
      'Grinding clock with the lead.',
    ]);
  }

  return '';
}

// ══════════════════════════════════════════════════════════════════════════════
// SITUATION TAGS — appended for high-leverage downs/positions
// ══════════════════════════════════════════════════════════════════════════════

function situationPrefix(ev: PlayEvent): string {
  // 4th down — always tag it
  if (is4thDown(ev)) {
    if (isGoalToGo(ev)) return pick(['Fourth and goal.', 'They\'re going for it on fourth and goal.']);
    if (isShortYardage(ev)) return pick(['Fourth and short — they\'re going for it.', 'Gutsy call — going for it on fourth down.']);
    return pick(['Fourth down — do or die.', 'They elect to go for it on fourth.', 'Big gamble here on fourth down.']);
  }
  // 3rd down — tag ~60% of the time
  if (is3rdDown(ev) && Math.random() < 0.6) {
    if (isGoalToGo(ev)) return pick(['Third and goal.', 'Big chance here — third and goal.']);
    if (isLongYardage(ev)) return pick([`Third and long, ${ev.distance} to go.`, `Third and ${ev.distance} — tough conversion.`]);
    if (isShortYardage(ev)) return pick(['Third and short.', 'Just need a couple yards here on third.']);
    return pick(['Third down.', `Third and ${ev.distance}.`, 'Money down here.']);
  }
  // Goal to go (non-3rd/4th)
  if (isGoalToGo(ev) && Math.random() < 0.4) {
    return pick(['Inside the five.', 'Goal to go.', 'Knocking on the door.']);
  }
  // Red zone (non-goal-to-go)
  if (isRedZone(ev) && Math.random() < 0.25) {
    return pick(['In the red zone now.', 'Inside the twenty.']);
  }
  return '';
}

// ══════════════════════════════════════════════════════════════════════════════
// PENALTY INTEGRATION
// ══════════════════════════════════════════════════════════════════════════════

const PENALTY_NAMES: Record<string, string> = {
  dpi:          'pass interference',
  def_holding:  'defensive holding',
  roughing:     'roughing the passer',
  offsides:     'offsides',
  off_holding:  'holding',
  false_start:  'false start',
};

function penaltySuffix(ev: PlayEvent): string {
  if (!ev.penalty) return '';
  const name = PENALTY_NAMES[ev.penalty.type] ?? ev.penalty.type;

  if (ev.penalty.accepted) {
    if (ev.penalty.onOffense) {
      return pick([
        ` But there's a flag — ${name} on the offense. ${Math.abs(ev.penalty.yards)}-yard penalty.`,
        ` Flag on the play. ${name.charAt(0).toUpperCase() + name.slice(1)} on the offense, ${Math.abs(ev.penalty.yards)} yards.`,
        ` The play is coming back — ${name}, ${Math.abs(ev.penalty.yards)} yards.`,
      ]);
    }
    return pick([
      ` Flag comes in — ${name} on the defense.${ev.penalty.autoFirst ? ' Automatic first down.' : ''}`,
      ` Penalty flag! ${name.charAt(0).toUpperCase() + name.slice(1)}, ${Math.abs(ev.penalty.yards)} yards on the defense.${ev.penalty.autoFirst ? ' First down.' : ''}`,
    ]);
  }
  // Declined
  return pick([
    ` There was a flag for ${name}, but it's declined.`,
    ` Penalty for ${name} is waved off — declined.`,
  ]);
}

// ══════════════════════════════════════════════════════════════════════════════
// PHRASE POOLS — organized by play phase, NOT full-play templates
// ══════════════════════════════════════════════════════════════════════════════

// ── Pre-snap / Protection ────────────────────────────────────────────────────

const CLEAN_POCKET = [
  'Pocket is clean.',
  'Good protection up front.',
  'The line gives him plenty of time.',
  'Clean pocket, he surveys the field.',
  'No pressure at all.',
  'Great blocking by the offensive line.',
  'Steps up in a solid pocket.',
  'Has time to go through his reads.',
  'The protection holds up nicely.',
];

const MODERATE_PRESSURE = [
  'Feeling a bit of pressure.',
  'The pocket starts to collapse.',
  'Edge rusher closing in.',
  'Slight pressure off the edge.',
  'The rush is getting there.',
  'He senses pressure and slides in the pocket.',
  'The defensive end is turning the corner.',
  'Pocket getting a little muddy.',
  'He has to step up to avoid the rush.',
];

const HEAVY_PRESSURE = [
  'Under heavy pressure!',
  'The pocket is collapsing!',
  'The rush is all over him!',
  'Barely has time back there!',
  'The blitz is getting home!',
  'Pass rush is overwhelming the protection!',
  'He has to get rid of it, pressure in his face!',
  'Interior pressure forces him off his spot!',
  'They\'re coming from everywhere!',
];

// ══════════════════════════════════════════════════════════════════════════════
// STYLE OVERRIDES — hype and analytical variants for high-impact pools
// ══════════════════════════════════════════════════════════════════════════════

// ── Pressure ─────────────────────────────────────────────────────────────────
const CLEAN_POCKET_HYPE = [
  'He\'s got ALL DAY back there!',
  'The protection is INCREDIBLE!',
  'Nobody is touching this quarterback!',
  'He could set up a lawn chair back there!',
  'The pocket is pristine — all the time in the world!',
];
const CLEAN_POCKET_ANALYTICAL = [
  'Pocket integrity is solid.',
  'Five-man protection holding up well.',
  'No pressure on the quarterback.',
  'Clean reads from a stable pocket.',
  'Pass rush generating zero displacement.',
];
const HEAVY_PRESSURE_HYPE = [
  'HERE THEY COME! Pressure everywhere!',
  'The pocket EXPLODES around him!',
  'He\'s in TROUBLE!',
  'LOOK OUT! The rush is RIGHT THERE!',
  'NO TIME! They\'re all over him!',
];
const HEAVY_PRESSURE_ANALYTICAL = [
  'Immediate pressure — protection failure.',
  'Interior collapse at the point of attack.',
  'Pocket time well under two seconds.',
  'The rush wins the rep off the snap.',
  'Schematic pressure — they brought more than the line can handle.',
];

// ── Throw Quality ────────────────────────────────────────────────────────────
const GREAT_THROW_HYPE = [
  'WHAT A THROW!',
  'Are you KIDDING me?! Perfect ball!',
  'That is an ELITE throw right there!',
  'LASER! Right on the money!',
  'You can NOT make a better throw than that!',
];
const GREAT_THROW_ANALYTICAL = [
  'Perfectly placed, anticipation throw.',
  'Excellent ball placement to the back shoulder.',
  'Timing route — ball arrives before the defender can react.',
  'High-level throw into a tight window.',
  'On-platform, full-field read, accurate delivery.',
];
const SHAKY_THROW_HYPE = [
  'Ooh, that ball was UGLY!',
  'Not his best work there!',
  'He just HUNG that one up!',
  'Yikes — that wobbled out of his hand!',
];
const SHAKY_THROW_ANALYTICAL = [
  'Poor ball placement — off target.',
  'Footwork was off, ball floated.',
  'Late read, late throw.',
  'Accuracy issues — not ideal location.',
];

// ── Catch / Completion ───────────────────────────────────────────────────────
const CONTESTED_CATCH_HYPE = [
  (n: string) => `WHAT A CATCH by ${n}!!! Unbelievable!`,
  (n: string) => `${n} goes UP AND GETS IT! Are you kidding me?!`,
  (n: string) => `OH MY! ${n} rips it away from the defender!`,
  (n: string) => `${n} with the SPECTACULAR grab!`,
  (n: string) => `Hands of GLUE! ${n} won't be denied!`,
];
const CONTESTED_CATCH_ANALYTICAL = [
  (n: string) => `${n} wins the catch point — strong hands at the high point.`,
  (n: string) => `Contested catch by ${n} — excellent body control through contact.`,
  (n: string) => `${n} wins the 50-50 ball with superior positioning.`,
  (n: string) => `${n} secures it through the hit — that's a catch radius play.`,
];

// ── TD Calls ─────────────────────────────────────────────────────────────────
const TD_PASS_HYPE = [
  'TOUCHDOWN!!! OH WHAT A PLAY!',
  'HE SCORES!!! ARE YOU NOT ENTERTAINED?!',
  'TOUCHDOWN! THE CROWD ERUPTS!',
  'IT\'S IN! IT\'S GOOD! TOUCHDOWN!!!',
  'WOW! WHAT A STRIKE! TOUCHDOWN!!!',
  'THIS PLACE IS GOING CRAZY! TOUCHDOWN!',
];
const TD_PASS_ANALYTICAL = [
  'Touchdown. Excellent play design.',
  'That\'s a score. Schematic win there.',
  'Touchdown — took what the defense gave him.',
  'They find the end zone. Well-executed.',
  'Scoring play. Clean read, clean throw.',
];
const TD_RUN_HYPE = [
  'HE\'S IN!!! TOUCHDOWN!!!',
  'PUNCHES IT IN! WHAT A DRIVE!',
  'TOUCHDOWN! LOOK AT THAT EFFORT!',
  'NOTHING STOPS HIM! TOUCHDOWN!!!',
  'HE WILL NOT BE DENIED! SCORES!!!',
];
const TD_RUN_ANALYTICAL = [
  'Touchdown. Good blocking up front.',
  'He scores — the line created the lane.',
  'In the end zone. Play-side gap was clean.',
  'Rushing touchdown. Converted in the red zone.',
];

// ── Sack Calls ───────────────────────────────────────────────────────────────
const SACK_WITH_NAME_HYPE = [
  (qb: string, loss: number, def: string) => `${def} DESTROYS ${qb}! ${loss}-yard sack! GOODNIGHT!`,
  (qb: string, loss: number, def: string) => `BOOM! ${def} BURIES ${qb}! What a hit! Loss of ${loss}!`,
  (qb: string, loss: number, def: string) => `${def} is UNBLOCKABLE! ${qb} goes down HARD! ${loss}-yard loss!`,
  (qb: string, loss: number, def: string) => `OH! ${def} just LEVELED ${qb}! ${loss}-yard sack!`,
];
const SACK_WITH_NAME_ANALYTICAL = [
  (qb: string, loss: number, def: string) => `${def} converts the pressure to a sack. ${qb} down for ${loss}. Good rush plan.`,
  (qb: string, loss: number, def: string) => `Sack by ${def}. Won his rep on the edge. ${loss}-yard loss for ${qb}.`,
  (qb: string, loss: number, def: string) => `${def} collapses the pocket. ${qb} sacked for ${loss}. Protection breakdown.`,
];

// ── INT Calls ────────────────────────────────────────────────────────────────
const INT_WITH_NAME_HYPE = [
  (qb: string, wr: string, db: string) => `INTERCEPTED!!! ${db} PICKS IT OFF! ${qb} is STUNNED!`,
  (qb: string, wr: string, db: string) => `OH NO! ${db} JUMPS THE ROUTE! PICKED! PICKED! PICKED!`,
  (qb: string, wr: string, db: string) => `${db} SNAGS IT! WHAT A PLAY! ${qb} wants that one back!`,
  (qb: string, wr: string, db: string) => `TURNOVER!!! ${db} reads ${qb} like a BOOK! Interception!`,
];
const INT_WITH_NAME_ANALYTICAL = [
  (qb: string, wr: string, db: string) => `Intercepted by ${db}. ${qb} threw into a closing window to ${wr}. Bad decision.`,
  (qb: string, wr: string, db: string) => `${db} jumps the route on ${wr}. Interception. ${qb} didn't see the underneath coverage.`,
  (qb: string, wr: string, db: string) => `Turnover. ${db} reads ${qb}'s eyes and picks it off. Poor field vision.`,
];

// ── Run Explosive ────────────────────────────────────────────────────────────
const RUN_BIG_GAIN_HYPE = [
  (y: number) => `LOOK AT HIM GO! ${y} yards! What a RUN!`,
  (y: number) => `EXPLOSIVE! ${y} yards and still churning!`,
  (y: number) => `HE RIPS OFF ${y}! The defense had NO answer!`,
  (y: number) => `${y} YARDS! This guy is a MACHINE!`,
];
const RUN_BIG_GAIN_ANALYTICAL = [
  (y: number) => `${y}-yard gain. Second-level running — he read the blocks well.`,
  (y: number) => `${y} yards. Created by a combination block at the point of attack.`,
  (y: number) => `${y} on the carry. Decisive cut, then acceleration through the crease.`,
];
const RUN_BREAKAWAY_HYPE = [
  'HE\'S GONE!!! NOBODY CATCHING HIM!',
  'LOOK AT THAT SPEED! HE\'S FLYING!',
  'SEE YA! He is OUT OF THERE!',
  'BREAKAWAY RUN! THIS IS INCREDIBLE!',
];
const RUN_BREAKAWAY_ANALYTICAL = [
  'Breakaway run. Hit the second level at full speed.',
  'Into the open field — pursuit angles won\'t catch him.',
  'Big play. Once he cleared the line, the safety couldn\'t close.',
];

// ══════════════════════════════════════════════════════════════════════════════

function pressurePhrase(level: number, defName?: string): string {
  if (level < 0.25) return sp(CLEAN_POCKET, CLEAN_POCKET_HYPE, CLEAN_POCKET_ANALYTICAL);
  if (level < 0.55) {
    if (defName && Math.random() < 0.4) {
      return pick([
        `${defName} is getting close off the edge.`,
        `Pressure from ${defName}.`,
        `${defName} wins his rush — the QB feels it.`,
      ]);
    }
    return pick(MODERATE_PRESSURE);
  }
  if (defName && Math.random() < 0.35) {
    return pick([
      `${defName} is bearing down on him!`,
      `Here comes ${defName}!`,
      `${defName} blows through the protection!`,
    ]);
  }
  return sp(HEAVY_PRESSURE, HEAVY_PRESSURE_HYPE, HEAVY_PRESSURE_ANALYTICAL);
}

// ── Window / Coverage ────────────────────────────────────────────────────────

const WINDOW_PHRASES: Record<WindowState, string[]> = {
  open: [
    'Wide open!',
    'Nobody within five yards.',
    'The defense lost him completely.',
    'He has acres of space.',
    'Blown coverage — he\'s completely free.',
    'The receiver shakes his man.',
    'Separation is there in a big way.',
  ],
  soft_open: [
    'Gets a step on the defender.',
    'Found a soft spot in the zone.',
    'Creates just enough separation.',
    'Gets a half-step on his man.',
    'Settles into the window between the zones.',
    'He\'s got room to work with.',
    'Finds an opening in the coverage.',
  ],
  tight: [
    'Tight coverage.',
    'The defender is right there.',
    'Not much room to work with.',
    'Coverage is snug.',
    'Defender is stride for stride.',
    'Very little daylight in the coverage.',
    'It\'s a small window.',
    'The corner stays in phase.',
  ],
  contested: [
    'Contested throw!',
    'He\'s going to have to fight for this one.',
    'Defender draped all over him.',
    'Double coverage on the receiver.',
    'Corner is right in his hip pocket.',
    'This is going to be a 50-50 ball.',
    'He has to thread it through traffic.',
    'Tight window to squeeze it in.',
  ],
  covered: [
    'He\'s blanketed.',
    'There\'s nothing there.',
    'Complete coverage — no window.',
    'The defender has him locked up.',
    'Absolutely no separation.',
    'Receiver can\'t get free.',
    'That window is closed.',
  ],
};

// ── Throw Delivery ───────────────────────────────────────────────────────────

const GREAT_THROW = [
  'Delivers a perfect strike.',
  'Throws a dime.',
  'Puts it right on the money.',
  'Beautiful ball placement.',
  'Drops it in the bucket.',
  'Threading the needle!',
  'What a throw!',
  'Pinpoint accuracy on the delivery.',
  'Right on the numbers.',
  'Rifle throw, perfectly placed.',
];

const GOOD_THROW = [
  'Fires it in there.',
  'Gets the throw off.',
  'Delivers on target.',
  'Puts it where only his guy can get it.',
  'Solid throw.',
  'Good ball from the quarterback.',
  'Zips it in there.',
  'Accurate throw into the window.',
];

const SHAKY_THROW = [
  'Ball is a little off the mark.',
  'Forces it in there.',
  'Not his best throw.',
  'A bit behind the receiver.',
  'Throws it low.',
  'Has to adjust to a wobbly ball.',
  'Not ideal placement.',
  'Ball sails on him a bit.',
  'Throw has too much air under it.',
];

function throwPhrase(quality: number): string {
  if (quality > 0.7) return sp(GREAT_THROW, GREAT_THROW_HYPE, GREAT_THROW_ANALYTICAL);
  if (quality > 0.4) return pick(GOOD_THROW);
  return sp(SHAKY_THROW, SHAKY_THROW_HYPE, SHAKY_THROW_ANALYTICAL);
}

// ── Catch Result ─────────────────────────────────────────────────────────────

const CATCH_PHRASES = [
  (name: string) => `${name} brings it in.`,
  (name: string) => `${name} hauls it in.`,
  (name: string) => `${name} makes the grab.`,
  (name: string) => `Caught by ${name}.`,
  (name: string) => `${name} secures it.`,
  (name: string) => `${name} reels it in.`,
  (name: string) => `${name} pulls it in cleanly.`,
  (name: string) => `${name} makes the catch.`,
];

const CONTESTED_CATCH = [
  (name: string) => `${name} fights through the contact and makes the catch!`,
  (name: string) => `${name} battles for it and comes down with the ball!`,
  (name: string) => `Incredible grab by ${name} through tight coverage!`,
  (name: string) => `${name} high-points the ball and brings it down!`,
  (name: string) => `What a catch by ${name}, winning the battle at the point!`,
  (name: string) => `${name} comes down with it despite the tight coverage!`,
  (name: string) => `${name} goes up and gets it — strong hands!`,
  (name: string) => `Tough grab by ${name}, absorbing the hit.`,
];

const INCOMPLETION_PLAIN = [
  (wr: string) => `Incomplete, intended for ${wr}.`,
  (wr: string) => `The pass falls incomplete — ${wr} can't come up with it.`,
  (wr: string) => `${wr} gets his hands on it but can't hold on.`,
  (wr: string) => `Falls to the turf, just out of ${wr}'s reach.`,
  (wr: string) => `Can't connect with ${wr}.`,
  (wr: string) => `The ball skips off ${wr}'s fingertips.`,
  (wr: string) => `${wr} can't adjust in time — incomplete.`,
];

const INCOMPLETION_BREAKUP = [
  (wr: string, db: string) => `Broken up by ${db}! Great coverage on ${wr}.`,
  (wr: string, db: string) => `${db} knocks it away from ${wr}! Nice play by the defender.`,
  (wr: string, db: string) => `${db} gets a hand in there — incomplete to ${wr}.`,
  (wr: string, db: string) => `Pass to ${wr} is knocked down by ${db}.`,
  (wr: string, db: string) => `${db} breaks up the pass intended for ${wr}.`,
  (wr: string, db: string) => `Tight coverage by ${db} — ${wr} can't haul it in.`,
];

const THROWAWAY = [
  'Throws it away.',
  'Wisely tosses it out of bounds.',
  'Gets rid of it — lives to fight another down.',
  'Throws it into the dirt.',
  'Smart decision, throws it away.',
  'No one open — fires it out of bounds.',
  'He checks down and throws it at his receiver\'s feet.',
  'Sails it out of bounds rather than forcing it.',
];

// ── YAC / After catch ────────────────────────────────────────────────────────

const YAC_SHORT = [
  (n: number) => `Picks up ${n} more after the catch.`,
  (n: number) => `Gets an extra ${n} on the ground.`,
  (n: number) => `Adds ${n} with his legs.`,
  (n: number) => `Fights for ${n} more after the reception.`,
];

const YAC_BIG = [
  (n: number, db?: string) => `Makes ${db ? db : 'a man'} miss and adds ${n} after the catch!`,
  (n: number) => `Breaks a tackle and gains another ${n}!`,
  (n: number) => `He's still running — ${n} yards after the catch!`,
  (n: number) => `Shakes the defender and picks up ${n} more!`,
  (n: number) => `Turns on the jets for ${n} more!`,
  (n: number) => `Puts a move on and gets ${n} after the reception!`,
];

const BREAKAWAY_PASS = [
  'He hits the open field and he is GONE!',
  'Breaks into the secondary — nobody\'s catching him!',
  'Turns upfield and outruns the defense!',
  'He\'s got blockers and nothing but green ahead!',
  'Look at him go — open field!',
];

// ── First Down / Touchdown tags ──────────────────────────────────────────────

const FIRST_DOWN = [
  'First down.',
  'Enough for the first.',
  'Moves the chains.',
  'That\'ll be a first down.',
  'First down, they keep it moving.',
];

const FIRST_DOWN_3RD = [
  'Converts on third down!',
  'They move the chains on third!',
  'Third down conversion!',
  'Keeps the drive alive!',
  'Big conversion there.',
];

const FIRST_DOWN_4TH = [
  'They get it! Fourth down conversion!',
  'Huge play — they convert on fourth!',
  'Gutsy call pays off!',
  'They keep the drive alive on fourth down!',
];

const TD_PASS = [
  'TOUCHDOWN!',
  'HE\'S IN! TOUCHDOWN!',
  'SCORES! That\'s a TOUCHDOWN!',
  'INTO THE END ZONE! TOUCHDOWN!',
  'HE FINDS THE PROMISED LAND! TOUCHDOWN!',
  'That\'s six! What a play!',
  'And it\'s a TOUCHDOWN!',
];

const TD_RUN = [
  'TOUCHDOWN!',
  'He punches it in — TOUCHDOWN!',
  'Across the goal line — TOUCHDOWN!',
  'He scores! TOUCHDOWN!',
  'Into the end zone — TOUCHDOWN!',
  'He bulls his way in — TOUCHDOWN!',
  'Pay dirt! TOUCHDOWN!',
];

function firstDownTag(ev: PlayEvent): string {
  if (is4thDown(ev)) return pick(FIRST_DOWN_4TH);
  if (is3rdDown(ev)) return pick(FIRST_DOWN_3RD);
  return pick(FIRST_DOWN);
}

// ── Run Phases ───────────────────────────────────────────────────────────────

const RUN_HANDOFF_INSIDE = [
  (n: string) => `Handoff to ${n} up the middle.`,
  (n: string) => `${n} takes the handoff between the tackles.`,
  (n: string) => `${n} runs it inside.`,
  (n: string) => `${n} hits the A-gap.`,
  (n: string) => `Give to ${n} up the gut.`,
  (n: string) => `${n} follows the lead blocker inside.`,
  (n: string) => `${n} takes the carry up the middle.`,
  (n: string) => `Handoff — ${n} between the guards.`,
];

const RUN_HANDOFF_OUTSIDE = [
  (n: string) => `${n} takes the handoff to the outside.`,
  (n: string) => `${n} bounces it to the edge.`,
  (n: string) => `Toss to ${n} going wide.`,
  (n: string) => `${n} sweeps to the right.`,
  (n: string) => `${n} takes the pitch outside.`,
  (n: string) => `${n} looking for the edge.`,
  (n: string) => `${n} gets the carry to the outside.`,
  (n: string) => `${n} takes the stretch run wide.`,
];

const RUN_GOAL_LINE = [
  (n: string) => `${n} dives for the goal line!`,
  (n: string) => `${n} lowers his shoulder at the line!`,
  (n: string) => `${n} tries to punch it in!`,
  (n: string) => `Short-yardage carry for ${n}!`,
];

const RUN_GOOD_BLOCKING = [
  'The offensive line opens a big hole.',
  'Great block at the point of attack.',
  'Huge lane up front.',
  'The line does its job — daylight ahead.',
  'The line gets a push and creates a lane.',
  'Excellent blocking springs him forward.',
];

const RUN_POOR_BLOCKING = [
  'Meets traffic at the line.',
  'The hole closes quickly.',
  'Defenders clog the lane immediately.',
  'No room to run.',
  'Nowhere to go up front.',
  'Gets hit right at the line of scrimmage.',
  'The defense is stacked in the box.',
];

const RUN_CUTBACK = [
  'Finds a cutback lane.',
  'Sees the hole and cuts back.',
  'Great vision — cuts away from the pressure.',
  'Reads the blocks and cuts to the backside.',
  'Patience pays off — finds the crease.',
  'Changes direction behind the line and finds room.',
];

const RUN_BROKE_TACKLE = [
  (db?: string) => db ? `Breaks ${db}'s tackle!` : 'Breaks the first tackle!',
  (db?: string) => db ? `Shakes off ${db}!` : 'Shakes off the first defender!',
  () => 'Runs through the arm tackle!',
  () => 'He won\'t go down easy — breaks free!',
  () => 'Bounces off the hit and keeps going!',
  () => 'Spins out of the tackle!',
  (db?: string) => db ? `Powers through ${db}'s attempt!` : 'Powers through the contact!',
];

const RUN_BREAKAWAY = [
  'He hits the second level and he\'s GONE!',
  'Into the secondary with nothing but green ahead!',
  'He breaks it! Nobody\'s going to catch him!',
  'Turns on the afterburners!',
  'He outruns the pursuit — big play!',
  'Open field — there\'s no stopping him now!',
];

const RUN_TFL = [
  (db?: string) => db ? `Stuffed by ${db} in the backfield!` : 'Stuffed in the backfield!',
  (db?: string) => db ? `${db} drops him behind the line!` : 'Hit behind the line of scrimmage.',
  () => 'Tackled for a loss!',
  () => 'Defensive line blows up the play.',
  (db?: string) => db ? `${db} meets him in the hole — nowhere to go.` : 'Nowhere to go — brought down for a loss.',
  () => 'The defense crashes through and drops him.',
  (db?: string) => db ? `${db} shoots the gap and makes the stop.` : 'The defense shoots the gap.',
];

const RUN_SHORT_GAIN = [
  (y: number, db?: string) => db ? `Brought down by ${db} after ${y}.` : `Gets ${y} before being brought down.`,
  (y: number) => `Pushes for ${y} through the pile.`,
  (y: number) => `Grinds out ${y} yards.`,
  (y: number) => `Picks up ${y} on the carry.`,
  (y: number) => `Falls forward for ${y}.`,
  (y: number, db?: string) => db ? `${db} makes the tackle after a gain of ${y}.` : `Gain of ${y}.`,
  (y: number) => `Churns out ${y} between the tackles.`,
];

const RUN_NO_GAIN = [
  (db?: string) => db ? `${db} stops him cold — no gain.` : 'Stopped for no gain.',
  () => 'Brought down right at the line.',
  () => 'Goes nowhere on the carry.',
  (db?: string) => db ? `${db} meets him at the line — nothing doing.` : 'The defense holds firm — no gain.',
];

const RUN_MODERATE_GAIN = [
  (y: number) => `Nice run — ${y} yards.`,
  (y: number) => `Picks up a solid ${y} on the ground.`,
  (y: number) => `Good carry — ${y} yards.`,
  (y: number) => `Finds some room and picks up ${y}.`,
  (y: number) => `${y} yards on the run.`,
  (y: number, db?: string) => db ? `${db} finally brings him down after ${y} yards.` : `Runs for a healthy ${y}.`,
];

const RUN_BIG_GAIN = [
  (y: number) => `Breaks free for ${y} yards!`,
  (y: number) => `Huge run! ${y} yards!`,
  (y: number) => `What a carry — ${y} yards on the ground!`,
  (y: number) => `Gashes the defense for ${y}!`,
  (y: number) => `Explosive run! ${y} yards!`,
  (y: number) => `Rips off a ${y}-yard run!`,
];

// ── Sack Phrases ─────────────────────────────────────────────────────────────

const SACK_WITH_NAME = [
  (qb: string, loss: number, def: string) => `${def} brings ${qb} down! ${loss}-yard sack!`,
  (qb: string, loss: number, def: string) => `SACKED by ${def}! ${qb} loses ${loss}.`,
  (qb: string, loss: number, def: string) => `${def} gets home! ${qb} goes down for a loss of ${loss}!`,
  (qb: string, loss: number, def: string) => `${def} beats his man and buries ${qb}! ${loss}-yard loss.`,
  (qb: string, loss: number, def: string) => `${qb} can't escape — ${def} wraps him up for a ${loss}-yard sack.`,
  (qb: string, loss: number, def: string) => `Big play by ${def}! Drags ${qb} down behind the line. Loss of ${loss}.`,
];

const SACK_NO_NAME = [
  (qb: string, loss: number) => `${qb} is brought down for a ${loss}-yard loss!`,
  (qb: string, loss: number) => `SACKED! ${qb} goes down, loses ${loss}.`,
  (qb: string, loss: number) => `The rush gets home — ${qb} sacked for a loss of ${loss}!`,
  (qb: string, loss: number) => `${qb} has nowhere to go and is taken down. ${loss}-yard sack.`,
  (qb: string, loss: number) => `He can't escape! ${qb} sacked for ${loss}.`,
];

const SACK_PRESSURE_HIGH = [
  'The protection completely breaks down!',
  'The blitz overwhelms the offensive line!',
  'He never had a chance back there!',
  'The pocket collapses immediately!',
  'There was instant pressure off the snap!',
  'The line gets steamrolled!',
];

const SACK_PRESSURE_MOD = [
  'The rush eventually gets there.',
  'He holds it a beat too long.',
  'Couldn\'t find anyone open in time.',
  'Tried to extend the play but ran out of time.',
  'He looks, hesitates, and that\'s all the rush needs.',
];

// ── Scramble Phrases ─────────────────────────────────────────────────────────

const SCRAMBLE_COMMENTARY = [
  (qb: string, y: number) => `${qb} tucks it and runs for ${y}!`,
  (qb: string, y: number) => `Nothing open downfield — ${qb} scrambles for ${y}.`,
  (qb: string, y: number) => `${qb} takes off with his legs, picks up ${y}.`,
  (qb: string, y: number) => `${qb} escapes the pocket and gains ${y} on the ground.`,
  (qb: string, y: number) => `Coverage is too tight — ${qb} pulls it down and runs for ${y}.`,
  (qb: string, y: number) => `Athletic play by ${qb}, scrambles for ${y} yards.`,
  (qb: string, y: number) => `${qb} sees daylight and takes off — ${y} yards.`,
  (qb: string, y: number) => `${qb} uses his legs — picks up ${y} on the scramble.`,
];

// ── Interception Phrases ─────────────────────────────────────────────────────

const INT_WITH_NAME = [
  (qb: string, wr: string, db: string) => `${qb} throws to ${wr} — INTERCEPTED by ${db}!`,
  (qb: string, wr: string, db: string) => `PICKED OFF! ${db} jumps the route and steals it from ${wr}!`,
  (qb: string, wr: string, db: string) => `${db} reads ${qb}'s eyes and picks it off! Intended for ${wr}.`,
  (qb: string, wr: string, db: string) => `TURNOVER! ${db} undercuts ${wr} and comes away with the interception!`,
  (qb: string, wr: string, db: string) => `${db} with great anticipation — INTERCEPTED! ${qb} made a bad read.`,
  (qb: string, wr: string, db: string) => `That's a pick by ${db}! ${qb} tried to force it to ${wr} and paid for it.`,
];

const INT_NO_NAME = [
  (qb: string, wr: string) => `${qb} throws to ${wr} — INTERCEPTED! The defender reads it all the way!`,
  (qb: string, wr: string) => `PICKED OFF! ${qb}'s pass intended for ${wr} is snatched away!`,
  (qb: string, wr: string) => `TURNOVER! ${qb} forces one to ${wr} and it's intercepted!`,
  (qb: string, wr: string) => `${qb} tries to fit it in to ${wr} — INTERCEPTED! Bad decision.`,
  (qb: string, wr: string) => `That's a pick! ${qb} never saw the defender lurking near ${wr}.`,
];

const INT_PRESSURE_TAG = [
  'The pressure forced the throw.',
  'He was hit as he threw — that\'s on the rush.',
  'Couldn\'t set his feet under pressure.',
  'The blitz hurried the decision.',
];

const INT_WINDOW_TAG = [
  'He threw it into tight coverage.',
  'Tried to force it through a closing window.',
  'The coverage was too tight for that throw.',
  'The defender jumped the route beautifully.',
  'That window was never really open.',
];

// ── Fumble ───────────────────────────────────────────────────────────────────

const FUMBLE_COMMENTARY = [
  (n: string) => `${n} puts it on the ground — FUMBLE! The defense recovers!`,
  (n: string) => `FUMBLE! ${n} loses the football! Turnover!`,
  (n: string) => `${n} is hit and the ball comes loose — FUMBLE!`,
  (n: string) => `The ball is out! ${n} fumbles and the defense pounces on it!`,
  (n: string) => `${n} coughs it up! Fumble recovered by the defense!`,
];

// ── Special Teams ────────────────────────────────────────────────────────────

const FG_GOOD = [
  (d: number) => `The ${d}-yard field goal attempt is up... and it's GOOD! Three points.`,
  (d: number) => `${d}-yarder, right down the middle — GOOD!`,
  (d: number) => `He nails the ${d}-yarder! Three points on the board.`,
  (d: number) => `Through the uprights from ${d} yards! Field goal is GOOD.`,
  (d: number) => `From ${d} out — GOOD! Splits the uprights.`,
];

const FG_MISS = [
  (d: number) => `The ${d}-yard attempt is up... no good! It hooks wide.`,
  (d: number) => `He misses the ${d}-yarder! Comes up short.`,
  (d: number) => `NO GOOD from ${d} yards out. The defense takes over.`,
  (d: number) => `Wide right on the ${d}-yard attempt — NO GOOD.`,
  (d: number) => `The ${d}-yarder drifts wide. No good.`,
];

const PUNT_PHRASES = [
  (y: number) => `Punted away for ${y} yards.`,
  (y: number) => `A ${y}-yard punt pushes the opponent back.`,
  (y: number) => `Booming punt — ${y} yards downfield.`,
  (y: number) => `Gets off a ${y}-yard punt.`,
  (y: number) => `Good hang time on the ${y}-yard punt.`,
];

// ══════════════════════════════════════════════════════════════════════════════
// FULL COMMENTARY GENERATOR
// ══════════════════════════════════════════════════════════════════════════════

export function generateFullCommentary(ev: PlayEvent, style?: CommentaryStyle): string {
  if (style) _style = style;
  const meta = ev.commentaryMeta;
  const qb   = ev.ballCarrier ?? 'QB';
  const wr   = ev.target ?? 'the receiver';
  const yds  = Math.abs(ev.yards);
  const def  = meta?.defPlayerName;

  // Build parts array, then join
  const parts: string[] = [];

  // Drive context opener (only for offensive plays)
  const isOffensivePlay = ev.type !== 'punt' && ev.type !== 'field_goal' && ev.type !== 'spike';
  if (isOffensivePlay) {
    const opener = narrativeOpener(ev);
    if (opener) parts.push(opener);

    // Situation prefix (3rd/4th down, red zone, goal-to-go)
    const sitPre = situationPrefix(ev);
    if (sitPre) parts.push(sitPre);
  }

  switch (ev.type) {

    // ── Pass plays ─────────────────────────────────────────────────────────
    case 'short_pass':
    case 'medium_pass':
    case 'deep_pass': {
      // Throwaway
      if (meta?.thrownAway) {
        if (meta.pressureLevel != null) parts.push(pressurePhrase(meta.pressureLevel, def));
        if (meta.windowState) parts.push(pick(WINDOW_PHRASES[meta.windowState]));
        parts.push(pick(THROWAWAY));
        break;
      }

      // Pre-snap / pressure
      if (meta?.pressureLevel != null) {
        parts.push(pressurePhrase(meta.pressureLevel));
      }

      // Throw delivery
      if (meta?.throwQuality != null && ev.result !== 'fail') {
        parts.push(throwPhrase(meta.throwQuality));
      }

      // Window / coverage (skip on clean open completions ~70% of the time)
      if (meta?.windowState && ev.result !== 'fail') {
        if (meta.windowState !== 'open' || Math.random() < 0.3) {
          parts.push(pick(WINDOW_PHRASES[meta.windowState]));
        }
      }

      // Completion
      if (ev.result === 'success' || ev.result === 'touchdown') {
        if (meta?.catchContested) {
          parts.push((_style === 'hype' ? pick(CONTESTED_CATCH_HYPE) : _style === 'analytical' ? pick(CONTESTED_CATCH_ANALYTICAL) : pick(CONTESTED_CATCH))(wr));
        } else {
          parts.push(pick(CATCH_PHRASES)(wr));
        }

        // YAC
        if (meta?.yacYards && meta.yacYards >= 5) {
          parts.push(pick(YAC_BIG)(meta.yacYards));
        } else if (meta?.yacYards && meta.yacYards > 0) {
          parts.push(pick(YAC_SHORT)(meta.yacYards));
        }

        // Breakaway
        if (meta?.breakaway) {
          parts.push(pick(BREAKAWAY_PASS));
        }

        // Yardage + outcome tag
        if (ev.result === 'touchdown') {
          const label = ev.type === 'deep_pass' ? 'bomb' : 'strike';
          parts.push(`${ev.yards}-yard ${label}. ${sp(TD_PASS, TD_PASS_HYPE, TD_PASS_ANALYTICAL)}`);
        } else if (ev.firstDown) {
          parts.push(`${ev.yards}-yard gain. ${firstDownTag(ev)}`);
        } else {
          parts.push(`Gain of ${ev.yards}.`);
        }
      }

      // Incompletion (not throwaway, not INT — those are separate types)
      if (ev.result === 'fail' && !meta?.thrownAway) {
        if (meta?.windowState) parts.push(pick(WINDOW_PHRASES[meta.windowState]));
        if (meta?.throwQuality != null) parts.push(throwPhrase(meta.throwQuality));
        // Use defender name if available for breakup
        if (def && Math.random() < 0.6) {
          parts.push(pick(INCOMPLETION_BREAKUP)(wr, def));
        } else {
          parts.push(pick(INCOMPLETION_PLAIN)(wr));
        }
      }

      break;
    }

    // ── Run plays ──────────────────────────────────────────────────────────
    case 'inside_run':
    case 'outside_run': {
      const carrier = ev.ballCarrier ?? 'the runner';

      // Goal-line specific handoff
      if (isGoalToGo(ev) && isShortYardage(ev)) {
        parts.push(pick(RUN_GOAL_LINE)(carrier));
      } else if (ev.type === 'inside_run') {
        parts.push(pick(RUN_HANDOFF_INSIDE)(carrier));
      } else {
        parts.push(pick(RUN_HANDOFF_OUTSIDE)(carrier));
      }

      // TFL
      if (meta?.tfl) {
        parts.push(pick(RUN_TFL)(def));
        parts.push(`Loss of ${yds}.`);
        break;
      }

      // Blocking
      if (meta?.blockingScore != null) {
        if (meta.blockingScore > 0.6) {
          parts.push(pick(RUN_GOOD_BLOCKING));
        } else if (meta.blockingScore < 0.35) {
          parts.push(pick(RUN_POOR_BLOCKING));
        }
      }

      // Vision cutback
      if (meta?.foundCutback) {
        parts.push(pick(RUN_CUTBACK));
      }

      // Broke tackle (now with optional defender name)
      if (meta?.brokeTackle) {
        parts.push(pick(RUN_BROKE_TACKLE)(def));
      }

      // Breakaway
      if (meta?.breakaway) {
        parts.push(sp(RUN_BREAKAWAY, RUN_BREAKAWAY_HYPE, RUN_BREAKAWAY_ANALYTICAL));
      }

      // Yardage + outcome
      if (ev.result === 'touchdown') {
        parts.push(`${ev.yards} yards. ${sp(TD_RUN, TD_RUN_HYPE, TD_RUN_ANALYTICAL)}`);
      } else if (ev.yards === 0) {
        parts.push(pick(RUN_NO_GAIN)(def));
      } else if (ev.yards < 0) {
        parts.push(`Loses ${yds}.`);
      } else if (ev.yards >= 15) {
        parts.push((_style === 'hype' ? pick(RUN_BIG_GAIN_HYPE) : _style === 'analytical' ? pick(RUN_BIG_GAIN_ANALYTICAL) : pick(RUN_BIG_GAIN))(ev.yards));
      } else if (ev.yards >= 5) {
        parts.push(pick(RUN_MODERATE_GAIN)(ev.yards, def));
      } else {
        parts.push(pick(RUN_SHORT_GAIN)(ev.yards, def));
      }

      if (ev.firstDown && ev.result !== 'touchdown') {
        parts.push(firstDownTag(ev));
      }

      break;
    }

    // ── Sack ───────────────────────────────────────────────────────────────
    case 'sack': {
      if (meta?.pressureLevel != null && meta.pressureLevel > 0.5) {
        parts.push(pick(SACK_PRESSURE_HIGH));
      } else {
        parts.push(pick(SACK_PRESSURE_MOD));
      }
      if (def) {
        parts.push((_style === 'hype' ? pick(SACK_WITH_NAME_HYPE) : _style === 'analytical' ? pick(SACK_WITH_NAME_ANALYTICAL) : pick(SACK_WITH_NAME))(qb, yds, def));
      } else {
        parts.push(pick(SACK_NO_NAME)(qb, yds));
      }
      break;
    }

    // ── Scramble ───────────────────────────────────────────────────────────
    case 'scramble': {
      if (meta?.pressureLevel != null && meta.pressureLevel > 0.4) {
        parts.push(pressurePhrase(meta.pressureLevel));
      }
      if (ev.result === 'touchdown') {
        parts.push(`${qb} tucks it and takes off — ${ev.yards} yards! ${sp(TD_RUN, TD_RUN_HYPE, TD_RUN_ANALYTICAL)}`);
      } else {
        parts.push(pick(SCRAMBLE_COMMENTARY)(qb, ev.yards));
      }
      if (ev.firstDown && ev.result !== 'touchdown') {
        parts.push(firstDownTag(ev));
      }
      break;
    }

    // ── Interception ───────────────────────────────────────────────────────
    case 'interception': {
      if (meta?.pressureLevel != null && meta.pressureLevel > 0.45) {
        parts.push(pick(INT_PRESSURE_TAG));
      }
      if (meta?.windowState && (meta.windowState === 'tight' || meta.windowState === 'contested' || meta.windowState === 'covered')) {
        parts.push(pick(INT_WINDOW_TAG));
      }
      if (def) {
        parts.push((_style === 'hype' ? pick(INT_WITH_NAME_HYPE) : _style === 'analytical' ? pick(INT_WITH_NAME_ANALYTICAL) : pick(INT_WITH_NAME))(qb, wr, def));
      } else {
        parts.push(pick(INT_NO_NAME)(qb, wr));
      }
      break;
    }

    // ── Fumble ─────────────────────────────────────────────────────────────
    case 'fumble':
      parts.push(pick(FUMBLE_COMMENTARY)(ev.ballCarrier ?? 'the runner'));
      break;

    // ── Field goal ─────────────────────────────────────────────────────────
    case 'field_goal': {
      const fgDist = (100 - ev.yardLine) + 17;
      if (ev.result === 'field_goal_good') {
        parts.push(pick(FG_GOOD)(fgDist));
      } else {
        parts.push(pick(FG_MISS)(fgDist));
      }
      break;
    }

    // ── Punt ───────────────────────────────────────────────────────────────
    case 'punt':
      parts.push(pick(PUNT_PHRASES)(Math.abs(ev.yards)));
      break;

    // ── Spike ──────────────────────────────────────────────────────────────
    case 'spike':
      parts.push('QB spikes the ball to stop the clock.');
      break;

    default:
      parts.push(`Play result: ${ev.yards} yards.`);
  }

  // Penalty suffix (woven into the narrative)
  const penSuffix = penaltySuffix(ev);
  if (penSuffix) parts.push(penSuffix);

  return parts.filter(Boolean).join(' ');
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPACT LOG LINE GENERATOR
// ══════════════════════════════════════════════════════════════════════════════

export function generateLogLine(ev: PlayEvent): string {
  const qb   = ev.ballCarrier ?? '?';
  const wr   = ev.target ?? '?';
  const yds  = Math.abs(ev.yards);
  const def  = ev.commentaryMeta?.defPlayerName;
  const pen  = ev.penalty;

  // Penalty annotation for log lines
  let penTag = '';
  if (pen) {
    const pName = PENALTY_NAMES[pen.type] ?? pen.type;
    penTag = pen.accepted
      ? ` [${pName}, ${Math.abs(pen.yards)} yds${pen.autoFirst ? ', auto 1st' : ''}]`
      : ` [${pName} declined]`;
  }

  switch (ev.type) {
    case 'inside_run':
      if (ev.result === 'touchdown') return `${qb} run middle — TD (${ev.yards} yds)${penTag}`;
      if (ev.yards < 0) return `${qb} inside run${def ? ` (${def} TFL)` : ''} — loss of ${yds}${penTag}`;
      if (ev.yards === 0) return `${qb} inside run — no gain${penTag}`;
      return `${qb} inside run — ${ev.yards} yds${ev.firstDown ? ' ↑' : ''}${penTag}`;

    case 'outside_run':
      if (ev.result === 'touchdown') return `${qb} outside run — TD (${ev.yards} yds)${penTag}`;
      if (ev.yards < 0) return `${qb} outside run${def ? ` (${def} TFL)` : ''} — loss of ${yds}${penTag}`;
      if (ev.yards === 0) return `${qb} outside run — no gain${penTag}`;
      return `${qb} outside run — ${ev.yards} yds${ev.firstDown ? ' ↑' : ''}${penTag}`;

    case 'short_pass':
      if (ev.commentaryMeta?.thrownAway) return `${qb} throw away${penTag}`;
      if (ev.result === 'touchdown') return `${qb} short → ${wr} — TD (${ev.yards} yds)${penTag}`;
      if (ev.result === 'success') return `${qb} short → ${wr} — ${ev.yards} yds${ev.firstDown ? ' ↑' : ''}${penTag}`;
      return `${qb} short → ${wr} — inc${def ? ` (${def})` : ''}${penTag}`;

    case 'medium_pass':
      if (ev.commentaryMeta?.thrownAway) return `${qb} throw away${penTag}`;
      if (ev.result === 'touchdown') return `${qb} → ${wr} — TD (${ev.yards} yds)${penTag}`;
      if (ev.result === 'success') return `${qb} → ${wr} — ${ev.yards} yds${ev.firstDown ? ' ↑' : ''}${penTag}`;
      return `${qb} → ${wr} — inc${def ? ` (${def})` : ''}${penTag}`;

    case 'deep_pass':
      if (ev.commentaryMeta?.thrownAway) return `${qb} throw away${penTag}`;
      if (ev.result === 'touchdown') return `${qb} deep → ${wr} — TD (${ev.yards} yds)${penTag}`;
      if (ev.result === 'success') return `${qb} deep → ${wr} — ${ev.yards} yds${ev.firstDown ? ' ↑' : ''}${penTag}`;
      return `${qb} deep → ${wr} — inc${def ? ` (${def})` : ''}${penTag}`;

    case 'sack':
      return `${qb} sacked${def ? ` by ${def}` : ''} — loss of ${yds}${penTag}`;

    case 'scramble':
      if (ev.result === 'touchdown') return `${qb} scramble — TD (${ev.yards} yds)${penTag}`;
      return `${qb} scramble — ${ev.yards} yds${ev.firstDown ? ' ↑' : ''}${penTag}`;

    case 'interception':
      return `${qb} → ${wr} — INT${def ? ` (${def})` : ''}${penTag}`;

    case 'fumble':
      return `${qb} FUMBLE — turnover${penTag}`;

    case 'field_goal': {
      const dist = (100 - ev.yardLine) + 17;
      return ev.result === 'field_goal_good'
        ? `${dist}-yd FG — GOOD${penTag}`
        : `${dist}-yd FG — NO GOOD${penTag}`;
    }

    case 'punt':
      return `Punt — ${yds} yds${penTag}`;

    case 'spike':
      return `QB spike${penTag}`;

    default:
      return `${ev.type} — ${ev.yards} yds${penTag}`;
  }
}
