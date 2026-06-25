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
  const seriesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceLineRef = useRef<any>(null);

  const mult = currency === "CHF" ? fx : 1;
  const costUsd = miningCostUsd({
    hashrateHs: hashrateEH * 1e18,
    efficiency,
    elecUsdKwh: elec,
    subsidy: SUBSIDY,
  });
  const costDisp = costUsd * mult;
  const costDispRef = useRef(costDisp);
  costDispRef.current = costDisp;

  const latestUsd = latestClose(rows);
  const latestDisp = latestUsd * mult;
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
      seriesRef.current = null;
      priceLineRef.current = null;
    };
  }, []);

  // (Re)construction de la série selon période / type / devise
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (seriesRef.current) {
      chart.removeSeries(seriesRef.current);
      seriesRef.current = null;
      priceLineRef.current = null;
    }

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
      series.setData(toCandles(agg, mult));
    } else {
      series = chart.addLineSeries({ color: "#5b51d8", lineWidth: 2 });
      series.setData(toLine(agg, mult));
    }
    seriesRef.current = series;

    priceLineRef.current = series.createPriceLine({
      price: costDispRef.current,
      color: "#c2820f",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "Coût minage",
    });

    chart.timeScale().fitContent();
  }, [rows, timeframe, chartType, mult]);

  // Mise à jour de la ligne de coût de minage quand les hypothèses changent
  useEffect(() => {
    if (priceLineRef.current) {
      priceLineRef.current.applyOptions({ price: costDisp });
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

          <p className="note">
            Estimation = (hashrate × efficacité × 24 h × prix électricité) ÷ (144 blocs × subvention).
            Taux USD/CHF du jour : {fx.toFixed(4)}.
          </p>
        </div>
      </div>
    </div>
  );
}
