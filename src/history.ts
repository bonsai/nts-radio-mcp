// NTS TUI Radio —  local listening history store
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HISTORY_DIR = join(homedir(), '.nts-radio-mcp');
const HISTORY_FILE = join(HISTORY_DIR, 'history.json');

export interface PlayRecord {
  ts: number;
  stationIndex: number;
  stationName: string;
  stationKind: 'live' | 'mixtape';
  subtitle: string;
}

function ensureDir(): void {
  if (!existsSync(HISTORY_DIR)) mkdirSync(HISTORY_DIR, { recursive: true });
}

export function readHistory(): PlayRecord[] {
  try {
    ensureDir();
    if (!existsSync(HISTORY_FILE)) return [];
    const raw = readFileSync(HISTORY_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function appendPlay(record: Omit<PlayRecord, 'ts'>): void {
  try {
    ensureDir();
    const history = readHistory();
    history.push({ ...record, ts: Date.now() });
    // 直近 1000 件だけ保持
    const trimmed = history.slice(-1000);
    writeFileSync(HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
  } catch {
    /* 履歴保存失敗は再生に影響させない */
  }
}

export function clearHistory(): void {
  try {
    ensureDir();
    if (existsSync(HISTORY_FILE)) writeFileSync(HISTORY_FILE, '[]', 'utf8');
  } catch {
    /* ignore */
  }
}
