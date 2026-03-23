export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'OT' | 'OG' | 'C' | 'DE' | 'DT' | 'OLB' | 'MLB' | 'CB' | 'FS' | 'SS' | 'K' | 'P';
export interface Ratings {
    skill: number;
    athleticism: number;
    iq: number;
}
export interface Player {
    id: string;
    name: string;
    position: Position;
    age: number;
    ratings: Ratings;
    overall: number;
}
export declare function calcOverall(position: Position, ratings: Ratings): number;
export declare function createPlayer(id: string, name: string, position: Position, age: number, ratings: Ratings): Player;
//# sourceMappingURL=Player.d.ts.map