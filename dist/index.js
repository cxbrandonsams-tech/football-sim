import { createPlayer } from './models/Player.js';
const players = [
    createPlayer('p1', 'Alex Rivers', 'QB', 26, { skill: 78, athleticism: 65, iq: 91 }),
    createPlayer('p2', 'Marcus Webb', 'RB', 23, { skill: 72, athleticism: 88, iq: 60 }),
    createPlayer('p3', 'Deon Carter', 'CB', 24, { skill: 70, athleticism: 90, iq: 55 }),
    createPlayer('p4', 'Jake Simmons', 'MLB', 28, { skill: 68, athleticism: 72, iq: 85 }),
    createPlayer('p5', 'Luis Ortega', 'K', 30, { skill: 88, athleticism: 55, iq: 60 }),
];
for (const p of players) {
    console.log(`${p.name.padEnd(16)} ${p.position.padEnd(4)} OVR: ${p.overall}` +
        `  (SKL:${p.ratings.skill} ATH:${p.ratings.athleticism} IQ:${p.ratings.iq})`);
}
//# sourceMappingURL=index.js.map