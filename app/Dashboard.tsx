"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, LineStyle } from "lightweight-charts";
import {
  aggregate,
  toCandles,
  toLine,
  latestClose,
  miningCostUsd,
  miningCostCurve,
  type Row,
  type HashPoint,
  type Timeframe,
} from "./btc";

type Currency = "USD" | "CHF";
type ChartType = "candles" | "line";

type Props = { initialDaily: Row[]; hashrates: HashPoint[]; hashrateHs: number; fx: number };

const SUBSIDY = 3.125; // récompense de bloc depuis le halving d'avril 2024

function fmt(value: number, currency: Currency, digits = 0): string {
  return new Intl.NumberFormat("fr-CH", {
    style: "currency",
    currency,
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function nf(value: number, digits = 0): string {
  return new Intl.NumberFormat("fr-CH", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export default function Dashboard({ initialDaily, hashrates, hashrateHs, fx: fx0 }: Props) {
  const [currency, setCurrency] = useState<Currency>("USD");
  const [timeframe, setTimeframe] = useState<Timeframe>("weekly");
  const [chartType, setChartType] = useState<ChartType>("candles");

  const [elec, setElec] = useState(0.06); // USD/kWh
  const [efficiency, setEfficiency] = useState(25); // J/TH

  // Données fournies par le serveur : présentes dès le premier rendu.
  const [rows] = useState<Row[]>(initialDaily);
  const [fx] = useState(fx0);

  // Hashrate courant = donnée mesurée (non modifiable).
  const hashrateEH = Math.round((hashrateHs / 1e18) * 10) / 10;

  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceSeriesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const costSeriesRef = useRef<any>(null);

  const curMult = currency === "CHF" ? fx : 1;

  // --- Décomposition du calcul du coût de minage actuel (en USD) ---
  const hashThs = hashrateHs / 1e12; // H/s -> TH/s
  const powerW = hashThs * efficiency; // J/TH * TH/s = W
  const powerGW = powerW / 1e9;
  const dailyKwh = (powerW / 1000) * 24;
  const dailyGWh = dailyKwh / 1e6;
  const dailyElecUsd = dailyKwh * elec;
  const btcPerDay = 144 * SUBSIDY;
  const costUsd = miningCostUsd({
    hashrateHs,
    efficiency,
    elecUsdKwh: elec,
    subsidy: SUBSIDY,
  });
  const costDisp = costUsd * curMult;

  const latestUsd = latestClose(rows);
  const latestDisp = latestUsd * curMult;
  const firstUsd = rows.length ? rows[0].close : 0;
  const perf = firstUsd ? ((latestUsd - firstUsd) / firstUsd) * 100 : 0;

  // Création du graphique (une seule fois)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      layout: { background: { color: "#ffffff" }, textColor: "#6b6b66", fontSize: 11 },
      grid: {
        vertLines: { color: "rgba(0,0,0,0.05)" },
        horzLines: { color: "rgba(0,0,0,0.06)" },
      },
      rightPriceScale: { mode: 1, borderVisible: false }, // mode 1 = échelle logarithmique
      timeScale: { borderVisible: false },
      crosshair: { mode: 1 },
    });
    chartRef.current = chart;

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      priceSeriesRef.current = null;
      costSeriesRef.current = null;
    };
  }, []);

  // Série de prix (bougies ou ligne)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (priceSeriesRef.current) chart.removeSeries(priceSeriesRef.current);

    const agg = aggregate(rows, timeframe);
    let series;
    if (chartType === "candles") {
      series = chart.addCandlestickSeries({
        upColor: "#1a8f68",
        downColor: "#e24b4a",
        wickUpColor: "#1a8f68",
        wickDownColor: "#e24b4a",
        borderVisible: false,
      });
      series.setData(toCandles(agg, curMult));
    } else {
      series = chart.addLineSeries({ color: "#5b51d8", lineWidth: 2 });
      series.setData(toLine(agg, curMult));
    }
    priceSeriesRef.current = series;
    chart.timeScale().fitContent();
  }, [rows, timeframe, chartType, curMult]);

  // Courbe historique du coût de minage (recalculée si hypothèses / devise changent)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (costSeriesRef.current) chart.removeSeries(costSeriesRef.current);

    const agg = aggregate(rows, timeframe);
    const curve = miningCostCurve(agg, hashrates, {
      efficiency,
      elecUsdKwh: elec,
      mult: curMult,
    });
    const series = chart.addLineSeries({
      color: "#c2820f",
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      crosshairMarkerVisible: true,
      lastValueVisible: true,
      title: "Coût minage",
    });
    series.setData(curve);
    costSeriesRef.current = series;
  }, [rows, timeframe, curMult, efficiency, elec, hashrates]);

  return (
    <div className="wrap">
      <div className="header">
        <div className="brand">
          <div className="logo">₿</div>
          <div>
            <div className="sub">Bitcoin · cours sur 10 ans</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span className="price">{fmt(latestDisp, currency)}</span>
              <span className={"delta " + (perf >= 0 ? "up" : "down")}>
                {perf >= 0 ? "+" : ""}
                {perf.toFixed(0)}% / 10 ans
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="ctl-label">Devise</span>
          <div className="seg">
            <button className={currency === "USD" ? "on" : ""} onClick={() => setCurrency("USD")}>
              USD
            </button>
            <button className={currency === "CHF" ? "on" : ""} onClick={() => setCurrency("CHF")}>
              CHF
            </button>
          </div>
        </div>
      </div>

      <div className="controls">
        <span className="ctl-label">Période</span>
        <div className="seg">
          {(["daily", "weekly", "yearly"] as Timeframe[]).map((tf) => (
            <button key={tf} className={timeframe === tf ? "on" : ""} onClick={() => setTimeframe(tf)}>
              {tf === "daily" ? "Daily" : tf === "weekly" ? "Weekly" : "Yearly"}
            </button>
          ))}
        </div>
        <span className="ctl-label" style={{ marginLeft: 8 }}>
          Style
        </span>
        <div className="seg">
          <button className={chartType === "candles" ? "on" : ""} onClick={() => setChartType("candles")}>
            Bougies
          </button>
          <button className={chartType === "line" ? "on" : ""} onClick={() => setChartType("line")}>
            Ligne
          </button>
        </div>
      </div>

      <div className="grid">
        <div className="chartcard">
          <div ref={containerRef} className="chart" />
          <div className="legend">
            <span className="k">
              <span className="candle" /> Cours du BTC
            </span>
            <span className="k">
              <span className="dash" /> Coût de minage (courbe, Chine) · actuel {fmt(costDisp, currency)}
            </span>
          </div>
        </div>

        <div className="panel">
          <h2>⛏️ Économie du minage</h2>
          <div className="row">
            <label>Électricité (Chine)</label>
            <span>
              <input
                type="number"
                step="0.005"
                min="0"
                value={elec}
                onChange={(e) => setElec(parseFloat(e.target.value) || 0)}
              />{" "}
              $/kWh
            </span>
          </div>
          <div className="row">
            <label>Efficacité parc</label>
            <span>
              <input
                type="number"
                step="1"
                min="1"
                value={efficiency}
                onChange={(e) => setEfficiency(parseFloat(e.target.value) || 0)}
              />{" "}
              J/TH
            </span>
          </div>
          <div className="row">
            <label>Hashrate réseau (actuel)</label>
            <span className="static">{nf(hashrateEH, 1)} EH/s</span>
          </div>
          <div className="row">
            <label>Subvention bloc</label>
            <span className="static">{SUBSIDY} BTC</span>
          </div>

          <div className="cost">
            <div className="l">Coût de création / BTC (aujourd&apos;hui)</div>
            <div className="v">{fmt(costDisp, currency)}</div>
          </div>
        </div>
      </div>

      <div className="calc">
        <h2>Comment ce coût de minage est-il calculé ?</h2>
        <p>
          « Créer » un bitcoin = le faire miner. Tous les mineurs du monde dépensent de
          l&apos;électricité pour sécuriser le réseau et reçoivent en échange les nouveaux bitcoins.
          Le coût de création d&apos;un BTC est donc le coût électrique journalier du réseau divisé
          par le nombre de bitcoins minés dans la journée. Avec les valeurs actuelles :
        </p>
        <ol>
          <li>
            Puissance du réseau = hashrate × efficacité = <b>{nf(hashrateEH, 1)} EH/s</b> ×{" "}
            <b>{nf(efficiency)} J/TH</b> = <b>{nf(powerGW, 1)} GW</b>
          </li>
          <li>
            Énergie sur 24 h = <b>{nf(powerGW, 1)} GW</b> × 24 h = <b>{nf(dailyGWh)} GWh</b> (={" "}
            {nf(dailyKwh)} kWh)
          </li>
          <li>
            Coût électrique du réseau / jour = <b>{nf(dailyKwh)} kWh</b> ×{" "}
            <b>{fmt(elec, "USD", 3)}/kWh</b> = <b>{fmt(dailyElecUsd, "USD")}</b>
          </li>
          <li>
            Bitcoins minés / jour ≈ 144 blocs × <b>{SUBSIDY} BTC</b> = <b>{nf(btcPerDay)} BTC</b>
          </li>
          <li>
            Coût de création par BTC = <b>{fmt(dailyElecUsd, "USD")}</b> ÷ <b>{nf(btcPerDay)} BTC</b> ={" "}
            <span className="res">{fmt(costUsd, "USD")}</span>
            {currency === "CHF" && (
              <>
                {" "}
                = <span className="res">{fmt(costUsd * fx, "CHF")}</span> (taux du jour {fx.toFixed(4)})
              </>
            )}
          </li>
        </ol>
        <div className="formula">
          coût / BTC = (hashrate × efficacité × 24 h × prix électricité) ÷ (144 × subvention)
        </div>
        <p style={{ marginTop: 10 }}>
          La <b>courbe</b> sur le graphique applique cette même formule <b>jour par jour</b> : avec le
          hashrate <b>mesuré</b> de chaque jour et la subvention de l&apos;époque (le coût double à
          chaque halving). L&apos;efficacité et le prix de l&apos;électricité sont supposés constants —
          modifie-les pour redimensionner toute la courbe. Historiquement, le cours du BTC est rarement
          resté longtemps <em>sous</em> cette courbe : c&apos;est un « plancher mineurs ».
        </p>
      </div>
    </div>
  );
}
