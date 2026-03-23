import * as fs from 'fs';
import { type League } from '../models/League';

const SAVE_FILE = './save.json';

export function hasSaveFile(): boolean {
  return fs.existsSync(SAVE_FILE);
}

export function saveLeague(league: League): void {
  fs.writeFileSync(SAVE_FILE, JSON.stringify(league, null, 2), 'utf-8');
}

export function loadLeague(): League | null {
  if (!fs.existsSync(SAVE_FILE)) return null;
  try {
    const raw = fs.readFileSync(SAVE_FILE, 'utf-8');
    return JSON.parse(raw) as League;
  } catch {
    return null;
  }
}
