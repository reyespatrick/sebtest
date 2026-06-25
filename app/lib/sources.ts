// Récupération des données externes. Côté serveur uniquement.
import type { Row } from "../btc";

const DAY = 86400;

// Nettoyage des mèches aberrantes (mauvais ticks), en conservant les vrais krachs.
function clean(r: Row): Row {
  const minBody = Math.min(r.open, r.close);
  const maxBody = Math.max(r.open, r.close);
  let { low, high } = r;
  if (low < minBody * 0.25) low = minBody;
  if (high > maxBody * 4) high = maxBody;
  return { ...r, low, high };
}

// --- Binance.com : klines journalières BTCUSDT (depuis le 2017-08-17) ---
export async function binanceDailySince(startMs: number): Promise<Row[]> {
  const out: Row[] = [];
  let start = startMs;
  for (let i = 0; i < 15; i++) {
    const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=${start}&limit=1000`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Binance : HTTP " + res.status);
    const arr = (await res.json()) as (string | number)[][];
    if (!arr.length) break;
    for (const k of arr) {
      out.push(
        clean({
          time: Math.floor(Number(k[0]) / 1000),
          open: Number(k[1]),
          high: Number(k[2]),
          low: Number(k[3]),
          close: Number(k[4]),
        })
      );
    }
    if (arr.length < 1000) break;
    start = Number(arr[arr.length - 1][6]) + 1; // openTime suivant = closeTime + 1
  }
  return out;
}

// --- Coinbase : backfill de la période antérieure à Binance (2016 -> 2017) ---
// Réponse : [ time(s), low, high, open, close, volume ], max 300 bougies / requête.
export async function coinbaseRange(startSec: number, endSec: number): Promise<Row[]> {
  const map = new Map<number, Row>();
  const span = 300 * DAY;
  let end = endSec;
  for (let i = 0; i < 10 && end > startSec; i++) {
    const s = Math.max(startSec, end - span);
    const u = new URL("https://api.exchange.coinbase.com/products/BTC-USD/candles");
    u.searchParams.set("granularity", String(DAY));
    u.searchParams.set("start", new Date(s * 1000).toISOString());
    u.searchParams.set("end", new Date(end * 1000).toISOString());
    const res = await fetch(u.toString(), { cache: "no-store" });
    if (res.ok) {
      const raw = (await res.json()) as number[][];
      for (const r of raw) {
        if (r[4] > 0) {
          map.set(r[0], clean({ time: r[0], open: r[3], high: r[2], low: r[1], close: r[4] }));
        }
      }
    }
    end = s;
  }
  return [...map.values()];
}

// --- Hashrate réseau (mempool.space), en H/s ---
export async function fetchHashrateHs(): Promise<number> {
  const res = await fetch("https://mempool.space/api/v1/mining/hashrate/1m", { cache: "no-store" });
  const json = await res.json();
  return json.currentHashrate as number;
}

// --- Taux USD -> CHF du jour (frankfurter.dev, BCE) ---
export async function fetchUsdChf(): Promise<number> {
  const res = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=CHF", {
    cache: "no-store",
  });
  const json = await res.json();
  return json.rates.CHF as number;
}
