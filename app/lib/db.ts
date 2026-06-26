// Cache SQLite (fichier data/btc.db). Côté serveur uniquement.
import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import path from "path";
import type { Row, HashPoint } from "../btc";

const dir = path.join(process.cwd(), "data");
mkdirSync(dir, { recursive: true });

const db = new Database(path.join(dir, "btc.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS candles (
    ts INTEGER PRIMARY KEY,
    open REAL, high REAL, low REAL, close REAL
  );
  CREATE TABLE IF NOT EXISTS hashrate (
    ts INTEGER PRIMARY KEY,
    ths REAL
  );
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated INTEGER
  );
`);

const insStmt = db.prepare(
  "INSERT OR REPLACE INTO candles (ts, open, high, low, close) VALUES (?, ?, ?, ?, ?)"
);
const insTx = db.transaction((rows: Row[]) => {
  for (const r of rows) insStmt.run(r.time, r.open, r.high, r.low, r.close);
});

export function maxCandleTs(): number {
  const r = db.prepare("SELECT MAX(ts) AS m FROM candles").get() as { m: number | null };
  return r.m ?? 0;
}

export function candleCount(): number {
  const r = db.prepare("SELECT COUNT(*) AS c FROM candles").get() as { c: number };
  return r.c;
}

export function insertCandles(rows: Row[]): void {
  if (rows.length) insTx(rows);
}

export function candlesSince(ts: number): Row[] {
  return db
    .prepare("SELECT ts AS time, open, high, low, close FROM candles WHERE ts >= ? ORDER BY ts")
    .all(ts) as Row[];
}

const insHashStmt = db.prepare("INSERT OR REPLACE INTO hashrate (ts, ths) VALUES (?, ?)");
const insHashTx = db.transaction((rows: HashPoint[]) => {
  for (const r of rows) insHashStmt.run(r.t, r.h);
});

export function hashCount(): number {
  const r = db.prepare("SELECT COUNT(*) AS c FROM hashrate").get() as { c: number };
  return r.c;
}

export function insertHashrates(rows: HashPoint[]): void {
  if (rows.length) insHashTx(rows);
}

export function allHashrates(): HashPoint[] {
  return db.prepare("SELECT ts AS t, ths AS h FROM hashrate ORDER BY ts").all() as HashPoint[];
}

export function getMeta(key: string): { value: string; updated: number } | undefined {
  return db.prepare("SELECT value, updated FROM meta WHERE key = ?").get(key) as
    | { value: string; updated: number }
    | undefined;
}

export function setMeta(key: string, value: string, updated: number): void {
  db.prepare("INSERT OR REPLACE INTO meta (key, value, updated) VALUES (?, ?, ?)").run(
    key,
    value,
    updated
  );
}
