/**
 * Play concept architecture.
 *
 * Each concept defines a pass/run scheme with 1-3 read progressions and the
 * rating fields that determine success at each read.  The engine resolves reads
 * in order and stops at the first "open" receiver or defaults to the final read.
 */

// ── Rating weight ─────────────────────────────────────────────────────────────

export interface RatingWeight {
  field:  string;   // rating field name (e.g. 'routeRunning', 'speed')
  weight: number;   // 0-1; weights for a concept should sum to 1
}

// ── Pass concept ──────────────────────────────────────────────────────────────

export type PassDepth = 'short' | 'medium' | 'deep';
export type ReceiverRole = 'WR' | 'TE' | 'RB';

export interface ReadOption {
  receiverRole:   ReceiverRole;
  depth:          PassDepth;
  /** Offense ratings that boost separation on this read */
  offWeights:     RatingWeight[];
  /** Defense ratings that suppress separation on this read */
  defWeights:     RatingWeight[];
}

export interface PlayActionModifier {
  active:         boolean;
  /** Bonus added to separation score when play action is faked */
  deceptionBonus: number;
}

export interface PassConcept {
  id:         string;
  name:       string;
  reads:      ReadOption[];   // 1-3 reads; engine tries them in order
  playAction: PlayActionModifier;
}

// ── Run concept ───────────────────────────────────────────────────────────────

export type RunOrientation = 'inside' | 'outside';

export interface RunConcept {
  id:          string;
  name:        string;
  orientation: RunOrientation;
  /** Blocking scheme rating fields most relevant to this run */
  blockWeights: RatingWeight[];
  /** RB rating fields most relevant to this run */
  rbWeights:    RatingWeight[];
}

// ── Core concept library ──────────────────────────────────────────────────────

export const PASS_SHORT: PassConcept = {
  id:   'pass_short',
  name: 'Short Pass',
  reads: [
    {
      receiverRole: 'WR',
      depth:        'short',
      offWeights: [
        { field: 'routeRunning', weight: 0.50 },
        { field: 'release',      weight: 0.30 },
        { field: 'speed',        weight: 0.20 },
      ],
      defWeights: [
        { field: 'manCoverage',  weight: 0.60 },
        { field: 'press',        weight: 0.40 },
      ],
    },
    {
      receiverRole: 'TE',
      depth:        'short',
      offWeights: [
        { field: 'routeRunning', weight: 0.60 },
        { field: 'release',      weight: 0.40 },
      ],
      defWeights: [
        { field: 'coverage',     weight: 0.70 },  // LB coverage
        { field: 'awareness',    weight: 0.30 },
      ],
    },
  ],
  playAction: { active: false, deceptionBonus: 0 },
};

export const PASS_MEDIUM: PassConcept = {
  id:   'pass_medium',
  name: 'Medium Pass',
  reads: [
    {
      receiverRole: 'WR',
      depth:        'medium',
      offWeights: [
        { field: 'routeRunning', weight: 0.45 },
        { field: 'separation',  weight: 0.35 },
        { field: 'acceleration', weight: 0.20 },
      ],
      defWeights: [
        { field: 'manCoverage',  weight: 0.50 },
        { field: 'zoneCoverage', weight: 0.30 },
        { field: 'athleticism',  weight: 0.20 },
      ],
    },
    {
      receiverRole: 'TE',
      depth:        'medium',
      offWeights: [
        { field: 'routeRunning', weight: 0.55 },
        { field: 'speed',        weight: 0.30 },
        { field: 'release',      weight: 0.15 },
      ],
      defWeights: [
        { field: 'coverage',     weight: 0.65 },
        { field: 'athleticism',  weight: 0.35 },
      ],
    },
  ],
  playAction: { active: false, deceptionBonus: 0 },
};

export const PASS_DEEP: PassConcept = {
  id:   'pass_deep',
  name: 'Deep Pass',
  reads: [
    {
      receiverRole: 'WR',
      depth:        'deep',
      offWeights: [
        { field: 'speed',        weight: 0.50 },
        { field: 'separation',  weight: 0.30 },
        { field: 'acceleration', weight: 0.20 },
      ],
      defWeights: [
        { field: 'speed',        weight: 0.40 },  // CB speed
        { field: 'manCoverage',  weight: 0.35 },
        { field: 'zoneCoverage', weight: 0.25 },
        // Safety Range is applied separately by the engine for deep coverage
      ],
    },
  ],
  playAction: { active: false, deceptionBonus: 0 },
};

// ── Play-action variants ──────────────────────────────────────────────────────

export const PA_SHORT: PassConcept = {
  ...PASS_SHORT,
  id:         'pa_short',
  name:       'Play Action Short',
  playAction: { active: true, deceptionBonus: 0.08 },
};

export const PA_MEDIUM: PassConcept = {
  ...PASS_MEDIUM,
  id:         'pa_medium',
  name:       'Play Action Medium',
  playAction: { active: true, deceptionBonus: 0.08 },
};

export const PA_DEEP: PassConcept = {
  ...PASS_DEEP,
  id:         'pa_deep',
  name:       'Play Action Deep',
  playAction: { active: true, deceptionBonus: 0.10 },
};

// ── Run concepts ──────────────────────────────────────────────────────────────

export const RUN_INSIDE: RunConcept = {
  id:          'run_inside',
  name:        'Inside Run',
  orientation: 'inside',
  blockWeights: [
    { field: 'runBlocking', weight: 0.55 },
    { field: 'strength',    weight: 0.45 },
  ],
  rbWeights: [
    { field: 'power',  weight: 0.50 },
    { field: 'vision', weight: 0.30 },
    { field: 'agility', weight: 0.20 },
  ],
};

export const RUN_OUTSIDE: RunConcept = {
  id:          'run_outside',
  name:        'Outside Run',
  orientation: 'outside',
  blockWeights: [
    { field: 'runBlocking', weight: 0.40 },
    { field: 'agility',     weight: 0.60 },
  ],
  rbWeights: [
    { field: 'speed',        weight: 0.45 },
    { field: 'acceleration', weight: 0.30 },
    { field: 'agility',      weight: 0.25 },
  ],
};

export const RUN_POWER_SHORT: RunConcept = {
  id:          'run_power_short',
  name:        'Power Short Yardage',
  orientation: 'inside',
  blockWeights: [
    { field: 'runBlocking', weight: 0.40 },
    { field: 'strength',    weight: 0.60 },
  ],
  rbWeights: [
    { field: 'power',        weight: 0.65 },
    { field: 'ballSecurity', weight: 0.20 },
    { field: 'vision',       weight: 0.15 },
  ],
};
