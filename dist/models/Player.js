// Weights must sum to 1.0 per position
const WEIGHTS = {
    QB: { skill: 0.30, athleticism: 0.20, iq: 0.50 },
    RB: { skill: 0.30, athleticism: 0.50, iq: 0.20 },
    WR: { skill: 0.40, athleticism: 0.45, iq: 0.15 },
    TE: { skill: 0.35, athleticism: 0.40, iq: 0.25 },
    OT: { skill: 0.40, athleticism: 0.35, iq: 0.25 },
    OG: { skill: 0.45, athleticism: 0.30, iq: 0.25 },
    C: { skill: 0.35, athleticism: 0.25, iq: 0.40 },
    DE: { skill: 0.35, athleticism: 0.50, iq: 0.15 },
    DT: { skill: 0.40, athleticism: 0.45, iq: 0.15 },
    OLB: { skill: 0.30, athleticism: 0.50, iq: 0.20 },
    MLB: { skill: 0.30, athleticism: 0.35, iq: 0.35 },
    CB: { skill: 0.35, athleticism: 0.50, iq: 0.15 },
    FS: { skill: 0.25, athleticism: 0.40, iq: 0.35 },
    SS: { skill: 0.30, athleticism: 0.45, iq: 0.25 },
    K: { skill: 0.75, athleticism: 0.15, iq: 0.10 },
    P: { skill: 0.75, athleticism: 0.15, iq: 0.10 },
};
export function calcOverall(position, ratings) {
    const w = WEIGHTS[position];
    return Math.round(ratings.skill * w.skill +
        ratings.athleticism * w.athleticism +
        ratings.iq * w.iq);
}
export function createPlayer(id, name, position, age, ratings) {
    return { id, name, position, age, ratings, overall: calcOverall(position, ratings) };
}
//# sourceMappingURL=Player.js.map