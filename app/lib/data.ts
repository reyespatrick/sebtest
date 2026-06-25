// Orchestration cache + téléchargement. Côté serveur. Utilisée par la page ET l'API.
import {
  maxCandleTs,
  candleCount,
  insertCandles,
  candlesSince,
  getMeta,
  setMeta,
} from "./db";
import { binanceDailySince, coinbaseRange, fetchHashrateHs, fetchUsdChf } from "./sources";
import type { Row } from "../btc";

const DAY = 86400;
const BINANCE_START_SEC = Math.floor(Date.parse("2017-08-17T00:00:00Z") / 1000);
const HALF_DAY = 12 * 3600;

export type DashboardData = { daily: Row[]; hashrateHs: number; fx: number };

export async function getData(): Promise<DashboardData> {
  const now = Math.floor(Date.now() / 1000);
  const tenYearsAgo = now - 3653 * DAY;

  // Prix : backfill initial si la base est vide, sinon complément incrémental.
  if (candleCount() === 0) {
    const cb = await coinbaseRange(tenYearsAgo, BINANCE_START_SEC);
    const bn = await binanceDailySince(BINANCE_START_SEC * 1000);
    insertCandles([...cb, ...bn]);
  } else {
    const max = maxCandleTs();
    if (now - max > DAY) {
      const bn = await binanceDailySince((max + 1) * 1000);
      insertCandles(bn);
    }
  }

  const daily = candlesSince(tenYearsAgo);

  // Hashrate & taux de change : rafraîchis si le cache a plus de 12 h.
  let hash = getMeta("hashrate");
  if (!hash || now - hash.updated > HALF_DAY) {
    try {
      const h = await fetchHashrateHs();
      setMeta("hashrate", String(h), now);
      hash = { value: String(h), updated: now };
    } catch {}
  }
  let fx = getMeta("fx");
  if (!fx || now - fx.updated > HALF_DAY) {
    try {
      const f = await fetchUsdChf();
      setMeta("fx", String(f), now);
      fx = { value: String(f), updated: now };
    } catch {}
  }

  return {
    daily,
    hashrateHs: hash ? Number(hash.value) : 9.5e20,
    fx: fx ? Number(fx.value) : 0.81,
  };
}
