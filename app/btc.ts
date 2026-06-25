// Transformations + calculs BTC, purs (sans I/O). Utilisable client ET serveur.

export type Timeframe = "daily" | "weekly" | "yearly";
export type BusinessDay = { year: number; month: number; day: number };
export type Candle = { time: BusinessDay; open: number; high: number; low: number; close: number };
export type LinePoint = { time: BusinessDay; value: number };
export type Row = { time: number; open: number; high: number; low: number; close: number };

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
