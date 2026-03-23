/**
 * Builds the initial 32-team league with NFL-style conference/division structure.
 *
 * Iron Conference (IC)  — mirrors AFC
 * Shield Conference (SC) — mirrors NFC
 *
 * Each conference has North / South / East / West divisions with 4 teams each.
 * Each team is generated with a 56-player roster and a full coaching staff.
 */

import { createPlayer, clamp, type AnyRatings } from './models/Player';
import { createTeam }                            from './models/Team';
import { createCoach }                           from './models/Coach';
import { createLeague, type LeagueOptions, type Division, type ConferenceName, type DivisionName } from './models/League';

// ── Seeded pseudo-random (deterministic generation) ───────────────────────────

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// ── Rating generators ─────────────────────────────────────────────────────────

const p = (we: number, lo: number, gr: number, di: number) =>
  ({ workEthic: we, loyalty: lo, greed: gr, discipline: di });

function rng(rand: () => number, center: number, spread = 12): number {
  return clamp(Math.round(center + (rand() - 0.5) * 2 * spread));
}

function makeQB(rand: () => number, tier: number): AnyRatings {
  const c = 50 + tier * 5;
  return {
    position: 'QB',
    armStrength:    rng(rand, c + 5),
    pocketPresence: rng(rand, c + 3),
    mobility:       rng(rand, c - 5),
    shortAccuracy:  rng(rand, c + 4),
    mediumAccuracy: rng(rand, c + 2),
    deepAccuracy:   rng(rand, c - 2),
    processing:     rng(rand, c + 1),
    decisionMaking: rng(rand, c + 2),
  };
}

function makeRB(rand: () => number, tier: number): AnyRatings {
  const c = 50 + tier * 5;
  return {
    position: 'RB',
    speed:        rng(rand, c + 6),
    acceleration: rng(rand, c + 4),
    power:        rng(rand, c),
    agility:      rng(rand, c + 3),
    vision:       rng(rand, c),
    ballSecurity: rng(rand, c - 2),
    passBlocking: rng(rand, c - 8),
    routeRunning: rng(rand, c - 6),
    personality:  p(rng(rand, 70, 15), rng(rand, 60, 20), rng(rand, 45, 20), rng(rand, 68, 15)),
  };
}

function makeWR(rand: () => number, tier: number): AnyRatings {
  const c = 50 + tier * 5;
  return {
    position: 'WR',
    speed:        rng(rand, c + 8),
    acceleration: rng(rand, c + 6),
    catching:     rng(rand, c + 2),
    routeRunning: rng(rand, c),
    separation:   rng(rand, c + 3),
    release:      rng(rand, c),
    blocking:     rng(rand, c - 10),
    personality:  p(rng(rand, 68, 15), rng(rand, 58, 20), rng(rand, 50, 20), rng(rand, 65, 15)),
  };
}

function makeTE(rand: () => number, tier: number): AnyRatings {
  const c = 50 + tier * 5;
  return {
    position: 'TE',
    strength:     rng(rand, c + 2),
    speed:        rng(rand, c),
    catching:     rng(rand, c + 1),
    routeRunning: rng(rand, c - 2),
    blocking:     rng(rand, c + 3),
    release:      rng(rand, c - 1),
    personality:  p(rng(rand, 72, 15), rng(rand, 65, 20), rng(rand, 42, 20), rng(rand, 70, 15)),
  };
}

function makeOL(rand: () => number, tier: number, pos: 'OT' | 'OG' | 'C'): AnyRatings {
  const c = 50 + tier * 5;
  return {
    position:     pos,
    passBlocking: rng(rand, c + 2),
    runBlocking:  rng(rand, c + 1),
    strength:     rng(rand, c + 3),
    agility:      rng(rand, c - 2),
    awareness:    rng(rand, c),
    personality:  p(rng(rand, 74, 15), rng(rand, 68, 20), rng(rand, 38, 20), rng(rand, 74, 15)),
  };
}

function makeDE(rand: () => number, tier: number): AnyRatings {
  const c = 50 + tier * 5;
  return {
    position:    'DE',
    passRush:    rng(rand, c + 4),
    runStop:     rng(rand, c),
    strength:    rng(rand, c + 2),
    athleticism: rng(rand, c + 4),
    motor:       rng(rand, c + 1),
    personality: p(rng(rand, 72, 15), rng(rand, 62, 20), rng(rand, 44, 20), rng(rand, 68, 15)),
  };
}

function makeDT(rand: () => number, tier: number): AnyRatings {
  const c = 50 + tier * 5;
  return {
    position:    'DT',
    passRush:    rng(rand, c + 1),
    runStop:     rng(rand, c + 4),
    strength:    rng(rand, c + 6),
    athleticism: rng(rand, c),
    motor:       rng(rand, c),
    personality: p(rng(rand, 74, 15), rng(rand, 66, 20), rng(rand, 40, 20), rng(rand, 72, 15)),
  };
}

function makeLB(rand: () => number, tier: number, pos: 'OLB' | 'MLB'): AnyRatings {
  const c = 50 + tier * 5;
  return {
    position:    pos,
    passRush:    rng(rand, pos === 'OLB' ? c + 3 : c - 2),
    runStop:     rng(rand, c + 2),
    coverage:    rng(rand, pos === 'MLB' ? c + 3 : c),
    athleticism: rng(rand, c + 2),
    awareness:   rng(rand, c + 1),
    pursuit:     rng(rand, c + 1),
    personality: p(rng(rand, 76, 15), rng(rand, 68, 20), rng(rand, 40, 20), rng(rand, 74, 15)),
  };
}

function makeCB(rand: () => number, tier: number): AnyRatings {
  const c = 50 + tier * 5;
  return {
    position:     'CB',
    manCoverage:  rng(rand, c + 3),
    zoneCoverage: rng(rand, c + 1),
    ballSkills:   rng(rand, c),
    press:        rng(rand, c),
    speed:        rng(rand, c + 6),
    athleticism:  rng(rand, c + 3),
    personality:  p(rng(rand, 70, 15), rng(rand, 62, 20), rng(rand, 48, 20), rng(rand, 68, 15)),
  };
}

function makeSafety(rand: () => number, tier: number, pos: 'FS' | 'SS'): AnyRatings {
  const c = 50 + tier * 5;
  return {
    position:     pos,
    zoneCoverage: rng(rand, pos === 'FS' ? c + 3 : c),
    manCoverage:  rng(rand, c),
    ballSkills:   rng(rand, c + 1),
    range:        rng(rand, pos === 'FS' ? c + 4 : c),
    hitPower:     rng(rand, pos === 'SS' ? c + 4 : c),
    athleticism:  rng(rand, c + 2),
    personality:  p(rng(rand, 72, 15), rng(rand, 66, 20), rng(rand, 42, 20), rng(rand, 72, 15)),
  };
}

function makeK(rand: () => number, tier: number): AnyRatings {
  const c = 50 + tier * 5;
  return {
    position:     'K',
    kickPower:    rng(rand, c + 4),
    kickAccuracy: rng(rand, c + 3),
    composure:    rng(rand, c),
    personality:  p(rng(rand, 70, 15), rng(rand, 72, 20), rng(rand, 38, 20), rng(rand, 76, 15)),
  };
}

function makeP(rand: () => number, tier: number): AnyRatings {
  const c = 50 + tier * 5;
  return {
    position:     'P',
    kickPower:    rng(rand, c + 2),
    kickAccuracy: rng(rand, c + 5),
    composure:    rng(rand, c + 1),
    personality:  p(rng(rand, 70, 15), rng(rand, 72, 20), rng(rand, 36, 20), rng(rand, 76, 15)),
  };
}

// ── Name banks ────────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  'Marcus','Deon','Andre','Tyrell','Kevin','James','Malik','Devon','Leroy','Curtis',
  'Bryan','Darius','DeShawn','Terrell','Reggie','Quincy','Jarvis','Calvin','Vernon','Elijah',
  'Brendan','Casey','Drew','Evan','Felix','Garrett','Hunter','Ivan','Jared','Kyle',
  'Liam','Mason','Nathan','Owen','Parker','Quinn','Rhett','Seth','Travis','Ulrich',
  'Victor','Wade','Xavier','Yuri','Zane','Aaron','Blake','Colin','Derek','Ethan',
  'Frank','Glen','Hugo','Irvin','Jordan','Kenji','Logan','Mitch','Neil','Oscar',
];

const LAST_NAMES = [
  'Rivers','Webb','Carter','Ford','Grant','Hayes','Jackson','King','Lewis','Moore',
  'Nash','Ortega','Price','Quinn','Reed','Shaw','Torres','Underwood','Vega','Walsh',
  'Young','Zimmerman','Adams','Brooks','Cole','Davis','Evans','Fisher','Garcia','Hill',
  'Irwin','Jones','Knight','Lane','Marsh','Nelson','Oliver','Parks','Roberts','Scott',
  'Taylor','Upton','Vargas','White','Xavier','York','Zuniga','Bell','Cruz','Dixon',
  'Ellis','Flynn','Gomez','Hart','Ingram','Jimenez','Knox','Lowe','Murray','Nolan',
];

function makeName(rand: () => number): string {
  const fi = Math.floor(rand() * FIRST_NAMES.length);
  const li = Math.floor(rand() * LAST_NAMES.length);
  return `${FIRST_NAMES[fi]} ${LAST_NAMES[li]}`;
}

// ── Roster generator ──────────────────────────────────────────────────────────

/**
 * 56-player roster composition:
 * QB×3, RB×5, WR×7, TE×3, OL×9(3OT+3OG+3C), DE×4, DT×4, LB×6(3OLB+3MLB),
 * CB×6, S×4(2FS+2SS), K×2, P×3
 */
function buildRoster(
  teamIndex: number,
  tier: number, // 0-3 (0=worst,3=elite) — drives average rating center
): ReturnType<typeof createPlayer>[] {
  const rand  = seededRng(teamIndex * 997 + 13);
  let   pid   = teamIndex * 100 + 1;
  const age   = () => 22 + Math.floor(rand() * 12); // 22-33
  const id    = () => `t${teamIndex}p${pid++}`;

  const tiers = (count: number, starterTier: number): number[] =>
    Array.from({ length: count }, (_, i) => Math.max(0, starterTier - Math.floor(i / 2)));

  const players: ReturnType<typeof createPlayer>[] = [];

  const add = (pos: string, ratings: AnyRatings) =>
    players.push(createPlayer(id(), makeName(rand), pos as any, age(), ratings));

  // QBs (3): starter is team tier, backups are lower
  for (const t of tiers(3, tier)) add('QB', makeQB(rand, t));
  // RBs (5)
  for (const t of tiers(5, tier)) add('RB', makeRB(rand, t));
  // WRs (7)
  for (const t of tiers(7, tier)) add('WR', makeWR(rand, t));
  // TEs (3)
  for (const t of tiers(3, tier)) add('TE', makeTE(rand, t));
  // OL (9): 3 OT, 3 OG, 3 C
  for (const t of tiers(3, tier)) add('OT', makeOL(rand, t, 'OT'));
  for (const t of tiers(3, tier)) add('OG', makeOL(rand, t, 'OG'));
  for (const t of tiers(3, tier)) add('C',  makeOL(rand, t, 'C'));
  // DEs (4)
  for (const t of tiers(4, tier)) add('DE', makeDE(rand, t));
  // DTs (4)
  for (const t of tiers(4, tier)) add('DT', makeDT(rand, t));
  // LBs (6): 3 OLB, 3 MLB
  for (const t of tiers(3, tier)) add('OLB', makeLB(rand, t, 'OLB'));
  for (const t of tiers(3, tier)) add('MLB', makeLB(rand, t, 'MLB'));
  // CBs (6)
  for (const t of tiers(6, tier)) add('CB', makeCB(rand, t));
  // Safeties (4): 2 FS, 2 SS
  for (const t of tiers(2, tier)) add('FS', makeSafety(rand, t, 'FS'));
  for (const t of tiers(2, tier)) add('SS', makeSafety(rand, t, 'SS'));
  // K (2), P (3)
  for (const t of tiers(2, tier)) add('K', makeK(rand, t));
  for (const t of tiers(3, tier)) add('P', makeP(rand, t));

  return players;
}

// ── Coach generator ───────────────────────────────────────────────────────────

const HC_NAMES  = ['Bill Harmon','Mike Dawson','Tony Walsh','Greg Norris','Dan Rivers','Lou Kramer',
  'Frank Russo','Gary Owens','Chris Bell','Steve Holt','Pete Carey','Jim Walsh',
  'Ray Sims','Carl Brooks','Dave Hunt','Sam Paxton','Brad Willis','Ken Marsh',
  'Mark Frey','Tom Slade','Roy Gibson','Les Tanner','Eric Stone','Al Novak',
  'Phil Grant','Bob Reyes','Ed Foley','Rich Torres','Ned Sims','Walt Pryor',
  'Hank Voss','Ted Morgan'];
const OC_NAMES  = ['Dan Prescott','Lou Petersen','Phil Garrett','Dave Kimura','Andy Rice','Ben Cross',
  'Cole Merritt','Duke Lara','Finn Webb','Gary Mack','Hal Dixon','Ian Holt',
  'Jack Reed','Kirk Nash','Lyle Vance','Ned Torres','Ozzie Hart','Pete Salazar',
  'Rex Bowen','Sam Irwin','Todd Cruz','Ulf Stein','Van Porter','Wes Dalton',
  'Xander Frey','Yves Carr','Zac Mercer','Art Flynn','Boyd Lowe','Clint Soto',
  'Dex Ruiz','Earl Snow'];
const DC_NAMES  = ['Ray Sellers','James Oliver','Carl Bishop','Frank Malone','Gus Reyes','Hal Owens',
  'Ian Vega','Joel Shaw','Ken Cole','Leo Marsh','Max Ford','Ned Rivera',
  'Orson Todd','Paul Grant','Quint Webb','Russ Briggs','Steve Nash','Terry Fain',
  'Udo Crane','Vince Barr','Walt Sims','Xen Cross','Yuri Lane','Zeb Fuller',
  'Arch Lee','Buck Rowe','Chip Dean','Dale Hess','Earl Quinn','Fritz Kato',
  'Gill Stokes','Hugh Moran'];

const OFF_SCHEMES = ['balanced','short_passing','deep_passing','run_inside','run_outside'] as const;
const DEF_SCHEMES = ['balanced','run_focus','speed_defense','stop_short_pass','stop_deep_pass','aggressive'] as const;

function buildCoaches(teamIndex: number, tier: number) {
  const rand   = seededRng(teamIndex * 1234 + 77);
  const cRng   = (c: number) => clamp(Math.round(c + (rand() - 0.5) * 2 * 8));
  const hcOv   = cRng(60 + tier * 5);
  const ocOv   = cRng(60 + tier * 5);
  const dcOv   = cRng(60 + tier * 5);
  const offSch = OFF_SCHEMES[Math.floor(rand() * OFF_SCHEMES.length)]!;
  const defSch = DEF_SCHEMES[Math.floor(rand() * DEF_SCHEMES.length)]!;
  // HC scheme preferences — 60% chance of matching OC/DC (alignment is a coaching hire decision)
  const hcOffSch = rand() < 0.60 ? offSch : OFF_SCHEMES[Math.floor(rand() * OFF_SCHEMES.length)]!;
  const hcDefSch = rand() < 0.60 ? defSch : DEF_SCHEMES[Math.floor(rand() * DEF_SCHEMES.length)]!;
  return {
    hc: createCoach(`c${teamIndex}_hc`, HC_NAMES[teamIndex % HC_NAMES.length]!, 'HC', hcOv,
      { leadership: cRng(hcOv), gameManagement: cRng(hcOv - 2),
        offensiveScheme: hcOffSch, defensiveScheme: hcDefSch }),
    oc: createCoach(`c${teamIndex}_oc`, OC_NAMES[teamIndex % OC_NAMES.length]!, 'OC', ocOv,
      { offensiveScheme: offSch, passing: cRng(ocOv + 2), rushing: cRng(ocOv - 2) }),
    dc: createCoach(`c${teamIndex}_dc`, DC_NAMES[teamIndex % DC_NAMES.length]!, 'DC', dcOv,
      { defensiveScheme: defSch, coverage: cRng(dcOv), runDefense: cRng(dcOv) }),
  };
}

// ── Team definitions ──────────────────────────────────────────────────────────

interface TeamDef {
  id:   string;
  name: string;
  abbr: string;
  conf: ConferenceName;
  div:  DivisionName;
  tier: number; // 0-3
}

const TEAM_DEFS: TeamDef[] = [
  // Iron Conference — North
  { id:'ic_pit', name:'Pittsburgh Ironmen',   abbr:'PIT', conf:'IC', div:'North', tier:3 },
  { id:'ic_cle', name:'Cleveland Coastals',   abbr:'CLE', conf:'IC', div:'North', tier:1 },
  { id:'ic_cin', name:'Cincinnati Wildcats',  abbr:'CIN', conf:'IC', div:'North', tier:2 },
  { id:'ic_buf', name:'Buffalo Blizzard',     abbr:'BUF', conf:'IC', div:'North', tier:2 },
  // Iron Conference — South
  { id:'ic_hou', name:'Houston Oilmen',       abbr:'HOU', conf:'IC', div:'South', tier:2 },
  { id:'ic_ten', name:'Tennessee Vanguard',   abbr:'TEN', conf:'IC', div:'South', tier:1 },
  { id:'ic_jax', name:'Jacksonville Armada',  abbr:'JAX', conf:'IC', div:'South', tier:1 },
  { id:'ic_ind', name:'Indianapolis Speed',   abbr:'IND', conf:'IC', div:'South', tier:2 },
  // Iron Conference — East
  { id:'ic_ne',  name:'Boston Minutemen',     abbr:'NE',  conf:'IC', div:'East',  tier:3 },
  { id:'ic_nye', name:'New York Empire',       abbr:'NYE', conf:'IC', div:'East',  tier:2 },
  { id:'ic_mia', name:'Miami Sharks',          abbr:'MIA', conf:'IC', div:'East',  tier:1 },
  { id:'ic_bal', name:'Baltimore Crabs',       abbr:'BAL', conf:'IC', div:'East',  tier:3 },
  // Iron Conference — West
  { id:'ic_den', name:'Denver Peaks',          abbr:'DEN', conf:'IC', div:'West',  tier:2 },
  { id:'ic_kc',  name:'Kansas City Monarchs',  abbr:'KC',  conf:'IC', div:'West',  tier:3 },
  { id:'ic_lv',  name:'Las Vegas Neon',         abbr:'LV',  conf:'IC', div:'West',  tier:1 },
  { id:'ic_lac', name:'Los Angeles Surge',      abbr:'LAC', conf:'IC', div:'West',  tier:2 },
  // Shield Conference — North
  { id:'sc_gb',  name:'Green Bay Tundra',      abbr:'GB',  conf:'SC', div:'North', tier:3 },
  { id:'sc_chi', name:'Chicago Wind',           abbr:'CHI', conf:'SC', div:'North', tier:2 },
  { id:'sc_min', name:'Minnesota Frost',        abbr:'MIN', conf:'SC', div:'North', tier:2 },
  { id:'sc_det', name:'Detroit Motors',         abbr:'DET', conf:'SC', div:'North', tier:1 },
  // Shield Conference — South
  { id:'sc_no',  name:'New Orleans Voodoo',    abbr:'NO',  conf:'SC', div:'South', tier:2 },
  { id:'sc_atl', name:'Atlanta Blaze',          abbr:'ATL', conf:'SC', div:'South', tier:1 },
  { id:'sc_car', name:'Carolina Thunder',       abbr:'CAR', conf:'SC', div:'South', tier:1 },
  { id:'sc_tb',  name:'Tampa Bay Corsairs',     abbr:'TB',  conf:'SC', div:'South', tier:2 },
  // Shield Conference — East
  { id:'sc_dal', name:'Dallas Longhorns',      abbr:'DAL', conf:'SC', div:'East',  tier:3 },
  { id:'sc_phi', name:'Philadelphia Liberty',  abbr:'PHI', conf:'SC', div:'East',  tier:2 },
  { id:'sc_was', name:'Washington Sentinels',  abbr:'WAS', conf:'SC', div:'East',  tier:1 },
  { id:'sc_nyg', name:'New York Knights',       abbr:'NYG', conf:'SC', div:'East',  tier:1 },
  // Shield Conference — West
  { id:'sc_lar', name:'Los Angeles Quake',     abbr:'LAR', conf:'SC', div:'West',  tier:2 },
  { id:'sc_sf',  name:'San Francisco Miners',  abbr:'SF',  conf:'SC', div:'West',  tier:3 },
  { id:'sc_sea', name:'Seattle Cascade',        abbr:'SEA', conf:'SC', div:'West',  tier:2 },
  { id:'sc_ari', name:'Arizona Scorpions',      abbr:'ARI', conf:'SC', div:'West',  tier:1 },
];

// ── Division structure ────────────────────────────────────────────────────────

function buildDivisions(): Division[] {
  const map = new Map<string, Division>();
  for (const td of TEAM_DEFS) {
    const key = `${td.conf}-${td.div}`;
    if (!map.has(key)) {
      map.set(key, { conference: td.conf, division: td.div, teamIds: [] });
    }
    map.get(key)!.teamIds.push(td.id);
  }
  return [...map.values()];
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createInitialLeague(id: string, options: LeagueOptions = {}) {
  const divisions = buildDivisions();

  const teams = TEAM_DEFS.map((td, i) => {
    const roster  = buildRoster(i, td.tier);
    const coaches = buildCoaches(i, td.tier);
    return createTeam(td.id, td.name, td.abbr, roster, coaches,
      { conference: td.conf, division: td.div });
  });

  // User team is Pittsburgh Ironmen (ic_pit) — top-tier, IC North
  const userTeamId = 'ic_pit';

  const league = createLeague(id, 'Gridiron Sim League', teams, userTeamId, 2025, {
    ...options,
    divisions,
  });

  return league;
}
