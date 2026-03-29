import { useState, useEffect, useMemo, useRef } from 'react';
import { friendlyError } from '../shared';
import { generateGameplanRecommendation } from '../gameplanRec';
import {
  setFormationSlot as setFormationSlotApi, setOffensivePlan as setOffensivePlanApi,
  setPackageSlot as setPackageSlotApi, setDefensivePlan as setDefensivePlanApi,
  saveOffensePlaybook as saveOffensePlaybookApi, deleteOffensePlaybook as deleteOffensePlaybookApi,
  saveDefensePlaybook as saveDefensePlaybookApi, deleteDefensePlaybook as deleteDefensePlaybookApi,
  setTendencies as setTendenciesApi,
  saveCustomPlay as saveCustomPlayApi, deleteCustomPlay as deleteCustomPlayApi,
  saveCustomDefensePlay as saveCustomDefPlayApi, deleteCustomDefensePlay as deleteCustomDefPlayApi,
  getFormations,
} from '../api';
import type {
  League, Team, Player, PlayEffStats, OffensiveSlot, OffensiveFormation, OffensivePlay,
  Playbook, PlaybookEntry, DownDistanceBucket, OffensivePlan,
  DefensiveSlot, DefensivePackage, DefensivePlay, DefPlaybook,
  DefPlaybookEntry, DefensivePlan, TeamTendencies, RouteTag,
} from '../types';
import { DEFAULT_TENDENCIES, COACH_ARCHETYPES } from '../types';

// ── Playbooks View ─────────────────────────────────────────────────────────────

const BUCKET_LABELS: Record<DownDistanceBucket, string> = {
  FIRST_10:      '1st & 10',
  FIRST_LONG:    '1st & Long (11+)',
  FIRST_MEDIUM:  '1st & Medium (4–10)',
  FIRST_SHORT:   '1st & Short (1–3)',
  SECOND_LONG:   '2nd & Long (7+)',
  SECOND_MEDIUM: '2nd & Medium (4–6)',
  SECOND_SHORT:  '2nd & Short (1–3)',
  THIRD_LONG:    '3rd & Long (7+)',
  THIRD_MEDIUM:  '3rd & Medium (4–6)',
  THIRD_SHORT:   '3rd & Short (1–3)',
  FOURTH_LONG:   '4th & Long (7+)',
  FOURTH_MEDIUM: '4th & Medium (4–6)',
  FOURTH_SHORT:  '4th & Short (1–3)',
};

const ALL_BUCKETS: DownDistanceBucket[] = [
  'FIRST_10', 'FIRST_LONG', 'FIRST_MEDIUM', 'FIRST_SHORT',
  'SECOND_LONG', 'SECOND_MEDIUM', 'SECOND_SHORT',
  'THIRD_LONG', 'THIRD_MEDIUM', 'THIRD_SHORT',
  'FOURTH_LONG', 'FOURTH_MEDIUM', 'FOURTH_SHORT',
];

const SLOT_LABELS: Record<OffensiveSlot, string> = {
  X:    'X — Split End',
  Z:    'Z — Flanker',
  SLOT: 'SLOT — Slot WR',
  TE:   'TE — Tight End',
  RB:   'RB — Running Back',
  FB:   'FB — Fullback',
};

const ENGINE_TYPE_LABELS: Record<string, string> = {
  inside_run:  'Inside Run',
  outside_run: 'Outside Run',
  short_pass:  'Short Pass',
  medium_pass: 'Medium Pass',
  deep_pass:   'Deep Pass',
  screen_pass: 'Screen Pass',
  play_action: 'Play Action',
};

/** Players eligible for offensive skill slots (WR, TE, RB, FB from roster) */
function eligiblePlayers(team: Team, slot: OffensiveSlot): Player[] {
  const pos = slot === 'TE' ? ['TE']
    : slot === 'RB' || slot === 'FB' ? ['RB', 'FB']
    : ['WR'];
  return team.roster.filter(p => pos.includes(p.position));
}

// ── Defensive constants ────────────────────────────────────────────────────────

const DEF_SLOT_LABELS: Record<DefensiveSlot, string> = {
  DE1:  'DE1 — Defensive End',
  DE2:  'DE2 — Defensive End',
  DT1:  'DT1 — Defensive Tackle',
  DT2:  'DT2 — Defensive Tackle',
  NT:   'NT — Nose Tackle',
  LB1:  'LB1 — Linebacker',
  LB2:  'LB2 — Linebacker',
  LB3:  'LB3 — Linebacker',
  LB4:  'LB4 — Linebacker',
  OLB1: 'OLB1 — Outside Linebacker',
  OLB2: 'OLB2 — Outside Linebacker',
  ILB1: 'ILB1 — Inside Linebacker',
  ILB2: 'ILB2 — Inside Linebacker',
  CB1:  'CB1 — Cornerback',
  CB2:  'CB2 — Cornerback',
  NCB:  'NCB — Nickel Back',
  DC1:  'DC1 — Dime Back',
  DC2:  'DC2 — Second Dime Back',
  FS:   'FS — Free Safety',
  SS:   'SS — Strong Safety',
};

const DEF_SLOT_POSITIONS: Record<DefensiveSlot, string[]> = {
  DE1:  ['DE'],
  DE2:  ['DE'],
  DT1:  ['DT'],
  DT2:  ['DT'],
  NT:   ['DT'],
  LB1:  ['OLB', 'MLB'],
  LB2:  ['OLB', 'MLB'],
  LB3:  ['OLB', 'MLB'],
  LB4:  ['OLB', 'MLB'],
  OLB1: ['OLB'],
  OLB2: ['OLB'],
  ILB1: ['MLB'],
  ILB2: ['MLB'],
  CB1:  ['CB'],
  CB2:  ['CB'],
  NCB:  ['CB'],
  DC1:  ['CB'],
  DC2:  ['CB'],
  FS:   ['FS'],
  SS:   ['SS'],
};

const COVERAGE_LABELS: Record<string, string> = {
  cover_0:  'Cover 0',
  cover_1:  'Cover 1',
  cover_2:  'Cover 2',
  cover_3:  'Cover 3',
  cover_4:  'Quarters',
  cover_6:  'Cover 6',
  tampa_2:  'Tampa-2',
  man_under:'Man Under',
};

const FRONT_LABELS: Record<string, string> = {
  four_three: '4-3',
  three_four: '3-4',
  nickel:     'Nickel',
  dime:       'Dime',
  quarter:    'Quarter',
  goal_line:  'Goal Line',
};

const BLITZ_LABELS: Record<string, string> = {
  lb_blitz:     'LB Blitz',
  cb_blitz:     'CB Blitz',
  safety_blitz: 'S Blitz',
  zone_blitz:   'Zone Blitz',
};

/** Players eligible for a defensive package slot based on position. */
function eligibleDefensivePlayers(team: Team, slot: DefensiveSlot): Player[] {
  const positions = DEF_SLOT_POSITIONS[slot] ?? [];
  return team.roster.filter(p => positions.includes(p.position));
}

function PlaybooksView({
  team, league: leagueObj, leagueId, onLeagueUpdated,
}: {
  team: Team;
  league: League;
  leagueId: string;
  onLeagueUpdated: (l: League) => void;
}) {
  // ── Side toggle ─────────────────────────────────────────────────────────────
  const [playbookSide, setPlaybookSide] = useState<'offense' | 'defense'>('offense');

  // ── Library data (loaded once) ───────────────────────────────────────────────
  const [formations, setFormations]               = useState<OffensiveFormation[]>([]);
  const [playbooks, setPlaybooks]                 = useState<Playbook[]>([]);
  const [allPlays, setAllPlays]                   = useState<OffensivePlay[]>([]);
  const [packages, setPackages]                   = useState<DefensivePackage[]>([]);
  const [defPlaybooks, setDefPlaybooks]           = useState<DefPlaybook[]>([]);
  const [defPlays, setDefPlays]                   = useState<DefensivePlay[]>([]);
  const [loadErr, setLoadErr]                     = useState<string | null>(null);
  const [loading, setLoading]                     = useState(true);

  // ── Offensive formation state ────────────────────────────────────────────────
  const [activeFormationId, setActiveFormationId] = useState<string>('');
  const [localSlotEdits, setLocalSlotEdits] =
    useState<Record<string, Partial<Record<OffensiveSlot, string | null>>>>({});
  const [slotsSaving, setSlotsSaving] = useState(false);
  const [slotsError, setSlotsError]   = useState<string | null>(null);

  // ── Offensive plan state ─────────────────────────────────────────────────────
  const [localPlanEdits, setLocalPlanEdits] = useState<Partial<OffensivePlan>>({});
  const [planSaving, setPlanSaving]         = useState(false);
  const [planError, setPlanError]           = useState<string | null>(null);

  // ── Offensive library accordion ──────────────────────────────────────────────
  const [expandedBooks, setExpandedBooks] = useState<Set<string>>(new Set());

  // ── Defensive package state ──────────────────────────────────────────────────
  const [activePackageId, setActivePackageId] = useState<string>('');
  const [localPkgSlotEdits, setLocalPkgSlotEdits] =
    useState<Record<string, Partial<Record<DefensiveSlot, string | null>>>>({});
  const [pkgSlotsSaving, setPkgSlotsSaving] = useState(false);
  const [pkgSlotsError, setPkgSlotsError]   = useState<string | null>(null);

  // ── Defensive plan state ─────────────────────────────────────────────────────
  const [localDefPlanEdits, setLocalDefPlanEdits] = useState<Partial<DefensivePlan>>({});
  const [defPlanSaving, setDefPlanSaving]         = useState(false);
  const [defPlanError, setDefPlanError]           = useState<string | null>(null);

  // ── Defensive library accordion ──────────────────────────────────────────────
  const [expandedDefBooks, setExpandedDefBooks] = useState<Set<string>>(new Set());

  // ── Custom playbook editor state ─────────────────────────────────────────────
  // Local edits keyed by playbook ID. Includes both edits to existing custom playbooks
  // and unsaved new playbooks (IDs not yet in team.customOffensivePlaybooks / customDefensivePlaybooks).
  const [offPbEdits, setOffPbEdits] =
    useState<Record<string, { name: string; entries: PlaybookEntry[] }>>({});
  const [defPbEdits, setDefPbEdits] =
    useState<Record<string, { name: string; entries: DefPlaybookEntry[] }>>({});
  const [editingOffPbId, setEditingOffPbId] = useState<string | null>(null);
  const [editingDefPbId, setEditingDefPbId] = useState<string | null>(null);
  const [offPlayFilter, setOffPlayFilter]   = useState('');
  const [defPlayFilter, setDefPlayFilter]   = useState('');
  const [pbSaving, setPbSaving]             = useState(false);
  const [pbError, setPbError]               = useState<string | null>(null);
  const [offPbNameError, setOffPbNameError] = useState<string | null>(null);
  const [defPbNameError, setDefPbNameError] = useState<string | null>(null);
  const [deletingPbId, setDeletingPbId]     = useState<string | null>(null);

  // ── Tendencies state ─────────────────────────────────────────────────────────
  const [tendencyEdits, setTendencyEdits] = useState<Partial<TeamTendencies>>({});
  const [tendencySaving, setTendencySaving] = useState(false);
  const [tendencyError, setTendencyError]   = useState<string | null>(null);
  const [showTendencies, setShowTendencies] = useState(true);

  const savedTendencies: TeamTendencies = team.tendencies ?? DEFAULT_TENDENCIES;
  const mergedTendencies: TeamTendencies = { ...savedTendencies, ...tendencyEdits };
  const tendenciesHaveChanges = (Object.keys(tendencyEdits) as (keyof TeamTendencies)[]).some(
    k => tendencyEdits[k] !== undefined && tendencyEdits[k] !== savedTendencies[k],
  );

  async function saveTendencies() {
    if (!tendenciesHaveChanges) return;
    setTendencySaving(true);
    setTendencyError(null);
    try {
      const updated = await setTendenciesApi(leagueId, mergedTendencies);
      onLeagueUpdated(updated);
      setTendencyEdits({});
      showToast('Gameplan saved');
    } catch (e) { setTendencyError(friendlyError(e)); }
    finally { setTendencySaving(false); }
  }

  // ── Success toast ────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  // ── Custom play creator state ────────────────────────────────────────────────
  const [showPlayCreator, setShowPlayCreator] = useState(false);
  const [cpFormation, setCpFormation]   = useState('');
  const [cpName, setCpName]             = useState('');
  const [cpEngine, setCpEngine]         = useState<string>('short_pass');
  const [cpRoutes, setCpRoutes]         = useState<Record<string, { route: string; depth: RouteTag }>>({});
  const [cpBallCarrier, setCpBallCarrier] = useState<string>('RB');
  const [cpPlayAction, setCpPlayAction] = useState(false);
  const [cpSaving, setCpSaving]         = useState(false);
  const [cpError, setCpError]           = useState<string | null>(null);
  const [cpEditId, setCpEditId]         = useState<string | null>(null); // null = new play
  const [cpDeleting, setCpDeleting]     = useState<string | null>(null);

  const cpIsRun = cpEngine === 'inside_run' || cpEngine === 'outside_run';
  const cpFormationObj = formations.find(f => f.id === cpFormation) ?? null;

  // ── Play Analytics state ────────────────────────────────────────────────────
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticSort, setAnalyticSort] = useState<'calls' | 'avg' | 'success' | 'td' | 'to'>('calls');
  const [analyticFilter, setAnalyticFilter] = useState<'all' | 'run' | 'pass'>('all');
  const [analyticView, setAnalyticView] = useState<'overall' | 'situational'>('overall');
  const [analyticBucket, setAnalyticBucket] = useState<DownDistanceBucket>('FIRST_10');

  function resetPlayCreator() {
    setCpName(''); setCpEngine('short_pass'); setCpRoutes({});
    setCpBallCarrier('RB'); setCpPlayAction(false); setCpError(null); setCpEditId(null);
  }

  function openPlayCreator(play?: OffensivePlay) {
    if (play) {
      setCpEditId(play.id);
      setCpName(play.name);
      setCpFormation(play.formationId);
      setCpEngine(play.engineType);
      setCpPlayAction(!!play.isPlayAction);
      if (play.ballCarrierSlot) setCpBallCarrier(play.ballCarrierSlot);
      const routes: Record<string, { route: string; depth: RouteTag }> = {};
      for (const r of play.routes ?? []) {
        routes[r.slot] = { route: r.routeTag, depth: r.routeTag };
      }
      setCpRoutes(routes);
    } else {
      resetPlayCreator();
      if (formations.length > 0 && !cpFormation) setCpFormation(formations[0]!.id);
    }
    setShowPlayCreator(true);
  }

  // Validate custom play client-side
  function validateCustomPlay(): string | null {
    if (!cpName.trim()) return 'Play name is required.';
    if (cpName.trim().length > 60) return 'Play name must be 60 characters or fewer.';
    if (!cpFormationObj) return 'Select a formation.';
    if (!cpIsRun) {
      const routeEntries = Object.entries(cpRoutes);
      if (routeEntries.length === 0) return 'Assign at least one route.';
      let deepCount = 0, hasShortMed = false;
      for (const [, r] of routeEntries) {
        if (r.depth === 'DEEP') deepCount++;
        if (r.depth === 'SHORT' || r.depth === 'MEDIUM') hasShortMed = true;
      }
      if (deepCount > 3) return 'Maximum 3 deep routes.';
      if (!hasShortMed) return 'At least one SHORT or MEDIUM route required.';
    } else {
      if (!cpFormationObj.slots.includes(cpBallCarrier as OffensiveSlot)) {
        return `Ball carrier slot '${cpBallCarrier}' not in this formation.`;
      }
    }
    return null;
  }

  async function handleSaveCustomPlay() {
    const err = validateCustomPlay();
    if (err) { setCpError(err); return; }
    setCpSaving(true); setCpError(null);
    const id = cpEditId ?? `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const play: OffensivePlay = {
      id,
      name: cpName.trim(),
      formationId: cpFormation,
      engineType: cpEngine as OffensivePlay['engineType'],
      ...(cpIsRun
        ? { ballCarrierSlot: cpBallCarrier as OffensiveSlot }
        : {
            routes: Object.entries(cpRoutes).map(([slot, r]) => ({
              slot: slot as OffensiveSlot,
              routeTag: r.depth,
            })),
          }),
      ...(cpPlayAction ? { isPlayAction: true } : {}),
    };
    try {
      const updated = await saveCustomPlayApi(leagueId, play);
      onLeagueUpdated(updated);
      showToast(cpEditId ? 'Play updated' : 'Play created');
      setShowPlayCreator(false);
      resetPlayCreator();
    } catch (e) { setCpError(friendlyError(e)); }
    finally { setCpSaving(false); }
  }

  async function handleDeleteCustomPlay(playId: string) {
    setCpDeleting(playId);
    try {
      const updated = await deleteCustomPlayApi(leagueId, playId);
      onLeagueUpdated(updated);
      showToast('Play deleted');
    } catch (e) { setCpError(friendlyError(e)); }
    finally { setCpDeleting(null); }
  }

  // ── Custom defensive play creator state ──────────────────────────────────────
  const [showDefPlayCreator, setShowDefPlayCreator] = useState(false);
  const [cdpName, setCdpName]         = useState('');
  const [cdpPackage, setCdpPackage]   = useState('');
  const [cdpFront, setCdpFront]       = useState('four_three');
  const [cdpCoverage, setCdpCoverage] = useState('cover_3');
  const [cdpBlitz, setCdpBlitz]       = useState('');
  const [cdpSaving, setCdpSaving]     = useState(false);
  const [cdpError, setCdpError]       = useState<string | null>(null);
  const [cdpEditId, setCdpEditId]     = useState<string | null>(null);
  const [cdpDeleting, setCdpDeleting] = useState<string | null>(null);

  function resetDefPlayCreator() {
    setCdpName(''); setCdpFront('four_three'); setCdpCoverage('cover_3');
    setCdpBlitz(''); setCdpError(null); setCdpEditId(null);
  }

  function openDefPlayCreator(play?: DefensivePlay) {
    if (play) {
      setCdpEditId(play.id);
      setCdpName(play.name);
      setCdpPackage(play.packageId);
      setCdpFront(play.front);
      setCdpCoverage(play.coverage);
      setCdpBlitz(play.blitz ?? '');
    } else {
      resetDefPlayCreator();
      if (packages.length > 0 && !cdpPackage) setCdpPackage(packages[0]!.id);
    }
    setShowDefPlayCreator(true);
  }

  async function handleSaveDefPlay() {
    if (!cdpName.trim()) { setCdpError('Play name is required.'); return; }
    if (!cdpPackage) { setCdpError('Select a package.'); return; }
    if (cdpBlitz && (cdpCoverage === 'cover_4' || cdpCoverage === 'cover_6')) {
      setCdpError(`Cannot blitz with ${cdpCoverage}.`); return;
    }
    setCdpSaving(true); setCdpError(null);
    const id = cdpEditId ?? `custom_def_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const play: DefensivePlay = {
      id, name: cdpName.trim(), packageId: cdpPackage,
      front: cdpFront as DefensivePlay['front'],
      coverage: cdpCoverage as DefensivePlay['coverage'],
      ...(cdpBlitz ? { blitz: cdpBlitz as DefensivePlay['blitz'] } : {}),
    };
    try {
      const updated = await saveCustomDefPlayApi(leagueId, play);
      onLeagueUpdated(updated);
      showToast(cdpEditId ? 'Defensive play updated' : 'Defensive play created');
      setShowDefPlayCreator(false); resetDefPlayCreator();
    } catch (e) { setCdpError(friendlyError(e)); }
    finally { setCdpSaving(false); }
  }

  async function handleDeleteDefPlay(playId: string) {
    setCdpDeleting(playId);
    try {
      const updated = await deleteCustomDefPlayApi(leagueId, playId);
      onLeagueUpdated(updated);
      showToast('Defensive play deleted');
    } catch (e) { setCdpError(friendlyError(e)); }
    finally { setCdpDeleting(null); }
  }

  // ── Load library ─────────────────────────────────────────────────────────────
  useEffect(() => {
    getFormations()
      .then(({ formations: f, playbooks: pb, plays: pl, packages: pkgs, defensivePlaybooks: dpb, defensivePlays: dpl }) => {
        setFormations(f);
        setPlaybooks(pb);
        setAllPlays(pl);
        setPackages(pkgs);
        setDefPlaybooks(dpb);
        setDefPlays(dpl);
        if (f.length > 0)   setActiveFormationId(f[0]!.id);
        if (pkgs.length > 0) setActivePackageId(pkgs[0]!.id);
      })
      .catch(e => setLoadErr(friendlyError(e)))
      .finally(() => setLoading(false));
  }, []);

  // ── Offensive derived ─────────────────────────────────────────────────────────
  const playById        = useMemo(() => new Map(allPlays.map(p => [p.id, p])), [allPlays]);
  const activeFormation = formations.find(f => f.id === activeFormationId) ?? null;

  const savedSlots = team.formationDepthCharts?.[activeFormationId] ?? {};
  const localSlots = localSlotEdits[activeFormationId] ?? {};
  const mergedSlots: Partial<Record<OffensiveSlot, string | null>> = { ...savedSlots, ...localSlots };

  const slotsHaveChanges = (activeFormation?.slots ?? []).some(slot => {
    const saved = savedSlots[slot] ?? null;
    const local = localSlots[slot] !== undefined ? localSlots[slot] : saved;
    return local !== saved;
  });

  const savedPlan   = team.offensivePlan ?? {} as Partial<OffensivePlan>;
  const mergedPlan  = { ...savedPlan, ...localPlanEdits };
  const planHasChanges = ALL_BUCKETS.some(b => {
    const saved = savedPlan[b] ?? '';
    const local = localPlanEdits[b] !== undefined ? (localPlanEdits[b] ?? '') : saved;
    return local !== saved;
  });

  // ── Offensive config summary ──────────────────────────────────────────────────
  const formationsConfigured = formations.filter(f => {
    const slots = team.formationDepthCharts?.[f.id] ?? {};
    return Object.values(slots).some(v => v != null);
  }).length;
  const bucketsAssigned = ALL_BUCKETS.filter(b => team.offensivePlan?.[b]).length;
  const bucketsOnDefault = ALL_BUCKETS.length - bucketsAssigned;

  const warnings: string[] = [];
  formations.forEach(f => {
    const slots     = team.formationDepthCharts?.[f.id] ?? {};
    const emptySlots = f.slots.filter(s => !slots[s]);
    if (emptySlots.length > 0 && emptySlots.length < f.slots.length) {
      warnings.push(`${f.name}: ${emptySlots.length} slot${emptySlots.length > 1 ? 's' : ''} unassigned`);
    }
  });
  if (bucketsOnDefault > 0) {
    warnings.push(`${bucketsOnDefault} bucket${bucketsOnDefault > 1 ? 's' : ''} using default playbook`);
  }

  // ── Defensive derived ─────────────────────────────────────────────────────────
  const defPlayById    = useMemo(() => new Map(defPlays.map(p => [p.id, p])), [defPlays]);
  const activePackage  = packages.find(p => p.id === activePackageId) ?? null;

  const savedPkgSlots  = team.packageDepthCharts?.[activePackageId] ?? {};
  const localPkgSlots  = localPkgSlotEdits[activePackageId] ?? {};
  const mergedPkgSlots: Partial<Record<DefensiveSlot, string | null>> = { ...savedPkgSlots, ...localPkgSlots };

  const pkgSlotsHaveChanges = (activePackage?.slots ?? []).some(slot => {
    const saved = savedPkgSlots[slot] ?? null;
    const local = localPkgSlots[slot] !== undefined ? localPkgSlots[slot] : saved;
    return local !== saved;
  });

  const savedDefPlan   = team.defensivePlan ?? {} as Partial<DefensivePlan>;
  const mergedDefPlan  = { ...savedDefPlan, ...localDefPlanEdits };
  const defPlanHasChanges = ALL_BUCKETS.some(b => {
    const saved = savedDefPlan[b] ?? '';
    const local = localDefPlanEdits[b] !== undefined ? (localDefPlanEdits[b] ?? '') : saved;
    return local !== saved;
  });

  // ── Defensive config summary ──────────────────────────────────────────────────
  const packagesConfigured = packages.filter(p => {
    const slots = team.packageDepthCharts?.[p.id] ?? {};
    return Object.values(slots).some(v => v != null);
  }).length;
  const defBucketsAssigned   = ALL_BUCKETS.filter(b => team.defensivePlan?.[b]).length;
  const defBucketsOnDefault  = ALL_BUCKETS.length - defBucketsAssigned;

  const defWarnings: string[] = [];
  packages.forEach(p => {
    const slots     = team.packageDepthCharts?.[p.id] ?? {};
    const empty     = p.slots.filter(s => !slots[s]);
    if (empty.length > 0 && empty.length < p.slots.length) {
      defWarnings.push(`${p.name}: ${empty.length} slot${empty.length > 1 ? 's' : ''} unassigned`);
    }
  });
  if (defBucketsOnDefault > 0) {
    defWarnings.push(`${defBucketsOnDefault} bucket${defBucketsOnDefault > 1 ? 's' : ''} using default playbook`);
  }

  // ── Merged custom playbooks ───────────────────────────────────────────────────
  // Combines server-saved custom playbooks with local edits / new pending playbooks.
  const allCustomOffPbs: Playbook[] = useMemo(() => {
    const serverPbs = team.customOffensivePlaybooks ?? [];
    const result: Playbook[] = serverPbs.map(pb => {
      const edits = offPbEdits[pb.id];
      return edits ? { id: pb.id, ...edits } : pb;
    });
    for (const [id, edits] of Object.entries(offPbEdits)) {
      if (!serverPbs.some(pb => pb.id === id)) result.push({ id, ...edits });
    }
    return result;
  }, [team.customOffensivePlaybooks, offPbEdits]);

  const allCustomDefPbs: DefPlaybook[] = useMemo(() => {
    const serverPbs = team.customDefensivePlaybooks ?? [];
    const result: DefPlaybook[] = serverPbs.map(pb => {
      const edits = defPbEdits[pb.id];
      return edits ? { id: pb.id, ...edits } : pb;
    });
    for (const [id, edits] of Object.entries(defPbEdits)) {
      if (!serverPbs.some(pb => pb.id === id)) result.push({ id, ...edits });
    }
    return result;
  }, [team.customDefensivePlaybooks, defPbEdits]);

  // ── Playbook quality warnings ─────────────────────────────────────────────────
  function getOffPbWarnings(entries: PlaybookEntry[]): string[] {
    const w: string[] = [];
    if (entries.length > 0 && entries.length < 3) w.push('Very thin playbook — fewer than 3 plays limits variety.');
    const totalWeight = entries.reduce((s, e) => s + e.weight, 0);
    if (totalWeight > 0 && entries.length > 1) {
      const maxE = entries.reduce((mx, e) => e.weight > mx.weight ? e : mx, entries[0]!);
      const pct  = (maxE.weight / totalWeight) * 100;
      if (pct > 60) w.push(`"${playById.get(maxE.playId)?.name ?? maxE.playId}" dominates at ${Math.round(pct)}% of calls — consider spreading weight.`);
    }
    const runCount = entries.filter(e => { const p = playById.get(e.playId); return p?.engineType === 'inside_run' || p?.engineType === 'outside_run'; }).length;
    if (entries.length > 0 && runCount === 0)             w.push('All pass — no run plays in this playbook.');
    if (entries.length > 0 && runCount === entries.length) w.push('All run — no pass plays in this playbook.');
    return w;
  }

  function getDefPbWarnings(entries: DefPlaybookEntry[]): string[] {
    const w: string[] = [];
    if (entries.length > 0 && entries.length < 3) w.push('Very thin playbook — fewer than 3 plays limits variety.');
    const totalWeight = entries.reduce((s, e) => s + e.weight, 0);
    if (totalWeight > 0 && entries.length > 1) {
      const maxE = entries.reduce((mx, e) => e.weight > mx.weight ? e : mx, entries[0]!);
      const pct  = (maxE.weight / totalWeight) * 100;
      if (pct > 60) w.push(`"${defPlayById.get(maxE.playId)?.name ?? maxE.playId}" dominates at ${Math.round(pct)}% of calls — consider spreading weight.`);
    }
    const coverages = entries.map(e => defPlayById.get(e.playId)?.coverage ?? '');
    const uniqueCoverages = new Set(coverages.filter(Boolean));
    if (entries.length >= 3 && uniqueCoverages.size === 1) w.push('Only one coverage type — consider mixing man and zone.');
    return w;
  }

  // ── Offensive handlers ────────────────────────────────────────────────────────
  function handleLocalSlotChange(slot: OffensiveSlot, playerId: string | null) {
    setLocalSlotEdits(prev => ({
      ...prev,
      [activeFormationId]: { ...(prev[activeFormationId] ?? {}), [slot]: playerId },
    }));
    setSlotsError(null);
  }

  function handleRevertSlots() {
    setLocalSlotEdits(prev => {
      const next = { ...prev };
      delete next[activeFormationId];
      return next;
    });
    setSlotsError(null);
  }

  async function handleSaveSlots() {
    if (slotsSaving || !slotsHaveChanges) return;
    setSlotsSaving(true);
    setSlotsError(null);

    const changedSlots = (activeFormation?.slots ?? []).filter(slot => {
      const saved = savedSlots[slot] ?? null;
      const local = localSlots[slot] !== undefined ? localSlots[slot] : saved;
      return local !== saved;
    });

    try {
      let latest: League | null = null;
      for (const slot of changedSlots) {
        const val = localSlots[slot] !== undefined ? (localSlots[slot] ?? null) : (savedSlots[slot] ?? null);
        latest = await setFormationSlotApi(leagueId, activeFormationId, slot, val);
      }
      if (latest) {
        onLeagueUpdated(latest);
        // Clear local edits for this formation — they are now persisted
        setLocalSlotEdits(prev => {
          const next = { ...prev };
          delete next[activeFormationId];
          return next;
        });
        showToast('Formation saved');
      }
    } catch (e) {
      setSlotsError(friendlyError(e));
    } finally {
      setSlotsSaving(false);
    }
  }

  function handleLocalPlanChange(bucket: DownDistanceBucket, playbookId: string) {
    setLocalPlanEdits(prev => ({ ...prev, [bucket]: playbookId || undefined }));
    setPlanError(null);
  }

  function handleRevertPlan() {
    setLocalPlanEdits({});
    setPlanError(null);
  }

  async function handleSavePlan() {
    if (planSaving || !planHasChanges) return;
    setPlanSaving(true);
    setPlanError(null);

    // Build the full merged plan to send — this lets the server overwrite all at once
    const planToSave: Partial<OffensivePlan> = {};
    ALL_BUCKETS.forEach(b => {
      const val = mergedPlan[b];
      if (val) planToSave[b] = val;
    });

    try {
      const updated = await setOffensivePlanApi(leagueId, planToSave);
      onLeagueUpdated(updated);
      setLocalPlanEdits({});
      showToast('Offensive plan saved');
    } catch (e) {
      setPlanError(friendlyError(e));
    } finally {
      setPlanSaving(false);
    }
  }

  function toggleBook(id: string) {
    setExpandedBooks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ── Defensive handlers ─────────────────────────────────────────────────────
  function handleLocalPkgSlotChange(slot: DefensiveSlot, playerId: string | null) {
    setLocalPkgSlotEdits(prev => ({
      ...prev,
      [activePackageId]: { ...(prev[activePackageId] ?? {}), [slot]: playerId },
    }));
    setPkgSlotsError(null);
  }

  function handleRevertPkgSlots() {
    setLocalPkgSlotEdits(prev => {
      const next = { ...prev };
      delete next[activePackageId];
      return next;
    });
    setPkgSlotsError(null);
  }

  async function handleSavePkgSlots() {
    if (pkgSlotsSaving || !pkgSlotsHaveChanges) return;
    setPkgSlotsSaving(true);
    setPkgSlotsError(null);

    const changedSlots = (activePackage?.slots ?? []).filter(slot => {
      const saved = savedPkgSlots[slot] ?? null;
      const local = localPkgSlots[slot] !== undefined ? localPkgSlots[slot] : saved;
      return local !== saved;
    });

    try {
      let latest: League | null = null;
      for (const slot of changedSlots) {
        const val = localPkgSlots[slot] !== undefined ? (localPkgSlots[slot] ?? null) : (savedPkgSlots[slot] ?? null);
        latest = await setPackageSlotApi(leagueId, activePackageId, slot, val);
      }
      if (latest) {
        onLeagueUpdated(latest);
        setLocalPkgSlotEdits(prev => {
          const next = { ...prev };
          delete next[activePackageId];
          return next;
        });
        showToast('Package saved');
      }
    } catch (e) {
      setPkgSlotsError(friendlyError(e));
    } finally {
      setPkgSlotsSaving(false);
    }
  }

  function handleLocalDefPlanChange(bucket: DownDistanceBucket, playbookId: string) {
    setLocalDefPlanEdits(prev => ({ ...prev, [bucket]: playbookId || undefined }));
    setDefPlanError(null);
  }

  function handleRevertDefPlan() {
    setLocalDefPlanEdits({});
    setDefPlanError(null);
  }

  async function handleSaveDefPlan() {
    if (defPlanSaving || !defPlanHasChanges) return;
    setDefPlanSaving(true);
    setDefPlanError(null);

    const planToSave: Partial<DefensivePlan> = {};
    ALL_BUCKETS.forEach(b => {
      const val = mergedDefPlan[b];
      if (val) planToSave[b] = val;
    });

    try {
      const updated = await setDefensivePlanApi(leagueId, planToSave);
      onLeagueUpdated(updated);
      setLocalDefPlanEdits({});
      showToast('Defensive plan saved');
    } catch (e) {
      setDefPlanError(friendlyError(e));
    } finally {
      setDefPlanSaving(false);
    }
  }

  function toggleDefBook(id: string) {
    setExpandedDefBooks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ── Custom playbook handlers (offense) ────────────────────────────────────────
  function handleCreateOffPlaybook() {
    const id = crypto.randomUUID();
    setOffPbEdits(prev => ({ ...prev, [id]: { name: 'New Playbook', entries: [] } }));
    setEditingOffPbId(id);
    setPbError(null);
  }

  function handleDuplicateOffPlaybook(source: Playbook) {
    const id = crypto.randomUUID();
    setOffPbEdits(prev => ({ ...prev, [id]: { name: `Copy of ${source.name}`, entries: [...source.entries] } }));
    setEditingOffPbId(id);
    setPbError(null);
  }

  function handleEditOffPlaybook(pb: Playbook) {
    if (!offPbEdits[pb.id]) {
      setOffPbEdits(prev => ({ ...prev, [pb.id]: { name: pb.name, entries: [...pb.entries] } }));
    }
    setEditingOffPbId(pb.id);
    setPbError(null);
  }

  function handleCancelOffPlaybook(id: string) {
    const isNew = !(team.customOffensivePlaybooks ?? []).some(pb => pb.id === id);
    const edits = offPbEdits[id];
    if (edits) {
      const server = (team.customOffensivePlaybooks ?? []).find(pb => pb.id === id);
      const hasChanges = isNew || !server ||
        edits.name !== server.name ||
        JSON.stringify(edits.entries) !== JSON.stringify(server.entries);
      if (hasChanges && !window.confirm('You have unsaved changes. Discard them?')) return;
    }
    if (isNew) setOffPbEdits(prev => { const n = { ...prev }; delete n[id]; return n; });
    setEditingOffPbId(null);
    setPbError(null);
    setOffPbNameError(null);
  }

  function handleRevertOffPlaybook(id: string) {
    setOffPbEdits(prev => { const n = { ...prev }; delete n[id]; return n; });
    setEditingOffPbId(null);
  }

  async function handleSaveOffPlaybook(id: string) {
    const edits = offPbEdits[id];
    if (!edits) return;
    if (!edits.name.trim()) { setOffPbNameError('Name cannot be empty.'); return; }
    if (edits.name.trim().length > 60) { setOffPbNameError('Name must be 60 characters or fewer.'); return; }
    const dupName = allCustomOffPbs.filter(pb => pb.id !== id)
      .find(pb => pb.name.trim().toLowerCase() === edits.name.trim().toLowerCase());
    if (dupName) { setOffPbNameError(`"${edits.name.trim()}" is already used by another playbook.`); return; }
    setOffPbNameError(null);
    if (edits.entries.length === 0) { setPbError('Add at least one play before saving.'); return; }
    setPbSaving(true); setPbError(null);
    try {
      const updated = await saveOffensePlaybookApi(leagueId, { id, name: edits.name.trim(), entries: edits.entries });
      onLeagueUpdated(updated);
      setOffPbEdits(prev => { const n = { ...prev }; delete n[id]; return n; });
      setEditingOffPbId(null);
      showToast('Playbook saved');
    } catch (e) { setPbError(friendlyError(e)); }
    finally { setPbSaving(false); }
  }

  async function handleDeleteOffPlaybook(id: string) {
    if (deletingPbId) return;
    setDeletingPbId(id); setPbError(null);
    try {
      const updated = await deleteOffensePlaybookApi(leagueId, id);
      onLeagueUpdated(updated);
      setOffPbEdits(prev => { const n = { ...prev }; delete n[id]; return n; });
      if (editingOffPbId === id) setEditingOffPbId(null);
      showToast('Playbook deleted');
    } catch (e) { setPbError(friendlyError(e)); }
    finally { setDeletingPbId(null); }
  }

  function updateOffPbEntry(pbId: string, playId: string, weight: number) {
    setOffPbEdits(prev => ({
      ...prev,
      [pbId]: { ...prev[pbId]!, entries: prev[pbId]!.entries.map(e => e.playId === playId ? { playId, weight } : e) },
    }));
  }
  function removeOffPbEntry(pbId: string, playId: string) {
    setOffPbEdits(prev => ({
      ...prev,
      [pbId]: { ...prev[pbId]!, entries: prev[pbId]!.entries.filter(e => e.playId !== playId) },
    }));
  }
  function addOffPbEntry(pbId: string, playId: string) {
    setOffPbEdits(prev => ({
      ...prev,
      [pbId]: { ...prev[pbId]!, entries: [...prev[pbId]!.entries, { playId, weight: 10 }] },
    }));
  }

  // ── Custom playbook handlers (defense) ────────────────────────────────────────
  function handleCreateDefPlaybook() {
    const id = crypto.randomUUID();
    setDefPbEdits(prev => ({ ...prev, [id]: { name: 'New Defensive Playbook', entries: [] } }));
    setEditingDefPbId(id);
    setPbError(null);
  }

  function handleDuplicateDefPlaybook(source: DefPlaybook) {
    const id = crypto.randomUUID();
    setDefPbEdits(prev => ({ ...prev, [id]: { name: `Copy of ${source.name}`, entries: [...source.entries] } }));
    setEditingDefPbId(id);
    setPbError(null);
  }

  function handleEditDefPlaybook(pb: DefPlaybook) {
    if (!defPbEdits[pb.id]) {
      setDefPbEdits(prev => ({ ...prev, [pb.id]: { name: pb.name, entries: [...pb.entries] } }));
    }
    setEditingDefPbId(pb.id);
    setPbError(null);
  }

  function handleCancelDefPlaybook(id: string) {
    const isNew = !(team.customDefensivePlaybooks ?? []).some(pb => pb.id === id);
    const edits = defPbEdits[id];
    if (edits) {
      const server = (team.customDefensivePlaybooks ?? []).find(pb => pb.id === id);
      const hasChanges = isNew || !server ||
        edits.name !== server.name ||
        JSON.stringify(edits.entries) !== JSON.stringify(server.entries);
      if (hasChanges && !window.confirm('You have unsaved changes. Discard them?')) return;
    }
    if (isNew) setDefPbEdits(prev => { const n = { ...prev }; delete n[id]; return n; });
    setEditingDefPbId(null);
    setPbError(null);
    setDefPbNameError(null);
  }

  function handleRevertDefPlaybook(id: string) {
    setDefPbEdits(prev => { const n = { ...prev }; delete n[id]; return n; });
    setEditingDefPbId(null);
  }

  async function handleSaveDefPlaybook(id: string) {
    const edits = defPbEdits[id];
    if (!edits) return;
    if (!edits.name.trim()) { setDefPbNameError('Name cannot be empty.'); return; }
    if (edits.name.trim().length > 60) { setDefPbNameError('Name must be 60 characters or fewer.'); return; }
    const dupName = allCustomDefPbs.filter(pb => pb.id !== id)
      .find(pb => pb.name.trim().toLowerCase() === edits.name.trim().toLowerCase());
    if (dupName) { setDefPbNameError(`"${edits.name.trim()}" is already used by another playbook.`); return; }
    setDefPbNameError(null);
    if (edits.entries.length === 0) { setPbError('Add at least one play before saving.'); return; }
    setPbSaving(true); setPbError(null);
    try {
      const updated = await saveDefensePlaybookApi(leagueId, { id, name: edits.name.trim(), entries: edits.entries });
      onLeagueUpdated(updated);
      setDefPbEdits(prev => { const n = { ...prev }; delete n[id]; return n; });
      setEditingDefPbId(null);
      showToast('Defensive playbook saved');
    } catch (e) { setPbError(friendlyError(e)); }
    finally { setPbSaving(false); }
  }

  async function handleDeleteDefPlaybook(id: string) {
    if (deletingPbId) return;
    setDeletingPbId(id); setPbError(null);
    try {
      const updated = await deleteDefensePlaybookApi(leagueId, id);
      onLeagueUpdated(updated);
      setDefPbEdits(prev => { const n = { ...prev }; delete n[id]; return n; });
      if (editingDefPbId === id) setEditingDefPbId(null);
      showToast('Defensive playbook deleted');
    } catch (e) { setPbError(friendlyError(e)); }
    finally { setDeletingPbId(null); }
  }

  function updateDefPbEntry(pbId: string, playId: string, weight: number) {
    setDefPbEdits(prev => ({
      ...prev,
      [pbId]: { ...prev[pbId]!, entries: prev[pbId]!.entries.map(e => e.playId === playId ? { playId, weight } : e) },
    }));
  }
  function removeDefPbEntry(pbId: string, playId: string) {
    setDefPbEdits(prev => ({
      ...prev,
      [pbId]: { ...prev[pbId]!, entries: prev[pbId]!.entries.filter(e => e.playId !== playId) },
    }));
  }
  function addDefPbEntry(pbId: string, playId: string) {
    setDefPbEdits(prev => ({
      ...prev,
      [pbId]: { ...prev[pbId]!, entries: [...prev[pbId]!.entries, { playId, weight: 10 }] },
    }));
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) return <div className="pb-loading">Loading playbook data…</div>;
  if (loadErr)  return (
    <div className="pb-load-error">
      <p>{loadErr}</p>
      <button className="btn-secondary" onClick={() => window.location.reload()}>Retry</button>
    </div>
  );

  return (
    <div className="pb-view">
      {toast && <div className="pb-toast pb-toast--ok">{toast}</div>}

      {/* ── Side toggle ───────────────────────────────────────────────── */}
      <div className="pb-side-toggle">
        <button
          className={`pb-side-btn${playbookSide === 'offense' ? ' active' : ''}`}
          onClick={() => setPlaybookSide('offense')}
        >
          Offense
        </button>
        <button
          className={`pb-side-btn${playbookSide === 'defense' ? ' active' : ''}`}
          onClick={() => setPlaybookSide('defense')}
        >
          Defense
        </button>
      </div>

      {/* ── Gameplan ────────────────────────────────────────────────────── */}
      <div className="td-section">
        <button className="td-toggle" onClick={() => setShowTendencies(v => !v)}>
          <span className="td-toggle-icon">{showTendencies ? '▾' : '▸'}</span>
          Gameplan
          {tendenciesHaveChanges && <span className="td-unsaved">unsaved</span>}
          <span className="td-profile-badge">
            {COACH_ARCHETYPES.find(a =>
              (Object.keys(a.tendencies) as (keyof TeamTendencies)[]).every(
                k => a.tendencies[k] === mergedTendencies[k],
              ),
            )?.name ?? 'Custom'}
          </span>
        </button>
        {showTendencies && (
          <div className="td-panel">
            {/* Recommendation */}
            {(() => {
              const rec = generateGameplanRecommendation(team, leagueObj);
              if (!rec) return null;
              const arch = COACH_ARCHETYPES.find(a => a.id === rec.presetId);
              if (!arch) return null;
              return (
                <div className="td-rec">
                  <div className="td-rec-header">
                    <span className="td-rec-label">Recommended</span>
                    <span className="td-rec-name">{rec.presetName}</span>
                    <button className="td-rec-apply" onClick={() => setTendencyEdits(arch.tendencies)}>Apply</button>
                  </div>
                  <div className="td-rec-reasons">
                    {rec.reasons.map((r, i) => (
                      <span key={i} className="td-rec-reason">{r}</span>
                    ))}
                  </div>
                </div>
              );
            })()}

            {(() => {
              const activeId = COACH_ARCHETYPES.find(a =>
                (Object.keys(a.tendencies) as (keyof TeamTendencies)[]).every(
                  k => a.tendencies[k] === mergedTendencies[k],
                ),
              )?.id ?? '';
              const activeDesc = COACH_ARCHETYPES.find(a => a.id === activeId)?.description
                ?? 'Fine-tune each slider to build your own scheme.';
              return (
                <div className="td-presets">
                  <div className="td-presets-row">
                    {COACH_ARCHETYPES.map(a => (
                      <button
                        key={a.id}
                        className={`td-preset-btn${activeId === a.id ? ' active' : ''}`}
                        onClick={() => setTendencyEdits(a.tendencies)}
                        title={a.description}
                      >
                        {a.name}
                      </button>
                    ))}
                  </div>
                  <p className="td-presets-desc">{activeDesc}</p>
                </div>
              );
            })()}
            <div className="td-group">
              <h4 className="td-group-title">Offensive Philosophy</h4>
              {([
                ['runPassBias',    'Run / Pass Balance', 'Run-heavy', 'Pass-heavy', 'Controls how often your offense runs vs passes. Affects play selection weights in playbooks.'],
                ['aggressiveness', 'Aggressiveness',     'Conservative', 'Aggressive', 'How often you target deep plays. Conservative favors short routes; aggressive pushes the ball downfield.'],
                ['playActionRate', 'Play-Action Rate',   'Rare',    'Frequent', 'How often play-action fakes are called. More effective with a credible run game.'],
                ['shotPlayRate',   'Shot Play Rate',     'Rare',    'Frequent', 'Frequency of deep bomb attempts. Stacks with aggressiveness for maximum vertical attack.'],
              ] as const).map(([key, label, lo, hi, desc]) => (
                <div className="td-slider-block" key={key}>
                  <label className="td-slider-row">
                    <span className="td-slider-label">{label}</span>
                    <span className="td-slider-lo">{lo}</span>
                    <input
                      type="range" min={0} max={100}
                      value={mergedTendencies[key]}
                      onChange={e => setTendencyEdits(prev => ({ ...prev, [key]: +e.target.value }))}
                      className="td-slider"
                    />
                    <span className="td-slider-hi">{hi}</span>
                    <span className="td-slider-val">{mergedTendencies[key]}</span>
                  </label>
                  <p className="td-slider-desc">{desc}</p>
                </div>
              ))}
            </div>
            <div className="td-group">
              <h4 className="td-group-title">Defensive Philosophy</h4>
              {([
                ['blitzRate',          'Blitz Frequency',  'Rare',    'Frequent', 'How often extra rushers are sent. More blitzes create pressure but leave the secondary vulnerable.'],
                ['coverageAggression', 'Coverage Style',   'Soft zone', 'Press man', 'Passive zones give up short gains but limit big plays. Aggressive press coverage risks getting beaten deep.'],
                ['runCommitment',      'Run Focus',        'Light boxes', 'Stacked boxes', 'How many defenders commit to stopping the run. Heavy boxes stop the ground game but weaken pass defense.'],
              ] as const).map(([key, label, lo, hi, desc]) => (
                <div className="td-slider-block" key={key}>
                  <label className="td-slider-row">
                    <span className="td-slider-label">{label}</span>
                    <span className="td-slider-lo">{lo}</span>
                    <input
                      type="range" min={0} max={100}
                      value={mergedTendencies[key]}
                      onChange={e => setTendencyEdits(prev => ({ ...prev, [key]: +e.target.value }))}
                      className="td-slider"
                    />
                    <span className="td-slider-hi">{hi}</span>
                    <span className="td-slider-val">{mergedTendencies[key]}</span>
                  </label>
                  <p className="td-slider-desc">{desc}</p>
                </div>
              ))}
            </div>
            {tendencyError && <div className="pb-error">{tendencyError}</div>}
            <div className="td-actions">
              <button
                className="btn-primary"
                disabled={!tendenciesHaveChanges || tendencySaving}
                onClick={saveTendencies}
              >
                {tendencySaving ? 'Saving…' : 'Save Gameplan'}
              </button>
              {tendenciesHaveChanges && (
                <button className="btn-secondary" onClick={() => setTendencyEdits({})}>Reset</button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ════════════════ OFFENSE ════════════════════════════════════════ */}
      {playbookSide === 'offense' && <>

      {/* ── Config Summary ────────────────────────────────────────────── */}
      <div className="pb-summary-bar">
        <div className="pb-summary-stat">
          <span className="pb-summary-val">{formationsConfigured}</span>
          <span className="pb-summary-label">/ {formations.length} formations configured</span>
        </div>
        <div className="pb-summary-divider" />
        <div className="pb-summary-stat">
          <span className="pb-summary-val">{bucketsAssigned}</span>
          <span className="pb-summary-label">/ {ALL_BUCKETS.length} buckets assigned</span>
        </div>
        {warnings.length > 0 && (
          <>
            <div className="pb-summary-divider" />
            <div className="pb-summary-warnings">
              {warnings.map((w, i) => (
                <span key={i} className="pb-summary-warn">⚠ {w}</span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Formation Depth Charts ────────────────────────────────────── */}
      <section className="pb-section">
        <div className="pb-section-header">
          <div>
            <h2 className="pb-section-title">Formation Depth Charts</h2>
            <p className="pb-section-desc">
              Assign players to slots in each formation. The play chosen each snap determines which formation is active — the engine places these players at the correct WR / TE / RB indices automatically.
            </p>
          </div>
          <div className="pb-section-actions">
            {slotsHaveChanges && (
              <button className="btn-ghost pb-revert-btn" onClick={handleRevertSlots} disabled={slotsSaving}>
                Revert
              </button>
            )}
            <button
              className="btn-primary pb-save-btn"
              onClick={handleSaveSlots}
              disabled={slotsSaving || !slotsHaveChanges}
            >
              {slotsSaving ? 'Saving…' : 'Save Formation'}
            </button>
          </div>
        </div>
        {slotsError && <div className="pb-inline-error">{slotsError}</div>}

        <div className="pb-formation-tabs">
          {formations.map(f => {
            const fSaved  = team.formationDepthCharts?.[f.id] ?? {};
            const fLocal  = localSlotEdits[f.id] ?? {};
            const fDirty  = f.slots.some(s => (fLocal[s] !== undefined) && (fLocal[s] ?? null) !== (fSaved[s] ?? null));
            const fAssigned = f.slots.filter(s => (fSaved[s] ?? null) !== null).length;
            return (
              <button
                key={f.id}
                className={`pb-formation-tab${f.id === activeFormationId ? ' active' : ''}`}
                onClick={() => setActiveFormationId(f.id)}
              >
                <span className="pb-formation-tab-name">{f.name}</span>
                <span className="pb-personnel-badge">{f.personnel}</span>
                {fDirty && <span className="pb-dirty-dot" title="Unsaved changes" />}
                <span className="pb-slot-count-badge">{fAssigned}/{f.slots.length}</span>
              </button>
            );
          })}
        </div>

        {activeFormation && (
          <>
            {slotsHaveChanges && (
              <div className="pb-unsaved-notice">Unsaved changes — click Save Formation to apply.</div>
            )}
            <div className="pb-slot-grid">
              {activeFormation.slots.map(slot => {
                const assignedId  = mergedSlots[slot] ?? null;
                const savedId     = savedSlots[slot] ?? null;
                const isChanged   = assignedId !== savedId;
                const candidates  = eligiblePlayers(team, slot);
                const assigned    = team.roster.find(p => p.id === assignedId);

                return (
                  <div key={slot} className={`pb-slot-card${isChanged ? ' pb-slot-card--changed' : ''}`}>
                    <div className="pb-slot-label">{SLOT_LABELS[slot]}</div>
                    {assigned
                      ? (
                        <div className="pb-slot-current">
                          {assigned.name}
                          <span className="pb-slot-pos">{assigned.position}</span>
                          {assigned.scoutedOverall && (
                            <span className="pb-slot-ovr">{assigned.scoutedOverall}</span>
                          )}
                        </div>
                      )
                      : <div className="pb-slot-empty">Unassigned</div>
                    }
                    <select
                      className="pb-slot-select"
                      value={assignedId ?? ''}
                      disabled={slotsSaving}
                      onChange={e => handleLocalSlotChange(slot, e.target.value || null)}
                    >
                      <option value="">— Unassigned —</option>
                      {candidates.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.position}{p.scoutedOverall ? ` · ${p.scoutedOverall}` : ''})
                        </option>
                      ))}
                    </select>
                    {isChanged && (
                      <span className="pb-slot-changed-label">
                        {savedId
                          ? `was: ${team.roster.find(p => p.id === savedId)?.name ?? 'Unknown'}`
                          : 'was: unassigned'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* ── Offensive Plan ────────────────────────────────────────────── */}
      <section className="pb-section">
        <div className="pb-section-header">
          <div>
            <h2 className="pb-section-title">Offensive Plan</h2>
            <p className="pb-section-desc">
              Assign a playbook to each down &amp; distance situation. On every snap the engine picks a play from whichever playbook is assigned to the current situation.
            </p>
          </div>
          <div className="pb-section-actions">
            {planHasChanges && (
              <button className="btn-ghost pb-revert-btn" onClick={handleRevertPlan} disabled={planSaving}>
                Revert
              </button>
            )}
            <button
              className="btn-primary pb-save-btn"
              onClick={handleSavePlan}
              disabled={planSaving || !planHasChanges}
            >
              {planSaving ? 'Saving…' : 'Save Plan'}
            </button>
          </div>
        </div>
        {planError && <div className="pb-inline-error">{planError}</div>}
        {planHasChanges && (
          <div className="pb-unsaved-notice">Unsaved changes — click Save Plan to apply.</div>
        )}

        <div className="pb-plan-grid">
          {(['FIRST', 'SECOND', 'THIRD', 'FOURTH'] as const).map(down => {
            const buckets = ALL_BUCKETS.filter(b => b.startsWith(down));
            const downLabel = down.charAt(0) + down.slice(1).toLowerCase();
            return (
              <div key={down} className="pb-plan-down-group">
                <div className="pb-plan-down-header">{downLabel} Down</div>
                {buckets.map(bucket => {
                  const currentId  = mergedPlan[bucket] ?? '';
                  const savedId    = savedPlan[bucket] ?? '';
                  const isChanged  = currentId !== savedId;
                  const activePb   = playbooks.find(pb => pb.id === currentId)
                                  ?? (team.customOffensivePlaybooks ?? []).find(pb => pb.id === currentId);
                  return (
                    <div key={bucket} className={`pb-plan-row${isChanged ? ' pb-plan-row--changed' : ''}`}>
                      <span className="pb-plan-bucket-label">{BUCKET_LABELS[bucket]}</span>
                      <div className="pb-plan-select-wrap">
                        <select
                          className="pb-plan-select"
                          value={currentId}
                          disabled={planSaving}
                          onChange={e => handleLocalPlanChange(bucket, e.target.value)}
                        >
                          <option value="">— Default —</option>
                          {playbooks.map(pb => (
                            <option key={pb.id} value={pb.id}>{pb.name}</option>
                          ))}
                          {(team.customOffensivePlaybooks ?? []).length > 0 && (
                            <optgroup label="Custom">
                              {(team.customOffensivePlaybooks ?? []).map(pb => (
                                <option key={pb.id} value={pb.id}>{pb.name}</option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                        {activePb && (
                          <span className="pb-plan-play-count">{activePb.entries.length} plays</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Custom Plays ────────────────────────────────────────────── */}
      <section className="pb-section">
        <div className="pb-section-header">
          <div>
            <h2 className="pb-section-title">Custom Plays</h2>
            <p className="pb-section-desc">
              Create custom offensive plays with route assignments. Add them to your playbooks to use in games.
            </p>
          </div>
          <div className="pb-section-actions">
            <button className="btn-primary" onClick={() => openPlayCreator()}>+ Create Play</button>
          </div>
        </div>

        {(team.customOffensivePlays ?? []).length > 0 && (
          <div className="cp-list">
            {(team.customOffensivePlays ?? []).map(p => {
              const fm = formations.find(f => f.id === p.formationId);
              return (
                <div key={p.id} className="cp-card">
                  <div className="cp-card-header">
                    <span className="cp-card-name">{p.name}</span>
                    <span className="cp-card-type">{p.engineType.replace('_', ' ')}</span>
                  </div>
                  <div className="cp-card-meta">
                    <span>{fm?.name ?? p.formationId}</span>
                    {p.isPlayAction && <span className="cp-badge-pa">PA</span>}
                    {p.routes && <span>{p.routes.length} routes</span>}
                  </div>
                  {p.routes && (
                    <div className="cp-card-routes">
                      {p.routes.map(r => (
                        <span key={r.slot} className={`cp-route-tag cp-route-${r.routeTag.toLowerCase()}`}>
                          {r.slot}: {r.routeTag}
                        </span>
                      ))}
                    </div>
                  )}
                  {(() => {
                    const ps = team.playStats?.[p.id];
                    return ps && ps.calls > 0 ? (
                      <div className="cp-card-stats">
                        <span>{ps.calls} calls</span>
                        <span>{(ps.totalYards / ps.calls).toFixed(1)} avg</span>
                        <span>{((ps.successes / ps.calls) * 100).toFixed(0)}% success</span>
                        {ps.touchdowns > 0 && <span className="cp-stat-td">{ps.touchdowns} TD</span>}
                        {ps.turnovers > 0 && <span className="cp-stat-to">{ps.turnovers} TO</span>}
                      </div>
                    ) : null;
                  })()}
                  <div className="cp-card-actions">
                    <button className="btn-sm" onClick={() => openPlayCreator(p)}>Edit</button>
                    <button className="btn-sm btn-danger" disabled={cpDeleting === p.id} onClick={() => handleDeleteCustomPlay(p.id)}>
                      {cpDeleting === p.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {(team.customOffensivePlays ?? []).length === 0 && !showPlayCreator && (
          <p className="muted" style={{ padding: '0.5rem 0' }}>No custom plays yet. Create one to get started.</p>
        )}

        {showPlayCreator && (
          <div className="cp-creator">
            <h3 className="cp-creator-title">{cpEditId ? 'Edit Play' : 'New Custom Play'}</h3>
            <div className="cp-form-row">
              <label className="cp-label">Name</label>
              <input className="cp-input" value={cpName} onChange={e => setCpName(e.target.value)} placeholder="e.g. Smash Deep" maxLength={60} />
            </div>
            <div className="cp-form-row">
              <label className="cp-label">Formation</label>
              <select className="cp-select" value={cpFormation} onChange={e => { setCpFormation(e.target.value); setCpRoutes({}); }}>
                {formations.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div className="cp-form-row">
              <label className="cp-label">Play Type</label>
              <select className="cp-select" value={cpEngine} onChange={e => setCpEngine(e.target.value)}>
                <option value="short_pass">Short Pass</option>
                <option value="medium_pass">Medium Pass</option>
                <option value="deep_pass">Deep Pass</option>
                <option value="inside_run">Inside Run</option>
                <option value="outside_run">Outside Run</option>
              </select>
            </div>
            <div className="cp-form-row">
              <label className="cp-label cp-checkbox-label">
                <input type="checkbox" checked={cpPlayAction} onChange={e => setCpPlayAction(e.target.checked)} />
                Play Action
              </label>
            </div>

            {!cpIsRun && cpFormationObj && (
              <div className="cp-routes-editor">
                <label className="cp-label">Routes</label>
                {cpFormationObj.slots.map(slot => (
                  <div key={slot} className="cp-route-row">
                    <span className="cp-route-slot">{slot}</span>
                    <select
                      className="cp-select cp-select-sm"
                      value={cpRoutes[slot]?.depth ?? ''}
                      onChange={e => {
                        const val = e.target.value as RouteTag | '';
                        setCpRoutes(prev => {
                          if (!val) { const n = { ...prev }; delete n[slot]; return n; }
                          return { ...prev, [slot]: { route: val, depth: val } };
                        });
                      }}
                    >
                      <option value="">— none —</option>
                      <option value="SHORT">SHORT</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="DEEP">DEEP</option>
                    </select>
                    {cpRoutes[slot] && (
                      <span className={`cp-route-tag cp-route-${cpRoutes[slot]!.depth.toLowerCase()}`}>{cpRoutes[slot]!.depth}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {cpIsRun && cpFormationObj && (
              <div className="cp-form-row">
                <label className="cp-label">Ball Carrier</label>
                <select className="cp-select" value={cpBallCarrier} onChange={e => setCpBallCarrier(e.target.value)}>
                  {cpFormationObj.slots.filter(s => s === 'RB' || s === 'FB').map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}

            {cpError && <div className="pb-error">{cpError}</div>}
            <div className="cp-form-actions">
              <button className="btn-primary" disabled={cpSaving} onClick={handleSaveCustomPlay}>
                {cpSaving ? 'Saving…' : cpEditId ? 'Update Play' : 'Create Play'}
              </button>
              <button className="btn-secondary" onClick={() => { setShowPlayCreator(false); resetPlayCreator(); }}>Cancel</button>
            </div>
          </div>
        )}
      </section>

      {/* ── Play Analytics ─────────────────────────────────────────── */}
      <section className="pb-section">
        <div className="pb-section-header">
          <div>
            <h2 className="pb-section-title">Play Analytics</h2>
            <p className="pb-section-desc">Season performance data for all plays in your playbooks.</p>
          </div>
          <div className="pb-section-actions">
            <button className={`btn-sm${showAnalytics ? ' active' : ''}`} onClick={() => setShowAnalytics(v => !v)}>
              {showAnalytics ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        {showAnalytics && (() => {
          const ps = team.playStats ?? {};
          const bs = team.bucketStats ?? {};
          const allPlaysWithCustom = [...allPlays, ...(team.customOffensivePlays ?? [])];
          const playMap = new Map(allPlaysWithCustom.map(p => [p.id, p]));

          // Choose data source based on view mode
          const isSituational = analyticView === 'situational';
          const statsSource: Record<string, PlayEffStats> = {};
          if (isSituational) {
            for (const [playId, buckets] of Object.entries(bs)) {
              const s = buckets[analyticBucket];
              if (s) statsSource[playId] = s;
            }
          } else {
            Object.assign(statsSource, ps);
          }

          // Build analytics rows
          type AnalyticsRow = { id: string; name: string; formation: string; engineType: string; isRun: boolean; calls: number; avg: number; successPct: number; tdPct: number; toPct: number; insight: string | null; overallAvg: number | null; overallSuccessPct: number | null };
          const rows: AnalyticsRow[] = [];
          for (const [id, stats] of Object.entries(statsSource)) {
            if (stats.calls < 1) continue;
            const play = playMap.get(id);
            if (!play) continue;
            const isRun = play.engineType === 'inside_run' || play.engineType === 'outside_run';
            if (analyticFilter === 'run' && !isRun) continue;
            if (analyticFilter === 'pass' && isRun) continue;
            const avg = stats.totalYards / stats.calls;
            const successPct = stats.successes / stats.calls;
            const tdPct = stats.touchdowns / stats.calls;
            const toPct = stats.turnovers / stats.calls;
            const fm = formations.find(f => f.id === play.formationId);

            // Overall stats for comparison (only in situational view)
            const overall = isSituational ? ps[id] : null;
            const overallAvg = overall && overall.calls >= 3 ? overall.totalYards / overall.calls : null;
            const overallSuccessPct = overall && overall.calls >= 3 ? overall.successes / overall.calls : null;

            // Insight generation
            let insight: string | null = null;
            if (isSituational && stats.calls >= 3) {
              // Situational insights — compare to overall
              if (overallAvg !== null && avg >= overallAvg + 2.0 && stats.calls >= 3) insight = 'Situational strength';
              else if (overallAvg !== null && avg <= overallAvg - 2.0 && stats.calls >= 3) insight = 'Situational weakness';
              else if (toPct >= 0.2 && stats.calls >= 3) insight = 'High TO risk here';
              else if (tdPct >= 0.2 && stats.calls >= 3) insight = 'Scores here';
              else if (successPct >= 0.75 && stats.calls >= 3) insight = 'Very reliable here';
            } else if (stats.calls >= 5) {
              if (avg >= 7.0 && successPct >= 0.6) insight = 'Top performer';
              else if (avg < 2.5 && stats.calls >= 8) insight = 'Underperforming';
              else if (toPct >= 0.15 && stats.calls >= 5) insight = 'Turnover risk';
              else if (tdPct >= 0.15 && stats.calls >= 5) insight = 'Red zone weapon';
              else if (successPct >= 0.7 && stats.calls >= 5) insight = 'Reliable';
            }

            rows.push({
              id, name: play.name, formation: fm?.name ?? play.formationId,
              engineType: play.engineType, isRun, calls: stats.calls,
              avg, successPct, tdPct, toPct, insight,
              overallAvg, overallSuccessPct,
            });
          }

          // Sort
          rows.sort((a, b) => {
            switch (analyticSort) {
              case 'avg': return b.avg - a.avg;
              case 'success': return b.successPct - a.successPct;
              case 'td': return b.tdPct - a.tdPct;
              case 'to': return a.toPct - b.toPct; // lower is better
              default: return b.calls - a.calls;
            }
          });

          // Situational summary bar
          const sitSummary = isSituational && rows.length > 0 ? (() => {
            const totalCalls = rows.reduce((s, r) => s + r.calls, 0);
            const totalYards = rows.reduce((s, r) => s + r.avg * r.calls, 0);
            const totalSucc  = rows.reduce((s, r) => s + r.successPct * r.calls, 0);
            return { calls: totalCalls, avg: totalCalls > 0 ? totalYards / totalCalls : 0, successPct: totalCalls > 0 ? totalSucc / totalCalls : 0 };
          })() : null;

          // Bucket groups for selector
          const bucketGroups: { label: string; buckets: DownDistanceBucket[] }[] = [
            { label: '1st Down', buckets: ['FIRST_10', 'FIRST_LONG', 'FIRST_MEDIUM', 'FIRST_SHORT'] },
            { label: '2nd Down', buckets: ['SECOND_LONG', 'SECOND_MEDIUM', 'SECOND_SHORT'] },
            { label: '3rd Down', buckets: ['THIRD_LONG', 'THIRD_MEDIUM', 'THIRD_SHORT'] },
            { label: '4th Down', buckets: ['FOURTH_LONG', 'FOURTH_MEDIUM', 'FOURTH_SHORT'] },
          ];

          if (rows.length === 0 && !isSituational) return <p className="muted" style={{ padding: '0.5rem 0' }}>No play data yet. Play some games to see analytics.</p>;

          return (
            <div className="pa-container">
              {/* View mode toggle + filters */}
              <div className="pa-controls">
                <div className="pa-filters">
                  <div className="pa-view-toggle">
                    <button className={`btn-sm${analyticView === 'overall' ? ' active' : ''}`} onClick={() => setAnalyticView('overall')}>Overall</button>
                    <button className={`btn-sm${analyticView === 'situational' ? ' active' : ''}`} onClick={() => setAnalyticView('situational')}>Situational</button>
                  </div>
                  <span className="pa-divider" />
                  {(['all', 'run', 'pass'] as const).map(f => (
                    <button key={f} className={`btn-sm${analyticFilter === f ? ' active' : ''}`} onClick={() => setAnalyticFilter(f)}>
                      {f === 'all' ? 'All' : f === 'run' ? 'Run' : 'Pass'}
                    </button>
                  ))}
                </div>
                <span className="pa-count">{rows.length} plays tracked</span>
              </div>

              {/* Bucket selector (situational mode only) */}
              {isSituational && (
                <div className="pa-bucket-selector">
                  {bucketGroups.map(g => (
                    <div key={g.label} className="pa-bucket-group">
                      <span className="pa-bucket-group-label">{g.label}</span>
                      <div className="pa-bucket-pills">
                        {g.buckets.map(b => {
                          // Show call count badge from bucket data
                          let bucketCalls = 0;
                          for (const playBuckets of Object.values(bs)) {
                            bucketCalls += playBuckets[b]?.calls ?? 0;
                          }
                          return (
                            <button
                              key={b}
                              className={`pa-bucket-pill${analyticBucket === b ? ' active' : ''}${bucketCalls === 0 ? ' empty' : ''}`}
                              onClick={() => setAnalyticBucket(b)}
                            >
                              {BUCKET_LABELS[b].replace(/\s*\(.*\)/, '')}
                              {bucketCalls > 0 && <span className="pa-bucket-count">{bucketCalls}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Situational summary */}
              {sitSummary && sitSummary.calls > 0 && (
                <div className="pa-sit-summary">
                  <span className="pa-sit-summary-label">{BUCKET_LABELS[analyticBucket]}</span>
                  <span className="pa-sit-summary-stat">{sitSummary.calls} calls</span>
                  <span className="pa-sit-summary-stat">{sitSummary.avg.toFixed(1)} avg yds</span>
                  <span className="pa-sit-summary-stat">{(sitSummary.successPct * 100).toFixed(0)}% success</span>
                </div>
              )}

              {rows.length === 0 ? (
                <p className="muted" style={{ padding: '0.5rem 0' }}>No data for {BUCKET_LABELS[analyticBucket]}. This situation hasn't occurred enough yet.</p>
              ) : (
                <table className="pa-table">
                  <thead>
                    <tr>
                      <th>Play</th>
                      <th>Formation</th>
                      <th>Type</th>
                      <th className="pa-sortable" onClick={() => setAnalyticSort('calls')}>Calls{analyticSort === 'calls' ? ' ▼' : ''}</th>
                      <th className="pa-sortable" onClick={() => setAnalyticSort('avg')}>Avg Yds{analyticSort === 'avg' ? ' ▼' : ''}</th>
                      <th className="pa-sortable" onClick={() => setAnalyticSort('success')}>Success%{analyticSort === 'success' ? ' ▼' : ''}</th>
                      <th className="pa-sortable" onClick={() => setAnalyticSort('td')}>TD%{analyticSort === 'td' ? ' ▼' : ''}</th>
                      <th className="pa-sortable" onClick={() => setAnalyticSort('to')}>TO%{analyticSort === 'to' ? ' ▲' : ''}</th>
                      <th>Insight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const avgCls = r.calls >= 3 ? (r.avg >= 6.0 ? 'pa-good' : r.avg < 3.0 ? 'pa-bad' : '') : '';
                      const sucCls = r.calls >= 3 ? (r.successPct >= 0.6 ? 'pa-good' : r.successPct < 0.35 ? 'pa-bad' : '') : '';
                      // Delta indicators for situational view
                      const avgDelta = isSituational && r.overallAvg !== null ? r.avg - r.overallAvg : null;
                      const sucDelta = isSituational && r.overallSuccessPct !== null ? r.successPct - r.overallSuccessPct : null;
                      return (
                        <tr key={r.id} className={r.isRun ? 'pb-row-run' : 'pb-row-pass'}>
                          <td><span className="pb-play-name">{r.name}</span></td>
                          <td className="pb-play-formation">{r.formation}</td>
                          <td><span className={`pb-type-chip pb-type-chip--${r.isRun ? 'run' : 'pass'}`}>{ENGINE_TYPE_LABELS[r.engineType] ?? r.engineType}</span></td>
                          <td className="pa-num">{r.calls}</td>
                          <td className={`pa-num ${avgCls}`}>
                            {r.avg.toFixed(1)}
                            {avgDelta !== null && Math.abs(avgDelta) >= 0.5 && (
                              <span className={`pa-delta ${avgDelta > 0 ? 'pa-delta--up' : 'pa-delta--down'}`}>
                                {avgDelta > 0 ? '+' : ''}{avgDelta.toFixed(1)}
                              </span>
                            )}
                          </td>
                          <td className={`pa-num ${sucCls}`}>
                            {(r.successPct * 100).toFixed(0)}%
                            {sucDelta !== null && Math.abs(sucDelta) >= 0.05 && (
                              <span className={`pa-delta ${sucDelta > 0 ? 'pa-delta--up' : 'pa-delta--down'}`}>
                                {sucDelta > 0 ? '+' : ''}{(sucDelta * 100).toFixed(0)}
                              </span>
                            )}
                          </td>
                          <td className="pa-num">{r.calls >= 3 ? `${(r.tdPct * 100).toFixed(0)}%` : '—'}</td>
                          <td className="pa-num">{r.calls >= 3 ? `${(r.toPct * 100).toFixed(0)}%` : '—'}</td>
                          <td>{r.insight ? <span className={`pa-insight pa-insight--${r.insight === 'Top performer' || r.insight === 'Red zone weapon' || r.insight === 'Reliable' || r.insight === 'Situational strength' || r.insight === 'Very reliable here' || r.insight === 'Scores here' ? 'good' : 'bad'}`}>{r.insight}</span> : ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          );
        })()}
      </section>

      {/* ── Playbook Library ────────��─────────────────────────────────── */}
      <section className="pb-section">
        <div className="pb-section-header">
          <div>
            <h2 className="pb-section-title">Playbook Library</h2>
            <p className="pb-section-desc">
              Built-in playbooks are read-only. Create custom playbooks to mix your own play selection.
            </p>
          </div>
          <div className="pb-section-actions">
            <button className="btn-primary" onClick={handleCreateOffPlaybook}>+ Create Playbook</button>
          </div>
        </div>
        <div className="pb-library">
          {/* Built-in playbooks */}
          {playbooks.length > 0 && (
            <div className="pb-library-group-label">Built-in</div>
          )}
          {playbooks.map(pb => {
            const isOpen    = expandedBooks.has(pb.id);
            const runCount  = pb.entries.filter(e => { const p = playById.get(e.playId); return p?.engineType === 'inside_run' || p?.engineType === 'outside_run'; }).length;
            const passCount = pb.entries.length - runCount;
            return (
              <div key={pb.id} className="pb-book">
                <button className="pb-book-header" onClick={() => toggleBook(pb.id)}>
                  <span className="pb-book-name">{pb.name}</span>
                  <span className="pb-book-meta">
                    <span className="pb-book-chip pb-book-chip--pass">{passCount} pass</span>
                    <span className="pb-book-chip pb-book-chip--run">{runCount} run</span>
                  </span>
                  {pb.entries.length <= 2 && <span className="pb-book-thin-warn">thin</span>}
                  <span className="pb-book-chip pb-book-chip--builtin">built-in</span>
                  <button className="pb-book-action" onClick={e => { e.stopPropagation(); handleDuplicateOffPlaybook(pb); }}>Duplicate</button>
                  <span className="pb-book-chevron">{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (
                  <div className="pb-book-entries">
                    <table className="pb-plays-table">
                      <thead><tr><th>Play</th><th>Formation</th><th>Type</th><th>Wt</th><th>Stats</th><th>Routes / Carrier</th></tr></thead>
                      <tbody>
                        {pb.entries.map(entry => {
                          const play = playById.get(entry.playId);
                          const formation = play ? formations.find(f => f.id === play.formationId) : null;
                          const isRun = play?.engineType === 'inside_run' || play?.engineType === 'outside_run';
                          const routeInfo = play?.routes?.length ? play.routes.map(r => `${r.slot} ${r.routeTag.toLowerCase()}`).join(', ') : play?.ballCarrierSlot ? `${play.ballCarrierSlot} carries` : '—';
                          const ps = team.playStats?.[entry.playId];
                          return (
                            <tr key={entry.playId} className={isRun ? 'pb-row-run' : 'pb-row-pass'}>
                              <td><span className="pb-play-name">{play?.name ?? entry.playId}</span>{play?.isPlayAction && <span className="pb-pa-badge">PA</span>}</td>
                              <td className="pb-play-formation">{formation ? <>{formation.name}<span className="pb-personnel-badge pb-personnel-badge--sm">{formation.personnel}</span></> : '—'}</td>
                              <td><span className={`pb-type-chip pb-type-chip--${isRun ? 'run' : 'pass'}`}>{ENGINE_TYPE_LABELS[play?.engineType ?? ''] ?? '—'}</span></td>
                              <td className="pb-play-weight">{entry.weight}</td>
                              <td className="pb-play-stats">{ps && ps.calls > 0 ? `${(ps.totalYards / ps.calls).toFixed(1)} avg · ${((ps.successes / ps.calls) * 100).toFixed(0)}%` : '—'}</td>
                              <td className="pb-play-routes">{routeInfo}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {/* Custom playbooks */}
          <div className="pb-library-group-label pb-library-group-label--custom">Custom</div>
          {allCustomOffPbs.length === 0 && (
            <div className="pb-library-empty">No custom playbooks yet. Hit <strong>+ Create Playbook</strong> to build one.</div>
          )}
          {allCustomOffPbs.map(pb => {
            const isOpen    = expandedBooks.has(pb.id);
            const isEditing = editingOffPbId === pb.id;
            const edits     = offPbEdits[pb.id];
            const isSavedOnServer = (team.customOffensivePlaybooks ?? []).some(s => s.id === pb.id);
            const isDirty   = !!edits;
            const runCount  = pb.entries.filter(e => { const p = playById.get(e.playId); return p?.engineType === 'inside_run' || p?.engineType === 'outside_run'; }).length;
            const passCount = pb.entries.length - runCount;
            return (
              <div key={pb.id} className={`pb-book pb-book--custom${isDirty ? ' pb-book--dirty' : ''}`}>
                <button className="pb-book-header" onClick={() => isEditing ? setEditingOffPbId(null) : (isSavedOnServer ? handleEditOffPlaybook(pb) : setEditingOffPbId(pb.id))}>
                  <span className="pb-book-name">{edits?.name ?? pb.name}</span>
                  <span className="pb-book-meta">
                    <span className="pb-book-chip pb-book-chip--pass">{passCount} pass</span>
                    <span className="pb-book-chip pb-book-chip--run">{runCount} run</span>
                  </span>
                  {!isSavedOnServer && <span className="pb-book-chip pb-book-chip--unsaved">unsaved</span>}
                  {isDirty && isSavedOnServer && <span className="pb-book-chip pb-book-chip--unsaved">edited</span>}
                  {!isEditing && <button className="pb-book-action" onClick={e => { e.stopPropagation(); isSavedOnServer ? handleEditOffPlaybook(pb) : setEditingOffPbId(pb.id); }}>Edit</button>}
                  {isSavedOnServer && !isEditing && (
                    <button
                      className="pb-book-action pb-book-action--danger"
                      disabled={!!deletingPbId}
                      onClick={e => { e.stopPropagation(); if (window.confirm(`Delete "${pb.name}"? This cannot be undone.`)) handleDeleteOffPlaybook(pb.id); }}
                    >
                      {deletingPbId === pb.id ? '…' : 'Delete'}
                    </button>
                  )}
                  <span className="pb-book-chevron">{isEditing ? '▲' : '▼'}</span>
                </button>

                {isEditing && edits && (() => {
                  const totalW    = edits.entries.reduce((s, e) => s + e.weight, 0);
                  const pbWarns   = getOffPbWarnings(edits.entries);
                  const allPlaysWithCustom = [...allPlays, ...(team.customOffensivePlays ?? [])];
                  const available = allPlaysWithCustom
                    .filter(p => !edits.entries.some(e => e.playId === p.id))
                    .filter(p => !offPlayFilter || p.name.toLowerCase().includes(offPlayFilter.toLowerCase()))
                    .sort((a, b) => {
                      const aRun = a.engineType === 'inside_run' || a.engineType === 'outside_run';
                      const bRun = b.engineType === 'inside_run' || b.engineType === 'outside_run';
                      if (aRun !== bRun) return aRun ? 1 : -1;
                      return a.name.localeCompare(b.name);
                    });
                  return (
                  <div className="pb-book-editor">
                    {/* Name */}
                    <div className="pb-editor-name-row">
                      <label className="pb-editor-label">Name</label>
                      <input
                        className={`pb-editor-name-input${offPbNameError ? ' pb-editor-name-input--error' : ''}`}
                        value={edits.name}
                        maxLength={60}
                        onChange={e => { setOffPbEdits(prev => ({ ...prev, [pb.id]: { ...prev[pb.id]!, name: e.target.value } })); setOffPbNameError(null); }}
                      />
                    </div>
                    {offPbNameError && <div className="pb-field-error">{offPbNameError}</div>}
                    {/* Quality warnings */}
                    {pbWarns.length > 0 && (
                      <div className="pb-quality-warnings">
                        {pbWarns.map((w, i) => <div key={i} className="pb-quality-warn">&#9888; {w}</div>)}
                      </div>
                    )}
                    {/* Entries */}
                    {edits.entries.length > 0 && (
                      <table className="pb-plays-table pb-editor-table">
                        <thead><tr><th>Play</th><th>Type</th><th>Weight</th><th>%</th><th></th></tr></thead>
                        <tbody>
                          {edits.entries.map(entry => {
                            const play = playById.get(entry.playId);
                            const isRun = play?.engineType === 'inside_run' || play?.engineType === 'outside_run';
                            const pct = totalW > 0 ? Math.round((entry.weight / totalW) * 100) : 0;
                            return (
                              <tr key={entry.playId} className={isRun ? 'pb-row-run' : 'pb-row-pass'}>
                                <td><span className="pb-play-name">{play?.name ?? entry.playId}</span></td>
                                <td><span className={`pb-type-chip pb-type-chip--${isRun ? 'run' : 'pass'}`}>{ENGINE_TYPE_LABELS[play?.engineType ?? ''] ?? '—'}</span></td>
                                <td>
                                  <input
                                    type="number" min={1} max={100}
                                    className="pb-editor-weight-input"
                                    value={entry.weight}
                                    onChange={e => updateOffPbEntry(pb.id, entry.playId, Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                                  />
                                </td>
                                <td className="pb-weight-pct">{pct}%</td>
                                <td>
                                  <button className="pb-editor-remove" onClick={() => removeOffPbEntry(pb.id, entry.playId)}>✕</button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                    {edits.entries.length === 0 && (
                      <p className="pb-editor-empty-hint">No plays yet — add plays from the browser below.</p>
                    )}
                    {/* Play browser */}
                    <div className="pb-play-browser">
                      <div className="pb-play-browser-header">
                        <span className="pb-play-browser-title">Add plays</span>
                        <input
                          className="pb-play-browser-filter"
                          placeholder="Search plays…"
                          value={offPlayFilter}
                          onChange={e => setOffPlayFilter(e.target.value)}
                        />
                      </div>
                      <div className="pb-play-browser-list">
                        {available.length === 0 && (
                          <div className="pb-browser-empty">
                            {offPlayFilter ? 'No plays match your search.' : 'All plays have been added.'}
                          </div>
                        )}
                        {available.map(p => {
                          const isRun = p.engineType === 'inside_run' || p.engineType === 'outside_run';
                          const fmt = formations.find(f => f.id === p.formationId);
                          return (
                            <div key={p.id} className="pb-play-browser-row">
                              <span className="pb-play-name">{p.name}</span>
                              {fmt && <span className="pb-personnel-badge pb-personnel-badge--sm">{fmt.name}</span>}
                              <span className={`pb-type-chip pb-type-chip--${isRun ? 'run' : 'pass'}`}>{ENGINE_TYPE_LABELS[p.engineType] ?? p.engineType}</span>
                              <button className="pb-play-browser-add" onClick={() => addOffPbEntry(pb.id, p.id)}>+ Add</button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {/* Editor actions */}
                    {pbError && <div className="pb-inline-error pb-inline-error--action">{pbError}</div>}
                    <div className="pb-editor-actions">
                      {isSavedOnServer && (
                        <button className="btn-ghost" onClick={() => handleRevertOffPlaybook(pb.id)} disabled={pbSaving}>Revert</button>
                      )}
                      <button className="btn-ghost" onClick={() => handleCancelOffPlaybook(pb.id)} disabled={pbSaving}>Cancel</button>
                      <button className="btn-primary" onClick={() => handleSaveOffPlaybook(pb.id)} disabled={pbSaving}>
                        {pbSaving ? 'Saving…' : 'Save Playbook'}
                      </button>
                    </div>
                  </div>
                  );
                })()}

                {!isEditing && isOpen && (
                  <div className="pb-book-entries">
                    <table className="pb-plays-table">
                      <thead><tr><th>Play</th><th>Formation</th><th>Type</th><th>Wt</th><th>Stats</th><th>Routes / Carrier</th></tr></thead>
                      <tbody>
                        {pb.entries.map(entry => {
                          const play = playById.get(entry.playId);
                          const formation = play ? formations.find(f => f.id === play.formationId) : null;
                          const isRun = play?.engineType === 'inside_run' || play?.engineType === 'outside_run';
                          const routeInfo = play?.routes?.length ? play.routes.map(r => `${r.slot} ${r.routeTag.toLowerCase()}`).join(', ') : play?.ballCarrierSlot ? `${play.ballCarrierSlot} carries` : '—';
                          const ps = team.playStats?.[entry.playId];
                          return (
                            <tr key={entry.playId} className={isRun ? 'pb-row-run' : 'pb-row-pass'}>
                              <td><span className="pb-play-name">{play?.name ?? entry.playId}</span>{play?.isPlayAction && <span className="pb-pa-badge">PA</span>}</td>
                              <td className="pb-play-formation">{formation ? <>{formation.name}<span className="pb-personnel-badge pb-personnel-badge--sm">{formation.personnel}</span></> : '—'}</td>
                              <td><span className={`pb-type-chip pb-type-chip--${isRun ? 'run' : 'pass'}`}>{ENGINE_TYPE_LABELS[play?.engineType ?? ''] ?? '—'}</span></td>
                              <td className="pb-play-weight">{entry.weight}</td>
                              <td className="pb-play-stats">{ps && ps.calls > 0 ? `${(ps.totalYards / ps.calls).toFixed(1)} avg · ${((ps.successes / ps.calls) * 100).toFixed(0)}%` : '—'}</td>
                              <td className="pb-play-routes">{routeInfo}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      </>} {/* end offense */}

      {/* ════════════════ DEFENSE ════════════════════════════════════════ */}
      {playbookSide === 'defense' && <>

      {/* ── Defensive Summary ─────────────────────────────────────────── */}
      <div className="pb-summary-bar">
        <div className="pb-summary-stat">
          <span className="pb-summary-val">{packagesConfigured}</span>
          <span className="pb-summary-label">/ {packages.length} packages configured</span>
        </div>
        <div className="pb-summary-divider" />
        <div className="pb-summary-stat">
          <span className="pb-summary-val">{defBucketsAssigned}</span>
          <span className="pb-summary-label">/ {ALL_BUCKETS.length} buckets assigned</span>
        </div>
        {defWarnings.length > 0 && (
          <>
            <div className="pb-summary-divider" />
            <div className="pb-summary-warnings">
              {defWarnings.map((w, i) => (
                <span key={i} className="pb-summary-warn">⚠ {w}</span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Package Depth Charts ──────────────────────────────────────── */}
      <section className="pb-section">
        <div className="pb-section-header">
          <div>
            <h2 className="pb-section-title">Package Depth Charts</h2>
            <p className="pb-section-desc">
              Assign players to slots in each defensive package. The play called each snap determines which package is active — the engine places these players at the correct DE / DT / LB / CB / S indices automatically.
            </p>
          </div>
          <div className="pb-section-actions">
            {pkgSlotsHaveChanges && (
              <button className="btn-ghost pb-revert-btn" onClick={handleRevertPkgSlots} disabled={pkgSlotsSaving}>
                Revert
              </button>
            )}
            <button
              className="btn-primary pb-save-btn"
              onClick={handleSavePkgSlots}
              disabled={pkgSlotsSaving || !pkgSlotsHaveChanges}
            >
              {pkgSlotsSaving ? 'Saving…' : 'Save Package'}
            </button>
          </div>
        </div>
        {pkgSlotsError && <div className="pb-inline-error">{pkgSlotsError}</div>}

        <div className="pb-formation-tabs">
          {packages.map(pkg => {
            const pSaved   = team.packageDepthCharts?.[pkg.id] ?? {};
            const pLocal   = localPkgSlotEdits[pkg.id] ?? {};
            const pDirty   = pkg.slots.some(s => (pLocal[s] !== undefined) && ((pLocal[s] ?? null) !== (pSaved[s] ?? null)));
            const pAssigned = pkg.slots.filter(s => (pSaved[s] ?? null) !== null).length;
            return (
              <button
                key={pkg.id}
                className={`pb-formation-tab${pkg.id === activePackageId ? ' active' : ''}`}
                onClick={() => setActivePackageId(pkg.id)}
              >
                <span className="pb-formation-tab-name">{pkg.name}</span>
                <span className="pb-personnel-badge">{pkg.personnel}</span>
                {pDirty && <span className="pb-dirty-dot" title="Unsaved changes" />}
                <span className="pb-slot-count-badge">{pAssigned}/{pkg.slots.length}</span>
              </button>
            );
          })}
        </div>

        {activePackage && (
          <>
            {pkgSlotsHaveChanges && (
              <div className="pb-unsaved-notice">Unsaved changes — click Save Package to apply.</div>
            )}
            {activePackage.description && (
              <p className="pb-package-desc">{activePackage.description}</p>
            )}
            <div className="pb-slot-grid">
              {activePackage.slots.map(slot => {
                const assignedId = mergedPkgSlots[slot] ?? null;
                const savedId    = savedPkgSlots[slot] ?? null;
                const isChanged  = assignedId !== savedId;
                const candidates = eligibleDefensivePlayers(team, slot);
                const assigned   = team.roster.find(p => p.id === assignedId);

                return (
                  <div key={slot} className={`pb-slot-card${isChanged ? ' pb-slot-card--changed' : ''}`}>
                    <div className="pb-slot-label">{DEF_SLOT_LABELS[slot]}</div>
                    {assigned
                      ? (
                        <div className="pb-slot-current">
                          {assigned.name}
                          <span className="pb-slot-pos">{assigned.position}</span>
                          {assigned.scoutedOverall && (
                            <span className="pb-slot-ovr">{assigned.scoutedOverall}</span>
                          )}
                        </div>
                      )
                      : <div className="pb-slot-empty">Unassigned</div>
                    }
                    <select
                      className="pb-slot-select"
                      value={assignedId ?? ''}
                      disabled={pkgSlotsSaving}
                      onChange={e => handleLocalPkgSlotChange(slot, e.target.value || null)}
                    >
                      <option value="">— Unassigned —</option>
                      {candidates.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.position}{p.scoutedOverall ? ` · ${p.scoutedOverall}` : ''})
                        </option>
                      ))}
                    </select>
                    {isChanged && (
                      <span className="pb-slot-changed-label">
                        {savedId
                          ? `was: ${team.roster.find(p => p.id === savedId)?.name ?? 'Unknown'}`
                          : 'was: unassigned'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* ── Defensive Plan ────────────────────────────────────────────── */}
      <section className="pb-section">
        <div className="pb-section-header">
          <div>
            <h2 className="pb-section-title">Defensive Plan</h2>
            <p className="pb-section-desc">
              Assign a defensive playbook to each down &amp; distance situation. On every snap the engine picks a defensive play from the assigned playbook, deploying the right personnel package automatically.
            </p>
          </div>
          <div className="pb-section-actions">
            {defPlanHasChanges && (
              <button className="btn-ghost pb-revert-btn" onClick={handleRevertDefPlan} disabled={defPlanSaving}>
                Revert
              </button>
            )}
            <button
              className="btn-primary pb-save-btn"
              onClick={handleSaveDefPlan}
              disabled={defPlanSaving || !defPlanHasChanges}
            >
              {defPlanSaving ? 'Saving…' : 'Save Plan'}
            </button>
          </div>
        </div>
        {defPlanError && <div className="pb-inline-error">{defPlanError}</div>}
        {defPlanHasChanges && (
          <div className="pb-unsaved-notice">Unsaved changes — click Save Plan to apply.</div>
        )}

        <div className="pb-plan-grid">
          {(['FIRST', 'SECOND', 'THIRD', 'FOURTH'] as const).map(down => {
            const buckets = ALL_BUCKETS.filter(b => b.startsWith(down));
            const downLabel = down.charAt(0) + down.slice(1).toLowerCase();
            return (
              <div key={down} className="pb-plan-down-group">
                <div className="pb-plan-down-header">{downLabel} Down</div>
                {buckets.map(bucket => {
                  const currentId = mergedDefPlan[bucket] ?? '';
                  const savedId   = savedDefPlan[bucket] ?? '';
                  const isChanged = currentId !== savedId;
                  const activePb  = defPlaybooks.find(pb => pb.id === currentId)
                                 ?? (team.customDefensivePlaybooks ?? []).find(pb => pb.id === currentId);
                  return (
                    <div key={bucket} className={`pb-plan-row${isChanged ? ' pb-plan-row--changed' : ''}`}>
                      <span className="pb-plan-bucket-label">{BUCKET_LABELS[bucket]}</span>
                      <div className="pb-plan-select-wrap">
                        <select
                          className="pb-plan-select"
                          value={currentId}
                          disabled={defPlanSaving}
                          onChange={e => handleLocalDefPlanChange(bucket, e.target.value)}
                        >
                          <option value="">— Default —</option>
                          {defPlaybooks.map(pb => (
                            <option key={pb.id} value={pb.id}>{pb.name}</option>
                          ))}
                          {(team.customDefensivePlaybooks ?? []).length > 0 && (
                            <optgroup label="Custom">
                              {(team.customDefensivePlaybooks ?? []).map(pb => (
                                <option key={pb.id} value={pb.id}>{pb.name}</option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                        {activePb && (
                          <span className="pb-plan-play-count">{activePb.entries.length} plays</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Custom Defensive Plays ──────────────────────────────────── */}
      <section className="pb-section">
        <div className="pb-section-header">
          <div>
            <h2 className="pb-section-title">Custom Defensive Plays</h2>
            <p className="pb-section-desc">Create custom defensive schemes. Add them to your defensive playbooks.</p>
          </div>
          <div className="pb-section-actions">
            <button className="btn-primary" onClick={() => openDefPlayCreator()}>+ Create Play</button>
          </div>
        </div>

        {(team.customDefensivePlays ?? []).length > 0 && (
          <div className="cp-list">
            {(team.customDefensivePlays ?? []).map(p => {
              const pkg = packages.find(k => k.id === p.packageId);
              return (
                <div key={p.id} className="cp-card">
                  <div className="cp-card-header">
                    <span className="cp-card-name">{p.name}</span>
                    <span className="cp-card-type">{p.coverage.replace('_', ' ')}</span>
                  </div>
                  <div className="cp-card-meta">
                    <span>{pkg?.name ?? p.packageId}</span>
                    <span>{p.front.replace('_', ' ')}</span>
                    {p.blitz && <span className="cp-badge-pa">{p.blitz.replace('_', ' ')}</span>}
                  </div>
                  <div className="cp-card-actions">
                    <button className="btn-sm" onClick={() => openDefPlayCreator(p)}>Edit</button>
                    <button className="btn-sm btn-danger" disabled={cdpDeleting === p.id} onClick={() => handleDeleteDefPlay(p.id)}>
                      {cdpDeleting === p.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {(team.customDefensivePlays ?? []).length === 0 && !showDefPlayCreator && (
          <p className="muted" style={{ padding: '0.5rem 0' }}>No custom defensive plays yet.</p>
        )}

        {showDefPlayCreator && (
          <div className="cp-creator">
            <h3 className="cp-creator-title">{cdpEditId ? 'Edit Defensive Play' : 'New Defensive Play'}</h3>
            <div className="cp-form-row">
              <label className="cp-label">Name</label>
              <input className="cp-input" value={cdpName} onChange={e => setCdpName(e.target.value)} placeholder="e.g. Nickel Zone Blitz" maxLength={60} />
            </div>
            <div className="cp-form-row">
              <label className="cp-label">Package</label>
              <select className="cp-select" value={cdpPackage} onChange={e => setCdpPackage(e.target.value)}>
                {packages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="cp-form-row">
              <label className="cp-label">Front</label>
              <select className="cp-select" value={cdpFront} onChange={e => setCdpFront(e.target.value)}>
                <option value="four_three">4-3</option>
                <option value="three_four">3-4</option>
                <option value="nickel">Nickel</option>
                <option value="dime">Dime</option>
                <option value="quarter">Quarter</option>
                <option value="goal_line">Goal Line</option>
              </select>
            </div>
            <div className="cp-form-row">
              <label className="cp-label">Coverage</label>
              <select className="cp-select" value={cdpCoverage} onChange={e => setCdpCoverage(e.target.value)}>
                <option value="cover_0">Cover 0 (Man, no safety help)</option>
                <option value="cover_1">Cover 1 (Man-Free)</option>
                <option value="cover_2">Cover 2 (Two-High Zone)</option>
                <option value="cover_3">Cover 3 (Three-Deep Zone)</option>
                <option value="cover_4">Cover 4 (Quarters)</option>
                <option value="cover_6">Cover 6 (Split Coverage)</option>
                <option value="tampa_2">Tampa 2</option>
                <option value="man_under">Man Under</option>
              </select>
            </div>
            <div className="cp-form-row">
              <label className="cp-label">Blitz</label>
              <select className="cp-select" value={cdpBlitz} onChange={e => setCdpBlitz(e.target.value)}>
                <option value="">None</option>
                <option value="lb_blitz">LB Blitz</option>
                <option value="cb_blitz">CB Blitz</option>
                <option value="safety_blitz">Safety Blitz</option>
                <option value="zone_blitz">Zone Blitz</option>
              </select>
            </div>
            {cdpError && <div className="pb-error">{cdpError}</div>}
            <div className="cp-form-actions">
              <button className="btn-primary" disabled={cdpSaving} onClick={handleSaveDefPlay}>
                {cdpSaving ? 'Saving…' : cdpEditId ? 'Update Play' : 'Create Play'}
              </button>
              <button className="btn-secondary" onClick={() => { setShowDefPlayCreator(false); resetDefPlayCreator(); }}>Cancel</button>
            </div>
          </div>
        )}
      </section>

      {/* ── Defensive Playbook Library ────────────────────────────────── */}
      <section className="pb-section">
        <div className="pb-section-header">
          <div>
            <h2 className="pb-section-title">Defensive Playbook Library</h2>
            <p className="pb-section-desc">
              Built-in playbooks are read-only. Create custom defensive playbooks to tailor your call sheet.
            </p>
          </div>
          <div className="pb-section-actions">
            <button className="btn-primary" onClick={handleCreateDefPlaybook}>+ Create Playbook</button>
          </div>
        </div>
        <div className="pb-library">
          {/* Built-in */}
          {defPlaybooks.length > 0 && <div className="pb-library-group-label">Built-in</div>}
          {defPlaybooks.map(pb => {
            const isOpen     = expandedDefBooks.has(pb.id);
            const blitzCount = pb.entries.filter(e => defPlayById.get(e.playId)?.blitz).length;
            const zoneCount  = pb.entries.filter(e => { const cov = defPlayById.get(e.playId)?.coverage ?? ''; return cov.startsWith('cover_') && cov !== 'cover_0' && cov !== 'cover_1'; }).length;
            const manCount   = pb.entries.length - zoneCount;
            return (
              <div key={pb.id} className="pb-book">
                <button className="pb-book-header" onClick={() => toggleDefBook(pb.id)}>
                  <span className="pb-book-name">{pb.name}</span>
                  <span className="pb-book-meta">
                    <span className="pb-book-chip pb-book-chip--zone">{zoneCount} zone</span>
                    <span className="pb-book-chip pb-book-chip--man">{manCount} man/press</span>
                    {blitzCount > 0 && <span className="pb-book-chip pb-book-chip--blitz">{blitzCount} blitz</span>}
                  </span>
                  {pb.entries.length <= 2 && <span className="pb-book-thin-warn">thin</span>}
                  <span className="pb-book-chip pb-book-chip--builtin">built-in</span>
                  <button className="pb-book-action" onClick={e => { e.stopPropagation(); handleDuplicateDefPlaybook(pb); }}>Duplicate</button>
                  <span className="pb-book-chevron">{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (
                  <div className="pb-book-entries">
                    <table className="pb-plays-table">
                      <thead><tr><th>Play</th><th>Package</th><th>Front</th><th>Coverage</th><th>Wt</th><th>Pressure</th></tr></thead>
                      <tbody>
                        {pb.entries.map(entry => {
                          const play = defPlayById.get(entry.playId);
                          const pkg  = play ? packages.find(p => p.id === play.packageId) : null;
                          const isBlitz = !!play?.blitz;
                          return (
                            <tr key={entry.playId} className={isBlitz ? 'pb-row-blitz' : 'pb-row-coverage'}>
                              <td className="pb-play-name">{play?.name ?? entry.playId}</td>
                              <td>{pkg ? <>{pkg.name}<span className="pb-personnel-badge pb-personnel-badge--sm">{pkg.personnel}</span></> : '—'}</td>
                              <td><span className="pb-def-front-chip">{FRONT_LABELS[play?.front ?? ''] ?? play?.front ?? '—'}</span></td>
                              <td><span className="pb-def-coverage-chip">{COVERAGE_LABELS[play?.coverage ?? ''] ?? play?.coverage ?? '—'}</span></td>
                              <td className="pb-play-weight">{entry.weight}</td>
                              <td>{play?.blitz ? <span className="pb-def-blitz-chip">{BLITZ_LABELS[play.blitz] ?? play.blitz}</span> : <span className="pb-def-no-blitz">—</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {/* Custom defensive playbooks */}
          <div className="pb-library-group-label pb-library-group-label--custom">Custom</div>
          {allCustomDefPbs.length === 0 && (
            <div className="pb-library-empty">No custom playbooks yet. Hit <strong>+ Create Playbook</strong> to build one.</div>
          )}
          {allCustomDefPbs.map(pb => {
            const isOpen    = expandedDefBooks.has(pb.id);
            const isEditing = editingDefPbId === pb.id;
            const edits     = defPbEdits[pb.id];
            const isSavedOnServer = (team.customDefensivePlaybooks ?? []).some(s => s.id === pb.id);
            const isDirty   = !!edits;
            const blitzCount = pb.entries.filter(e => defPlayById.get(e.playId)?.blitz).length;
            const zoneCount  = pb.entries.filter(e => { const cov = defPlayById.get(e.playId)?.coverage ?? ''; return cov.startsWith('cover_') && cov !== 'cover_0' && cov !== 'cover_1'; }).length;
            const manCount   = pb.entries.length - zoneCount;
            return (
              <div key={pb.id} className={`pb-book pb-book--custom${isDirty ? ' pb-book--dirty' : ''}`}>
                <button className="pb-book-header" onClick={() => isEditing ? setEditingDefPbId(null) : (isSavedOnServer ? handleEditDefPlaybook(pb) : setEditingDefPbId(pb.id))}>
                  <span className="pb-book-name">{edits?.name ?? pb.name}</span>
                  <span className="pb-book-meta">
                    <span className="pb-book-chip pb-book-chip--zone">{zoneCount} zone</span>
                    <span className="pb-book-chip pb-book-chip--man">{manCount} man/press</span>
                    {blitzCount > 0 && <span className="pb-book-chip pb-book-chip--blitz">{blitzCount} blitz</span>}
                  </span>
                  {!isSavedOnServer && <span className="pb-book-chip pb-book-chip--unsaved">unsaved</span>}
                  {isDirty && isSavedOnServer && <span className="pb-book-chip pb-book-chip--unsaved">edited</span>}
                  {!isEditing && <button className="pb-book-action" onClick={e => { e.stopPropagation(); isSavedOnServer ? handleEditDefPlaybook(pb) : setEditingDefPbId(pb.id); }}>Edit</button>}
                  {isSavedOnServer && !isEditing && (
                    <button
                      className="pb-book-action pb-book-action--danger"
                      disabled={!!deletingPbId}
                      onClick={e => { e.stopPropagation(); if (window.confirm(`Delete "${pb.name}"? This cannot be undone.`)) handleDeleteDefPlaybook(pb.id); }}
                    >
                      {deletingPbId === pb.id ? '…' : 'Delete'}
                    </button>
                  )}
                  <span className="pb-book-chevron">{isEditing ? '▲' : '▼'}</span>
                </button>

                {isEditing && edits && (() => {
                  const totalW    = edits.entries.reduce((s, e) => s + e.weight, 0);
                  const pbWarns   = getDefPbWarnings(edits.entries);
                  const allDefPlaysWithCustom = [...defPlays, ...(team.customDefensivePlays ?? [])];
                  const available = allDefPlaysWithCustom
                    .filter(p => !edits.entries.some(e => e.playId === p.id))
                    .filter(p => !defPlayFilter || p.name.toLowerCase().includes(defPlayFilter.toLowerCase()))
                    .sort((a, b) => {
                      const aCov = a.coverage ?? '';
                      const bCov = b.coverage ?? '';
                      if (aCov !== bCov) return aCov.localeCompare(bCov);
                      return a.name.localeCompare(b.name);
                    });
                  return (
                  <div className="pb-book-editor">
                    <div className="pb-editor-name-row">
                      <label className="pb-editor-label">Name</label>
                      <input
                        className={`pb-editor-name-input${defPbNameError ? ' pb-editor-name-input--error' : ''}`}
                        value={edits.name}
                        maxLength={60}
                        onChange={e => { setDefPbEdits(prev => ({ ...prev, [pb.id]: { ...prev[pb.id]!, name: e.target.value } })); setDefPbNameError(null); }}
                      />
                    </div>
                    {defPbNameError && <div className="pb-field-error">{defPbNameError}</div>}
                    {pbWarns.length > 0 && (
                      <div className="pb-quality-warnings">
                        {pbWarns.map((w, i) => <div key={i} className="pb-quality-warn">&#9888; {w}</div>)}
                      </div>
                    )}
                    {edits.entries.length > 0 && (
                      <table className="pb-plays-table pb-editor-table">
                        <thead><tr><th>Play</th><th>Package</th><th>Coverage</th><th>Weight</th><th>%</th><th></th></tr></thead>
                        <tbody>
                          {edits.entries.map(entry => {
                            const play = defPlayById.get(entry.playId);
                            const pkg  = play ? packages.find(p => p.id === play.packageId) : null;
                            const pct  = totalW > 0 ? Math.round((entry.weight / totalW) * 100) : 0;
                            return (
                              <tr key={entry.playId} className={play?.blitz ? 'pb-row-blitz' : 'pb-row-coverage'}>
                                <td className="pb-play-name">{play?.name ?? entry.playId}</td>
                                <td>{pkg ? <span className="pb-personnel-badge pb-personnel-badge--sm">{pkg.name}</span> : '—'}</td>
                                <td><span className="pb-def-coverage-chip">{COVERAGE_LABELS[play?.coverage ?? ''] ?? play?.coverage ?? '—'}</span></td>
                                <td>
                                  <input
                                    type="number" min={1} max={100}
                                    className="pb-editor-weight-input"
                                    value={entry.weight}
                                    onChange={e => updateDefPbEntry(pb.id, entry.playId, Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                                  />
                                </td>
                                <td className="pb-weight-pct">{pct}%</td>
                                <td>
                                  <button className="pb-editor-remove" onClick={() => removeDefPbEntry(pb.id, entry.playId)}>✕</button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                    {edits.entries.length === 0 && (
                      <p className="pb-editor-empty-hint">No plays yet — add plays from the browser below.</p>
                    )}
                    {/* Defensive play browser */}
                    <div className="pb-play-browser">
                      <div className="pb-play-browser-header">
                        <span className="pb-play-browser-title">Add plays</span>
                        <input
                          className="pb-play-browser-filter"
                          placeholder="Search plays…"
                          value={defPlayFilter}
                          onChange={e => setDefPlayFilter(e.target.value)}
                        />
                      </div>
                      <div className="pb-play-browser-list">
                        {available.length === 0 && (
                          <div className="pb-browser-empty">
                            {defPlayFilter ? 'No plays match your search.' : 'All plays have been added.'}
                          </div>
                        )}
                        {available.map(p => {
                          const pkg = packages.find(pkg => pkg.id === p.packageId);
                          return (
                            <div key={p.id} className="pb-play-browser-row">
                              <span className="pb-play-name">{p.name}</span>
                              {pkg && <span className="pb-personnel-badge pb-personnel-badge--sm">{pkg.name}</span>}
                              <span className="pb-def-coverage-chip">{COVERAGE_LABELS[p.coverage] ?? p.coverage}</span>
                              {p.blitz && <span className="pb-def-blitz-chip">{BLITZ_LABELS[p.blitz] ?? p.blitz}</span>}
                              <button className="pb-play-browser-add" onClick={() => addDefPbEntry(pb.id, p.id)}>+ Add</button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {pbError && <div className="pb-inline-error pb-inline-error--action">{pbError}</div>}
                    <div className="pb-editor-actions">
                      {isSavedOnServer && (
                        <button className="btn-ghost" onClick={() => handleRevertDefPlaybook(pb.id)} disabled={pbSaving}>Revert</button>
                      )}
                      <button className="btn-ghost" onClick={() => handleCancelDefPlaybook(pb.id)} disabled={pbSaving}>Cancel</button>
                      <button className="btn-primary" onClick={() => handleSaveDefPlaybook(pb.id)} disabled={pbSaving}>
                        {pbSaving ? 'Saving…' : 'Save Playbook'}
                      </button>
                    </div>
                  </div>
                  );
                })()}

                {!isEditing && isOpen && (
                  <div className="pb-book-entries">
                    <table className="pb-plays-table">
                      <thead><tr><th>Play</th><th>Package</th><th>Front</th><th>Coverage</th><th>Wt</th><th>Pressure</th></tr></thead>
                      <tbody>
                        {pb.entries.map(entry => {
                          const play = defPlayById.get(entry.playId);
                          const pkg  = play ? packages.find(p => p.id === play.packageId) : null;
                          const isBlitz = !!play?.blitz;
                          return (
                            <tr key={entry.playId} className={isBlitz ? 'pb-row-blitz' : 'pb-row-coverage'}>
                              <td className="pb-play-name">{play?.name ?? entry.playId}</td>
                              <td>{pkg ? <>{pkg.name}<span className="pb-personnel-badge pb-personnel-badge--sm">{pkg.personnel}</span></> : '—'}</td>
                              <td><span className="pb-def-front-chip">{FRONT_LABELS[play?.front ?? ''] ?? play?.front ?? '—'}</span></td>
                              <td><span className="pb-def-coverage-chip">{COVERAGE_LABELS[play?.coverage ?? ''] ?? play?.coverage ?? '—'}</span></td>
                              <td className="pb-play-weight">{entry.weight}</td>
                              <td>{play?.blitz ? <span className="pb-def-blitz-chip">{BLITZ_LABELS[play.blitz] ?? play.blitz}</span> : <span className="pb-def-no-blitz">—</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      </>} {/* end defense */}
    </div>
  );
}


export { PlaybooksView };
