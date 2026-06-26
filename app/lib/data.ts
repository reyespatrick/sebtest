// Orchestration cache + téléchargement. Côté serveur. Utilisée par la page ET l'API.
import {
  maxCandleTs,
  candleCount,
  insertCandles,
  candlesSince,
  hashCount,
  insertHashrates,
  allHashrates,
  getMeta,
  setMeta,
} from "./db";
import {
  binanceDailySince,
  coinbaseRange,
  fetchHashrateHs,
  fetchHashrateSeries,
  fetchUsdChf,
} from "./sources";
import type { Row, HashPoint } from "../btc";

const DAY = 86400;
const BINANCE_START_SEC = Math.floor(Date.parse("2017-08-17T00:00:00Z") / 1000);
const HALF_DAY = 12 * 3600;

export type DashboardData = {
  daily: Row[];
  hashrates: HashPoint[];
  hashrateHs: number;
  fx: number;
};

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

  // Série historique de hashrate : (re)chargée si vide ou cache > 12 h.
  const hu = getMeta("hash_series");
  if (hashCount() === 0 || !hu || now - hu.updated > HALF_DAY) {
    try {
      const series = await fetchHashrateSeries();
      if (series.length) {
        insertHashrates(series);
        setMeta("hash_series", "1", now);
      }
    } catch {}
  }
  const hashrates = allHashrates();

  // Hashrate courant = dernier point de la série (sinon mempool en repli).
  let hashrateHs = hashrates.length ? hashrates[hashrates.length - 1].h * 1e12 : 0;
  if (!hashrateHs) {
    try {
      hashrateHs = await fetchHashrateHs();
    } catch {
      hashrateHs = 9.5e20;
    }
  }

  // Taux de change : rafraîchi si le cache a plus de 12 h.
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
    hashrates,
    hashrateHs,
    fx: fx ? Number(fx.value) : 0.81,
  };
}
