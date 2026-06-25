// Données BTC + calcul du coût de minage. Tout est typé et sans dépendance serveur.

export type Timeframe = "daily" | "weekly" | "yearly";
export type BusinessDay = { year: number; month: number; day: number };
export type Candle = {
  time: BusinessDay;
  open: number;
  high: number;
  low: number;
  close: number;
};
export type LinePoint = { time: BusinessDay; value: number };

type Row = { time: number; open: number; high: number; low: number; close: number };

// --- Historique OHLC (Coinbase Exchange, remonte à 2015, gratuit, CORS ok) ---
// Réponse Coinbase : [ time(s), low, high, open, close, volume ], plus récent d'abord,
// max 300 bougies par requête -> on pagine par fenêtres de 300 jours.

const DAY = 86400;
const COINBASE = "https://api.exchange.coinbase.com/products/BTC-USD/candles";

async function coinbasePage(startSec: number, endSec: number): Promise<Row[]> {
  const u = new URL(COINBASE);
  u.searchParams.set("granularity", String(DAY));
  u.searchParams.set("start", new Date(startSec * 1000).toISOString());
  u.searchParams.set("end", new Date(endSec * 1000).toISOString());
  const res = await fetch(u.toString());
  if (!res.ok) throw new Error("Coinbase : HTTP " + res.status);
  const raw = (await res.json()) as number[][];
  return raw
    .filter((r) => r[4] > 0)
    .map((r) => {
      const open = r[3], close = r[4];
      let low = r[1], high = r[2];
      // Nettoyage des mèches aberrantes (mauvais ticks Coinbase, ex. low 0.06 en 2017).
      // Seuils larges : on conserve les vrais krachs intra-day (ex. -40% mars 2020).
      const minBody = Math.min(open, close), maxBody = Math.max(open, close);
      if (low < minBody * 0.25) low = minBody;
      if (high > maxBody * 4) high = maxBody;
      return { time: r[0], open, high, low, close };
    });
}

// ~10 ans de données journalières
export async function fetchDailyUSD(): Promise<Row[]> {
  const now = Math.floor(Date.now() / 1000);
  const tenYearsAgo = now - 3653 * DAY;
  const span = 300 * DAY;
  const map = new Map<number, Row>();
  let end = now;
  for (let i = 0; i < 20 && end > tenYearsAgo; i++) {
    const start = Math.max(tenYearsAgo, end - span);
    const page = await coinbasePage(start, end);
    page.forEach((d) => map.set(d.time, d));
    end = start;
  }
  if (map.size === 0) throw new Error("Aucune donnée de prix reçue");
  return [...map.values()].sort((a, b) => a.time - b.time);
}

// --- Agrégation daily -> weekly / yearly ---

function bd(sec: number): BusinessDay {
  const d = new Date(sec * 1000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function weekStartSec(sec: number): number {
  const d = new Date(sec * 1000);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = lundi
  const midnight = Math.floor(sec / 86400) * 86400;
  return midnight - dow * 86400;
}

function yearStartSec(sec: number): number {
  return Math.floor(Date.UTC(new Date(sec * 1000).getUTCFullYear(), 0, 1) / 1000);
}

export function aggregate(rows: Row[], tf: Timeframe): Row[] {
  if (tf === "daily") return rows;
  const key = tf === "weekly" ? weekStartSec : yearStartSec;
  const map = new Map<number, Row>();
  for (const r of rows) {
    const k = key(r.time);
    const ex = map.get(k);
    if (!ex) map.set(k, { time: k, open: r.open, high: r.high, low: r.low, close: r.close });
    else {
      ex.high = Math.max(ex.high, r.high);
      ex.low = Math.min(ex.low, r.low);
      ex.close = r.close;
    }
  }
  return [...map.values()].sort((a, b) => a.time - b.time);
}

export function toCandles(rows: Row[], mult: number): Candle[] {
  return rows.map((r) => ({
    time: bd(r.time),
    open: r.open * mult,
    high: r.high * mult,
    low: r.low * mult,
    close: r.close * mult,
  }));
}

export function toLine(rows: Row[], mult: number): LinePoint[] {
  return rows.map((r) => ({ time: bd(r.time), value: r.close * mult }));
}

export function latestClose(rows: Row[]): number {
  return rows.length ? rows[rows.length - 1].close : 0;
}

// --- Hashrate réseau (mempool.space) ---

export async function fetchHashrateHs(): Promise<number> {
  const res = await fetch("https://mempool.space/api/v1/mining/hashrate/1m");
  const json = await res.json();
  return json.currentHashrate as number; // en H/s
}

// --- Taux de change USD -> CHF du jour (frankfurter.app, BCE) ---

export async function fetchUsdChf(): Promise<number> {
  const res = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=CHF");
  const json = await res.json();
  return json.rates.CHF as number;
}

// --- Coût de création (minage) d'un BTC, en USD ---

export type MiningAssumptions = {
  hashrateHs: number; // hashrate réseau en H/s
  efficiency: number; // efficacité du parc en J/TH
  elecUsdKwh: number; // prix de l'électricité en USD/kWh (Chine)
  subsidy: number; // récompense de bloc en BTC
};

export function miningCostUsd(a: MiningAssumptions): number {
  const ths = a.hashrateHs / 1e12; // H/s -> TH/s
  const powerW = ths * a.efficiency; // J/TH * TH/s = W
  const dailyKwh = (powerW / 1000) * 24;
  const dailyCostUsd = dailyKwh * a.elecUsdKwh;
  const btcPerDay = 144 * a.subsidy; // ~144 blocs/jour
  return btcPerDay > 0 ? dailyCostUsd / btcPerDay : 0;
}
