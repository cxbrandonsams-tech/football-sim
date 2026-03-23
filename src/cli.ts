import * as readline from 'readline';
import { type AnyRatings, scoutBar } from './models/Player';
import { getTrainableFields } from './engine/training';
import { getTeamOverall } from './models/Team';
import { type League, getUserTeam, getWeekGames, OWNER_BUDGET } from './models/League';
import { createInitialLeague } from './initialLeague';
import { createSeason } from './models/Season';
import { calcStandings } from './models/Standings';
import { simulateWeek } from './engine/simulateWeek';
import { signPlayer, releasePlayer, aiSignFreeAgents, MAX_ROSTER_SIZE, CAP_LIMIT, getTeamPayroll } from './engine/rosterManagement';
import { type DepthChartSlot, STARTER_COUNTS, buildDepthChart } from './models/DepthChart';
import { generateTieredDraftClass } from './engine/draft';
import { progressLeague } from './engine/progression';
import { scoutPlayer } from './engine/scouting';
import { aiSetBudgetAllocations } from './engine/budget';
import { extendPlayer, aiExtendPlayers } from './engine/contracts';
import { trainPlayer, trainingCost } from './engine/training';
import { formatGameLog } from './engine/playByPlay';
import { hasSaveFile, saveLeague, loadLeague } from './engine/persistence';

// ── League setup ──────────────────────────────────────────────────────────────

// ── Helpers ───────────────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(prompt: string): Promise<string> {
  return new Promise(resolve => rl.question(prompt, resolve));
}

/** Returns 3 key numeric ratings for compact display (position-aware). */
function keyRatings(r: AnyRatings): [number, number, number] {
  switch (r.position) {
    case 'QB':    return [r.armStrength, r.pocketPresence, r.mobility];
    case 'RB':    return [r.speed, r.power, r.vision];
    case 'WR':    return [r.speed, r.catching, r.separation];
    case 'TE':    return [r.catching, r.blocking, r.routeRunning];
    case 'OT': case 'OG': case 'C': return [r.passBlocking, r.runBlocking, r.strength];
    case 'DE': case 'DT': return [r.passRush, r.runStop, r.athleticism];
    case 'OLB': case 'MLB': return [r.runStop, r.coverage, r.athleticism];
    case 'CB':    return [r.manCoverage, r.speed, r.ballSkills];
    case 'FS': case 'SS': return [r.zoneCoverage, r.range, r.athleticism];
    case 'K': case 'P':   return [r.kickPower, r.kickAccuracy, r.composure];
  }
}

/** Display a personality label if work ethic is high. */
function personalityTag(r: AnyRatings): string {
  if (r.position === 'QB') return '';
  const we = (r as { personality?: { workEthic?: number } }).personality?.workEthic ?? 50;
  return we >= 80 ? 'WE' : '';
}

function printStandings(league: League): void {
  const standings = calcStandings(league.currentSeason);
  console.log('\n  Team  W  L  T   PF   PA  DIFF');
  console.log('  ────  ─  ─  ─  ───  ───  ────');
  for (const s of standings) {
    const diff = s.pointsFor - s.pointsAgainst;
    console.log(
      `  ${s.team.abbreviation.padEnd(4)}  ${s.wins}  ${s.losses}  ${s.ties}` +
      `  ${s.pointsFor.toString().padStart(3)}  ${s.pointsAgainst.toString().padStart(3)}` +
      `  ${diff >= 0 ? '+' : ''}${diff}`
    );
  }
}

function printRoster(league: League): void {
  const team    = getUserTeam(league);
  const payroll = getTeamPayroll(team);
  console.log(`\n  ${team.name} Roster (${team.roster.length}/${MAX_ROSTER_SIZE})  |  Cap: $${payroll}/$${CAP_LIMIT}`);
  console.log('  #   Name              Pos   OVR   R1   R2   R3  Scout  Tag    $  Yrs');
  console.log('  ──  ────────────────  ────  ───  ───  ───  ───  ─────  ───  ──  ───');
  team.roster.forEach((p, i) => {
    const injTag = p.injuryWeeksRemaining > 0 ? `  INJ ${p.injuryWeeksRemaining}w` : '';
    const [r1, r2, r3] = keyRatings(p.scoutedRatings);
    console.log(
      `  ${(i + 1).toString().padStart(2)}  ${p.name.padEnd(16)}  ${p.position.padEnd(4)}` +
      `  ${p.scoutedOverall.toString().padStart(3)}  ${r1.toString().padStart(3)}` +
      `  ${r2.toString().padStart(3)}  ${r3.toString().padStart(3)}` +
      `  ${scoutBar(p.scoutingLevel)}  ${personalityTag(p.scoutedRatings).padEnd(3)}` +
      `  ${p.salary.toString().padStart(2)}  ${p.yearsRemaining}${injTag}`
    );
  });
}

function printFreeAgents(league: League): void {
  if (league.freeAgents.length === 0) {
    console.log('\n  No free agents available.');
    return;
  }
  console.log(`\n  Free Agents (${league.freeAgents.length})`);
  console.log('  #   Name              Pos   OVR   R1   R2   R3  Scout  Tag    $');
  console.log('  ──  ────────────────  ────  ───  ───  ───  ───  ─────  ───  ──');
  league.freeAgents.forEach((p, i) => {
    const [r1, r2, r3] = keyRatings(p.scoutedRatings);
    console.log(
      `  ${(i + 1).toString().padStart(2)}  ${p.name.padEnd(16)}  ${p.position.padEnd(4)}` +
      `  ${p.scoutedOverall.toString().padStart(3)}  ${r1.toString().padStart(3)}` +
      `  ${r2.toString().padStart(3)}  ${r3.toString().padStart(3)}` +
      `  ${scoutBar(p.scoutingLevel)}  ${personalityTag(p.scoutedRatings).padEnd(3)}  ${p.salary.toString().padStart(2)}`
    );
  });
}

function printDepthChart(league: League): void {
  const team = getUserTeam(league);
  const dc = team.depthChart;

  const groups: { label: string; slots: DepthChartSlot[] }[] = [
    { label: 'OFFENSE',       slots: ['QB', 'RB', 'WR', 'TE', 'OL'] },
    { label: 'DEFENSE',       slots: ['DE', 'DT', 'LB', 'CB', 'S']  },
    { label: 'SPECIAL TEAMS', slots: ['K', 'P']                      },
  ];

  console.log(`\n  ${team.name} — Depth Chart`);
  for (const group of groups) {
    console.log(`\n  ${group.label}`);
    for (const slot of group.slots) {
      const starters = dc[slot];
      const filled = starters.map(p => p ? `${p.name} (${p.scoutedOverall})` : '---');
      console.log(`    ${slot.padEnd(4)} ${filled.join('  /  ')}`);
    }
  }
}

// ── Budget allocation ─────────────────────────────────────────────────────────

async function setBudgetAllocation(league: League): Promise<League> {
  console.log(`\n── Budget Allocation ──`);
  console.log(`  Total owner budget : ${OWNER_BUDGET} pts per season`);
  console.log(`  Current allocation : Scouting ${league.budgetAllocation.scouting}  /  Development ${league.budgetAllocation.development}`);
  console.log(`  (Remaining points after scouting automatically go to development)`);

  while (true) {
    const input = await ask(`\n  Enter scouting points (0–${OWNER_BUDGET}, or blank to keep current): `);
    if (input.trim() === '') return league;

    const scouting = parseInt(input);
    if (isNaN(scouting) || scouting < 0 || scouting > OWNER_BUDGET) {
      console.log(`  Enter a number between 0 and ${OWNER_BUDGET}.`);
      continue;
    }

    const development = OWNER_BUDGET - scouting;
    const allocation  = { scouting, development };
    console.log(`  Allocation set: Scouting ${scouting}  /  Development ${development}`);
    return { ...league, budgetAllocation: allocation, scoutingBudget: scouting, developmentBudget: development };
  }
}

// ── Expiring contracts menu ───────────────────────────────────────────────────

async function expiringContractsMenu(league: League): Promise<League> {
  const userTeam  = getUserTeam(league);
  const expiring  = userTeam.roster.filter(p => p.contractDemand);

  if (expiring.length === 0) {
    console.log('\n  No players have contract demands right now.');
    return league;
  }

  while (true) {
    const payroll = getTeamPayroll(getUserTeam(league));
    console.log(`\n── Expiring Contracts  (Cap: $${payroll}/$${CAP_LIMIT}) ──`);
    console.log('  #   Name              Pos   OVR  Trait  Cur $  Cur Yrs  →  Ask $  Ask Yrs');
    console.log('  ──  ────────────────  ────  ───  ─────  ─────  ───────     ─────  ───────');

    const current = getUserTeam(league);
    const demands = current.roster.filter(p => p.contractDemand);
    if (demands.length === 0) { console.log('  All demands resolved.'); break; }

    demands.forEach((p, i) => {
      const d = p.contractDemand!;
      const raise = d.salary > p.salary ? ` (+${d.salary - p.salary})` : '';
      console.log(
        `  ${(i + 1).toString().padStart(2)}  ${p.name.padEnd(16)}  ${p.position.padEnd(4)}` +
        `  ${p.scoutedOverall.toString().padStart(3)}  ${personalityTag(p.scoutedRatings).padEnd(3)}` +
        `   $${p.salary.toString().padStart(2)}       ${p.yearsRemaining}yr` +
        `     $${d.salary.toString().padStart(2)}${raise}   ${d.years}yr`
      );
    });

    console.log('\n  [#] Extend player   [0] Back');
    const input = await ask('\n> ');
    const idx   = parseInt(input) - 1;
    if (isNaN(idx) || idx < 0) break;

    const player = demands[idx];
    if (!player) { console.log('  Invalid selection.'); continue; }

    const d = player.contractDemand!;
    console.log(`\n  ${player.name} wants ${d.years}yr / $${d.salary}/yr`);
    const confirm = await ask('  Accept extension? (y/n): ');
    if (confirm.trim().toLowerCase() === 'y') {
      const { league: next, error } = extendPlayer(league, player.id);
      if (error) { console.log(`  ${error}`); }
      else {
        league = next;
        console.log(`  Extended ${player.name}: ${d.years}yr / $${d.salary}/yr`);
      }
    } else {
      console.log(`  Declined. ${player.name} will enter free agency when their contract expires.`);
    }
  }

  return league;
}

// ── Training sub-menu ─────────────────────────────────────────────────────────

async function trainingMenu(league: League): Promise<League> {
  while (true) {
    const userTeam = getUserTeam(league);
    console.log(`\n── Training  (development points: ${league.developmentBudget}) ──`);
    console.log('  #   Name              Pos   OVR  Age   $  Yrs  Cost');
    console.log('  ──  ────────────────  ────  ───  ───  ──  ───  ────');
    userTeam.roster.forEach((p, i) => {
      const cost  = trainingCost(p.age);
      const ethic = personalityTag(p.trueRatings) === 'WE' ? ' ★' : '';
      console.log(
        `  ${(i + 1).toString().padStart(2)}  ${p.name.padEnd(16)}  ${p.position.padEnd(4)}` +
        `  ${p.scoutedOverall.toString().padStart(3)}  ${p.age.toString().padStart(3)}` +
        `  ${p.salary.toString().padStart(2)}  ${p.yearsRemaining.toString().padStart(3)}  ${cost}pt${ethic}`
      );
    });
    console.log(`\n  ★ = High Work Ethic (+3 to training roll)`);

    const playerInput = await ask('\n  Train player # (or 0 to go back): ');
    const playerIdx = parseInt(playerInput) - 1;
    if (isNaN(playerIdx) || playerIdx < 0) break;
    const player = userTeam.roster[playerIdx];
    if (!player) { console.log('  Invalid selection.'); continue; }

    const cost = trainingCost(player.age);
    if (league.developmentBudget < cost) {
      console.log(`  Not enough development points (need ${cost}, have ${league.developmentBudget}).`);
      continue;
    }

    const focusFields = getTrainableFields(player.trueRatings);
    console.log(`\n  Training ${player.name} (${player.position}, age ${player.age})  —  Cost: ${cost}pt`);
    console.log('  Focus area:');
    focusFields.forEach((f, i) => {
      const cur = ((player.scoutedRatings as unknown as Record<string, unknown>)[f.key] as number) ?? '?';
      console.log(`    ${i + 1}) ${f.label.padEnd(16)} (scouted: ${cur})`);
    });

    const focusInput = await ask(`\n  Choose focus (1–${focusFields.length}, or 0 to cancel): `);
    const focusIdx = parseInt(focusInput) - 1;
    if (isNaN(focusIdx) || focusIdx < 0) continue;
    const focus = focusFields[focusIdx];
    if (!focus) { console.log('  Invalid selection.'); continue; }

    const { league: next, result, error } = trainPlayer(league, player.id, focus.key);
    if (error) { console.log(`  ${error}`); continue; }
    if (!result) continue;

    league = next;

    const hasEthic = personalityTag(player.trueRatings) === 'WE';
    const rollDesc = hasEthic
      ? `roll ${result.roll} + 3 (work ethic) = ${result.total}`
      : `roll ${result.roll}`;

    if (result.gain >= 4) {
      console.log(`\n  GREAT SESSION! (${rollDesc})  +${result.gain} ${focus.label}`);
    } else if (result.gain > 0) {
      console.log(`\n  Good session. (${rollDesc})  +${result.gain} ${focus.label}`);
    } else {
      console.log(`\n  No improvement. (${rollDesc})  Player didn't respond to the drill.`);
    }
    console.log(`  Development points remaining: ${league.developmentBudget}`);
  }

  return league;
}

// ── Roster sub-menu ───────────────────────────────────────────────────────────

async function rosterMenu(league: League): Promise<League> {
  while (true) {
    const expiringCount = getUserTeam(league).roster.filter(p => p.contractDemand).length;
    console.log('\n── Roster Management ──');
    console.log(`  Budget: ${league.ownerBudget} pts total  |  Scouting: ${league.scoutingBudget}  |  Development: ${league.developmentBudget}`);
    if (expiringCount > 0) console.log(`  ⚠  ${expiringCount} player(s) have contract demands`);
    console.log('  1) View Roster');
    console.log('  2) View Free Agents');
    console.log('  3) View Depth Chart');
    console.log('  4) Auto-set Best Lineup');
    console.log('  5) Sign a Player');
    console.log('  6) Release a Player');
    console.log('  7) Scout a Player');
    console.log('  8) Train a Player');
    console.log('  9) Expiring Contracts');
    console.log(' 10) Set Budget Allocation');
    console.log(' 11) Back');

    const choice = await ask('\n> ');

    if (choice === '1') {
      printRoster(league);

    } else if (choice === '2') {
      printFreeAgents(league);

    } else if (choice === '3') {
      printDepthChart(league);

    } else if (choice === '4') {
      const userTeam = getUserTeam(league);
      const newDepthChart = buildDepthChart(userTeam.roster, true);
      const updatedTeam = { ...userTeam, depthChart: newDepthChart };
      const updatedTeams = league.teams.map(t => t.id === updatedTeam.id ? updatedTeam : t);
      league = { ...league, teams: updatedTeams };
      console.log('  Lineup set to best available players.');

    } else if (choice === '5') {
      printFreeAgents(league);
      if (league.freeAgents.length === 0) continue;
      const input = await ask('\n  Sign player # (or 0 to cancel): ');
      const idx = parseInt(input) - 1;
      if (isNaN(idx) || idx < 0) continue;
      const player = league.freeAgents[idx];
      if (!player) { console.log('  Invalid selection.'); continue; }
      const result = signPlayer(league, player.id);
      if (result.error) { console.log(`  ${result.error}`); }
      else { league = result.league; console.log(`  Signed ${player.name} (${player.position}).`); }

    } else if (choice === '6') {
      printRoster(league);
      const userTeam = getUserTeam(league);
      if (userTeam.roster.length === 0) continue;
      const input = await ask('\n  Release player # (or 0 to cancel): ');
      const idx = parseInt(input) - 1;
      if (isNaN(idx) || idx < 0) continue;
      const player = userTeam.roster[idx];
      if (!player) { console.log('  Invalid selection.'); continue; }
      const result = releasePlayer(league, player.id);
      if (result.error) { console.log(`  ${result.error}`); }
      else { league = result.league; console.log(`  Released ${player.name}.`); }

    } else if (choice === '7') {
      if (league.scoutingBudget <= 0) {
        console.log('  No scouting actions remaining this season.');
        continue;
      }
      // Build combined list: roster first, then FAs
      const userTeam = getUserTeam(league);
      const scoutTargets = [
        ...userTeam.roster.map(p => ({ p, source: 'roster' as const })),
        ...league.freeAgents.map(p => ({ p, source: 'fa' as const })),
      ];
      console.log(`\n  Scout a Player  (budget: ${league.scoutingBudget})`);
      console.log('  #   Name              Pos   OVR  Scout  Source');
      console.log('  ──  ────────────────  ────  ───  ─────  ──────');
      scoutTargets.forEach(({ p, source }, i) => {
        const src = source === 'roster' ? 'Roster' : 'FA';
        console.log(
          `  ${(i + 1).toString().padStart(2)}  ${p.name.padEnd(16)}  ${p.position.padEnd(4)}` +
          `  ${p.scoutedOverall.toString().padStart(3)}  ${scoutBar(p.scoutingLevel)}  ${src}`
        );
      });
      const input = await ask('\n  Scout player # (or 0 to cancel): ');
      const idx = parseInt(input) - 1;
      if (isNaN(idx) || idx < 0) continue;
      const target = scoutTargets[idx];
      if (!target) { console.log('  Invalid selection.'); continue; }
      const result = scoutPlayer(league, target.p.id);
      if (result.error) { console.log(`  ${result.error}`); }
      else {
        league = result.league;
        console.log(`  Scouted ${target.p.name}. Budget remaining: ${league.scoutingBudget}`);
      }

    } else if (choice === '8') {
      league = await trainingMenu(league);

    } else if (choice === '9') {
      league = await expiringContractsMenu(league);

    } else if (choice === '10') {
      league = await setBudgetAllocation(league);

    } else if (choice === '11') {
      break;

    } else {
      console.log('  Invalid choice.');
    }
  }
  return league;
}

// ── Draft ─────────────────────────────────────────────────────────────────────

async function runDraft(league: League): Promise<League> {
  const year = league.currentSeason.year;
  const standings = calcStandings(league.currentSeason);
  const draftOrder = [...standings].reverse().map(s => s.team); // worst team first
  const draftPool = generateTieredDraftClass(year);
  const rounds = 2;

  console.log(`\n${'═'.repeat(40)}`);
  console.log(`  ${year} Draft — ${draftPool.length} prospects available`);
  console.log(`${'═'.repeat(40)}`);

  // ── Pre-draft scouting phase ────────────────────────────────────────────────
  if (league.scoutingBudget > 0) {
    console.log(`\n  Pre-Draft Scouting  (${league.scoutingBudget} action(s) remaining)`);
    console.log('  Use your scouting budget to learn more about prospects before picking.');

    while (league.scoutingBudget > 0) {
      const top = [...draftPool].sort((a, b) => b.scoutedOverall - a.scoutedOverall).slice(0, 15);
      console.log(`\n  Top prospects  (budget: ${league.scoutingBudget})`);
      console.log('  #   Name              Pos   OVR  Scout');
      console.log('  ──  ────────────────  ────  ───  ─────');
      top.forEach((p, i) => {
        console.log(
          `  ${(i + 1).toString().padStart(2)}  ${p.name.padEnd(16)}  ${p.position.padEnd(4)}` +
          `  ${p.scoutedOverall.toString().padStart(3)}  ${scoutBar(p.scoutingLevel)}`
        );
      });

      const input = await ask('\n  Scout prospect # (or 0 to start draft): ');
      const idx = parseInt(input) - 1;
      if (isNaN(idx) || idx < 0) break;
      const prospect = top[idx];
      if (!prospect) { console.log('  Invalid selection.'); continue; }

      // Scout via a temporary league that holds the draft pool as freeAgents
      const tempLeague = { ...league, freeAgents: draftPool };
      const result = scoutPlayer(tempLeague, prospect.id);
      if (result.error) { console.log(`  ${result.error}`); continue; }

      // Apply updated scout level back to draftPool and league budget
      const updated = result.league.freeAgents.find(p => p.id === prospect.id)!;
      const pidx = draftPool.findIndex(p => p.id === prospect.id);
      draftPool[pidx] = updated;
      league = { ...league, scoutingBudget: result.league.scoutingBudget };
      console.log(`  Scouted ${prospect.name}. Budget remaining: ${league.scoutingBudget}`);
    }
  }

  console.log('\n  Starting draft...');

  const available = [...draftPool];
  const picks: { round: number; pick: number; teamAbbr: string; player: ReturnType<typeof generateTieredDraftClass>[0] }[] = [];
  let updatedTeams = [...league.teams];

  for (let round = 1; round <= rounds; round++) {
    console.log(`\n  Round ${round}`);

    for (let i = 0; i < draftOrder.length; i++) {
      const pickNumber = (round - 1) * draftOrder.length + i + 1;
      const team = draftOrder[i]!;
      const isUserTeam = team.id === league.userTeamId;

      let chosen: typeof available[0] | undefined;

      if (isUserTeam) {
        // Show top 8 available prospects (scouted view)
        const top = [...available].sort((a, b) => b.scoutedOverall - a.scoutedOverall).slice(0, 8);
        const payroll = getTeamPayroll(updatedTeams.find(t => t.id === team.id)!);
        console.log(`\n  Pick ${pickNumber} — ${team.name} — YOUR PICK  (Cap: $${payroll}/$${CAP_LIMIT})`);
        console.log('  #   Name              Pos   OVR   R1   R2   R3  Scout  Tag    $');
        console.log('  ──  ────────────────  ────  ───  ───  ───  ───  ─────  ───  ──');
        top.forEach((p, idx) => {
          const [r1, r2, r3] = keyRatings(p.scoutedRatings);
          console.log(
            `  ${(idx + 1).toString().padStart(2)}  ${p.name.padEnd(16)}  ${p.position.padEnd(4)}` +
            `  ${p.scoutedOverall.toString().padStart(3)}  ${r1.toString().padStart(3)}` +
            `  ${r2.toString().padStart(3)}  ${r3.toString().padStart(3)}` +
            `  ${scoutBar(p.scoutingLevel)}  ${personalityTag(p.scoutedRatings).padEnd(3)}  ${p.salary.toString().padStart(2)}`
          );
        });

        let selection = -1;
        while (selection < 0 || selection >= top.length) {
          const input = await ask(`\n  Enter pick 1–${top.length}: `);
          selection = parseInt(input) - 1;
          if (isNaN(selection) || selection < 0 || selection >= top.length) {
            console.log('  Invalid. Try again.');
            selection = -1;
          }
        }
        chosen = top[selection];
      } else {
        // AI picks best available it can afford; falls back to all if completely cap-stuck
        const aiTeam    = updatedTeams.find(t => t.id === team.id)!;
        const capRoom   = CAP_LIMIT - getTeamPayroll(aiTeam);
        const pickFrom  = available.filter(p => p.salary <= capRoom);
        const pool      = pickFrom.length > 0 ? pickFrom : available;
        chosen = pool.reduce((best, p) => p.overall > best.overall ? p : best);
        console.log(
          `  Pick ${pickNumber.toString().padStart(2)}  ${team.abbreviation}  ` +
          `${chosen.name.padEnd(16)}  ${chosen.position.padEnd(4)}  OVR: ${chosen.scoutedOverall}  $${chosen.salary}`
        );
      }

      if (!chosen) break;

      picks.push({ round, pick: pickNumber, teamAbbr: team.abbreviation, player: chosen });

      // Add to team roster, rebuild depth chart
      const currentTeam = updatedTeams.find(t => t.id === team.id)!;
      const newRoster = [...currentTeam.roster, chosen];
      const useScouted = isUserTeam;
      updatedTeams = updatedTeams.map(t =>
        t.id === team.id
          ? { ...t, roster: newRoster, depthChart: buildDepthChart(newRoster, useScouted) }
          : t
      );

      // Remove from pool
      const idx = available.indexOf(chosen);
      available.splice(idx, 1);

      if (isUserTeam) {
        console.log(`\n  You selected: ${chosen.name} (${chosen.position})  OVR: ${chosen.scoutedOverall}`);
      }
    }
  }

  return { ...league, teams: updatedTeams };
}

// ── Progression ───────────────────────────────────────────────────────────────

function runProgression(league: League): League {
  const { league: updated, summary } = progressLeague(league);

  console.log(`\n${'═'.repeat(40)}`);
  console.log('  Off-Season Progression');
  console.log(`${'═'.repeat(40)}`);

  if (summary.improved.length > 0) {
    console.log('\n  Improved:');
    for (const r of summary.improved) {
      const tag = personalityTag(r.player.trueRatings) === 'WE' ? ' ★' : '';
      console.log(`    ${r.player.name.padEnd(16)} ${r.player.position.padEnd(4)} ${r.summary}${tag}`);
    }
  }

  if (summary.declined.length > 0) {
    console.log('\n  Declined:');
    for (const r of summary.declined) {
      console.log(`    ${r.player.name.padEnd(16)} ${r.player.position.padEnd(4)} ${r.summary}`);
    }
  }

  if (summary.improved.length === 0 && summary.declined.length === 0) {
    console.log('\n  No significant changes this off-season.');
  }

  return updated;
}

// ── Offseason ─────────────────────────────────────────────────────────────────

async function runOffseason(league: League): Promise<League> {
  console.log('\n── Season Complete ──');
  console.log('\nFinal Standings:');
  printStandings(league);

  league = await runDraft(league);
  league = runProgression(league);

  // AI teams extend their key players first
  const { league: afterExtensions, log: extLog } = aiExtendPlayers(league);
  league = afterExtensions;
  if (extLog.length > 0) {
    console.log('\n  AI Contract Extensions:');
    for (const e of extLog) {
      console.log(`    ${e.teamAbbr}  extended  ${e.playerName.padEnd(16)}  $${e.salary}/yr`);
    }
  }

  // User reviews their own expiring contracts
  const userExpiringCount = getUserTeam(league).roster.filter(p => p.contractDemand).length;
  if (userExpiringCount > 0) {
    console.log(`\n  You have ${userExpiringCount} player(s) with contract demands.`);
    league = await expiringContractsMenu(league);
  }

  // AI teams fill roster holes from FA pool
  const { league: afterFA, signed } = aiSignFreeAgents(league);
  league = afterFA;
  if (signed.length > 0) {
    console.log('\n  AI Free Agency:');
    for (const s of signed) {
      console.log(`    ${s.teamAbbr}  signed  ${s.playerName.padEnd(16)}  $${s.salary}`);
    }
  }

  // AI teams set their allocations (deterministic, based on roster strength)
  league = aiSetBudgetAllocations(league);
  console.log('\n── Off-Season: Budget Allocation ──');
  console.log(`  Owner budget: ${league.ownerBudget} pts  (Scouting / Development)`);
  for (const team of league.teams) {
    if (team.id === league.userTeamId) continue;
    const alloc = league.aiBudgetAllocations[team.id];
    if (!alloc) continue;
    const mode = alloc.scouting > alloc.development ? 'rebuilding' : 'contending';
    console.log(`    ${team.abbreviation.padEnd(4)}  ${alloc.scouting.toString().padStart(2)} scouting / ${alloc.development.toString().padStart(2)} development  (${mode})`);
  }
  console.log('\n  Set your allocation for the coming season.');
  league = await setBudgetAllocation(league);

  // Roll into the next season
  const nextYear = league.currentSeason.year + 1;
  const nextSeason = createSeason(nextYear, league.teams);
  league = { ...league, currentSeason: nextSeason, currentWeek: 1 };
  console.log(`\n  Season ${nextYear} begins.`);

  return league;
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // ── Startup menu ──
  console.log(`\n${'═'.repeat(40)}`);
  console.log('  Gridiron Manager');
  console.log(`${'═'.repeat(40)}`);

  const saveExists = hasSaveFile();
  console.log('  1) New Game');
  if (saveExists) console.log('  2) Load Game');
  console.log(`  ${saveExists ? '3' : '2'}) Exit`);

  // eslint-disable-next-line prefer-const
  let league!: League;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const startChoice = await ask('\n> ');
    if (startChoice === '1') {
      league = createInitialLeague('l1');
    } else if (startChoice === '2' && saveExists) {
      const loaded = loadLeague();
      if (!loaded) {
        console.log('  Save file could not be read. Starting new game.');
        league = createInitialLeague('l1');
      } else {
        league = loaded;
        console.log('  Game loaded.');
      }
    } else if ((startChoice === '3' && saveExists) || (startChoice === '2' && !saveExists)) {
      rl.close(); return;
    } else {
      console.log('  Invalid choice.');
      continue;
    }
    break; // league was assigned — exit startup loop
  }

  // ── Season banner ──
  const printSeasonBanner = (lg: typeof league) => {
    const ut = getUserTeam(lg);
    console.log(`\n${'═'.repeat(40)}`);
    console.log(`  ${lg.name} — Season ${lg.currentSeason.year}`);
    console.log(`  GM: ${ut.name} (${ut.abbreviation})  OVR: ${getTeamOverall(ut)}`);
    console.log(`  Cap: $${getTeamPayroll(ut)}/$${CAP_LIMIT}`);
    console.log(`${'═'.repeat(40)}`);
  };
  printSeasonBanner(league);

  // ── Game loop ──
  while (true) {
    const totalWeeks = Math.max(...league.currentSeason.games.map(g => g.week));

    if (league.currentWeek > totalWeeks) {
      league = await runOffseason(league);
      printSeasonBanner(league);
      continue;
    }

    const weekGames   = getWeekGames(league, league.currentWeek);
    const alreadyPlayed = weekGames.every(g => g.status === 'final');

    console.log(`\n── Week ${league.currentWeek} of ${totalWeeks} ──`);
    for (const g of weekGames) {
      if (g.status === 'final') {
        const winner = g.homeScore > g.awayScore ? g.homeTeam.abbreviation : g.awayTeam.abbreviation;
        console.log(`  ${g.awayTeam.abbreviation} ${g.awayScore.toString().padStart(2)} @ ${g.homeTeam.abbreviation} ${g.homeScore.toString().padStart(2)}  FINAL  (${winner})`);
      } else {
        console.log(`  ${g.awayTeam.abbreviation} @ ${g.homeTeam.abbreviation}`);
      }
    }

    console.log('');
    if (!alreadyPlayed) console.log('  1) Advance Week');
    console.log('  2) View Standings');
    console.log('  3) Manage Roster');
    console.log('  4) Save Game');
    console.log('  5) Exit');

    const choice = await ask('\n> ');

    if (choice === '1' && !alreadyPlayed) {
      const prevWeek = league.currentWeek;
      const alreadyInjuredIds = new Set(
        getUserTeam(league).roster.filter(p => p.injuryWeeksRemaining > 0).map(p => p.id)
      );

      league = simulateWeek(league);
      const results = getWeekGames(league, prevWeek);
      console.log(`\nWeek ${prevWeek} Results:`);
      for (const g of results) {
        const winner = g.homeScore > g.awayScore ? g.homeTeam.abbreviation : g.awayTeam.abbreviation;
        console.log(`  ${g.awayTeam.abbreviation} ${g.awayScore} @ ${g.homeTeam.abbreviation} ${g.homeScore}  (${winner} win)`);
      }

      // Show only players who became injured this week
      const newlyInjured = getUserTeam(league).roster.filter(
        p => p.injuryWeeksRemaining > 0 && !alreadyInjuredIds.has(p.id)
      );
      if (newlyInjured.length > 0) {
        console.log('\n  Injury Report:');
        for (const p of newlyInjured) {
          console.log(`    ${p.name.padEnd(16)} ${p.position.padEnd(4)} — OUT ${p.injuryWeeksRemaining}w`);
        }
      }

      // Offer play-by-play for user's game if they played this week
      const userGame = results.find(g =>
        g.homeTeam.id === league.userTeamId || g.awayTeam.id === league.userTeamId
      );
      if (userGame) {
        const pbp = await ask('\n  View play-by-play? (y/n): ');
        if (pbp.trim().toLowerCase() === 'y') {
          console.log(`\n── Play-by-Play: ${userGame.awayTeam.abbreviation} @ ${userGame.homeTeam.abbreviation} ──\n`);
          for (const line of formatGameLog(userGame)) console.log(line);
        }
      }

    } else if (choice === '2') {
      console.log('\nStandings:');
      printStandings(league);

    } else if (choice === '3') {
      league = await rosterMenu(league);

    } else if (choice === '4') {
      saveLeague(league);
      console.log('  Game saved.');

    } else if (choice === '5') {
      console.log('\nGoodbye.');
      break;

    } else {
      console.log('  Invalid choice.');
    }
  }

  rl.close();
}

main();
