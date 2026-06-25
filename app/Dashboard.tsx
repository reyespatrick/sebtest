"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, LineStyle } from "lightweight-charts";
import {
  aggregate,
  toCandles,
  toLine,
  latestClose,
  miningCostUsd,
  type Row,
  type BusinessDay,
  type Timeframe,
} from "./btc";

type Currency = "USD" | "CHF";
type ChartType = "candles" | "line";

type Props = { initialDaily: Row[]; hashrateHs: number; fx: number };

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

export default function Dashboard({ initialDaily, hashrateHs, fx: fx0 }: Props) {
  const [currency, setCurrency] = useState<Currency>("USD");
  const [timeframe, setTimeframe] = useState<Timeframe>("weekly");
  const [chartType, setChartType] = useState<ChartType>("candles");

  const [elec, setElec] = useState(0.06); // USD/kWh
  const [efficiency, setEfficiency] = useState(25); // J/TH
  const [hashrateEH, setHashrateEH] = useState(Math.round((hashrateHs / 1e18) * 10) / 10);

  // Données fournies par le serveur : présentes dès le premier rendu.
  const [rows] = useState<Row[]>(initialDaily);
  const [fx] = useState(fx0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceSeriesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const costSeriesRef = useRef<any>(null);
  const rangeRef = useRef<{ first: BusinessDay; last: BusinessDay } | null>(null);

  const curMult = currency === "CHF" ? fx : 1;

  // --- Décomposition du calcul du coût de minage (en USD), étape par étape ---
  const hashThs = hashrateEH * 1e6; // EH/s -> TH/s
  const powerW = hashThs * efficiency; // J/TH * TH/s = W
  const powerGW = powerW / 1e9;
  const dailyKwh = (powerW / 1000) * 24;
  const dailyGWh = dailyKwh / 1e6;
  const dailyElecUsd = dailyKwh * elec;
  const btcPerDay = 144 * SUBSIDY;
  const costUsd = miningCostUsd({
    hashrateHs: hashrateEH * 1e18,
    efficiency,
    elecUsdKwh: elec,
    subsidy: SUBSIDY,
  });
  const costDisp = costUsd * curMult;
  const costDispRef = useRef(costDisp);
  costDispRef.current = costDisp;

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

  // (Re)construction des séries selon période / type / devise
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (priceSeriesRef.current) chart.removeSeries(priceSeriesRef.current);
    if (costSeriesRef.current) chart.removeSeries(costSeriesRef.current);

    const agg = aggregate(rows, timeframe);

    // Série de prix (bougies ou ligne)
    let priceData: { time: BusinessDay }[];
    let priceSeries;
    if (chartType === "candles") {
      priceSeries = chart.addCandlestickSeries({
        upColor: "#1a8f68",
        downColor: "#e24b4a",
        wickUpColor: "#1a8f68",
        wickDownColor: "#e24b4a",
        borderVisible: false,
      });
      const data = toCandles(agg, curMult);
      priceSeries.setData(data);
      priceData = data;
    } else {
      priceSeries = chart.addLineSeries({ color: "#5b51d8", lineWidth: 2 });
      const data = toLine(agg, curMult);
      priceSeries.setData(data);
      priceData = data;
    }
    priceSeriesRef.current = priceSeries;

    // Ligne du coût de minage : horizontale, traverse tout le graphique
    const first = priceData[0]?.time;
    const last = priceData[priceData.length - 1]?.time;
    rangeRef.current = first && last ? { first, last } : null;

    const costSeries = chart.addLineSeries({
      color: "#c2820f",
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      lastValueVisible: true,
      title: "Coût minage",
    });
    if (first && last) {
      costSeries.setData([
        { time: first, value: costDispRef.current },
        { time: last, value: costDispRef.current },
      ]);
    }
    costSeriesRef.current = costSeries;

    chart.timeScale().fitContent();
  }, [rows, timeframe, chartType, curMult]);

  // Mise à jour de la ligne de coût quand les hypothèses (ou la devise) changent
  useEffect(() => {
    const s = costSeriesRef.current;
    const r = rangeRef.current;
    if (s && r) {
      s.setData([
        { time: r.first, value: costDisp },
        { time: r.last, value: costDisp },
      ]);
    }
  }, [costDisp]);

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
              <span className="dash" /> Coût de minage (Chine) · {fmt(costDisp, currency)}
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
            <label>Hashrate réseau</label>
            <span>
              <input
                type="number"
                step="10"
                min="1"
                value={hashrateEH}
                onChange={(e) => setHashrateEH(parseFloat(e.target.value) || 0)}
              />{" "}
              EH/s
            </span>
          </div>
          <div className="row">
            <label>Subvention bloc</label>
            <span className="static">{SUBSIDY} BTC</span>
          </div>

          <div className="cost">
            <div className="l">Coût de création / BTC</div>
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
          par le nombre de bitcoins minés dans la journée. Avec les hypothèses actuelles :
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
          Tous les paramètres (prix de l&apos;électricité, efficacité des machines, hashrate) sont
          modifiables dans le panneau ci-dessus : le calcul et la ligne sur le graphique se mettent à
          jour en direct.
        </p>
      </div>
    </div>
  );
}
