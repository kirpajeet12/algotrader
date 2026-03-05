import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, AreaChart, Area, BarChart, Bar, Legend
} from "recharts";

// ─── ALGORITHM CORE ──────────────────────────────────────────────────────────

function calcSMA(data, period) {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const slice = data.slice(i - period + 1, i + 1);
    return slice.reduce((s, v) => s + v.close, 0) / period;
  });
}

function calcEMA(data, period) {
  const k = 2 / (period + 1);
  const result = [];
  let ema = null;
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    if (i === period - 1) {
      ema = data.slice(0, period).reduce((s, v) => s + v.close, 0) / period;
    } else {
      ema = data[i].close * k + ema * (1 - k);
    }
    result.push(parseFloat(ema.toFixed(4)));
  }
  return result;
}

function calcRSI(data, period = 14) {
  const result = Array(period).fill(null);
  for (let i = period; i < data.length; i++) {
    const slice = data.slice(i - period, i + 1);
    let gains = 0, losses = 0;
    for (let j = 1; j < slice.length; j++) {
      const d = slice[j].close - slice[j - 1].close;
      if (d > 0) gains += d; else losses -= d;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(parseFloat((100 - 100 / (1 + rs)).toFixed(2)));
  }
  return result;
}

function calcMACD(data) {
  const ema12 = calcEMA(data, 12);
  const ema26 = calcEMA(data, 26);
  const macdLine = data.map((_, i) =>
    ema12[i] != null && ema26[i] != null ? parseFloat((ema12[i] - ema26[i]).toFixed(4)) : null
  );
  const validMacd = macdLine.map((v, i) => ({ close: v ?? 0, i }));
  const signalRaw = calcEMA(validMacd.map(x => ({ close: x.close })), 9);
  const signal = macdLine.map((v, i) => v != null ? signalRaw[i] : null);
  const histogram = macdLine.map((v, i) =>
    v != null && signal[i] != null ? parseFloat((v - signal[i]).toFixed(4)) : null
  );
  return { macdLine, signal, histogram };
}

function generateSignals(data, ema20, ema50, rsi) {
  const signals = [];
  for (let i = 1; i < data.length; i++) {
    if (ema20[i] == null || ema50[i] == null || rsi[i] == null) continue;
    const prevCross = ema20[i - 1] - ema50[i - 1];
    const currCross = ema20[i] - ema50[i];
    if (prevCross <= 0 && currCross > 0 && rsi[i] < 70) {
      signals.push({ index: i, type: "BUY", price: data[i].close, date: data[i].date, rsi: rsi[i] });
    } else if (prevCross >= 0 && currCross < 0 && rsi[i] > 30) {
      signals.push({ index: i, type: "SELL", price: data[i].close, date: data[i].date, rsi: rsi[i] });
    }
  }
  return signals;
}

function backtest(data, signals) {
  let cash = 10000, shares = 0, trades = [];
  let position = null;
  for (const sig of signals) {
    if (sig.type === "BUY" && shares === 0) {
      shares = Math.floor(cash / sig.price);
      cash -= shares * sig.price;
      position = sig;
    } else if (sig.type === "SELL" && shares > 0) {
      const profit = shares * sig.price + cash - 10000;
      const pct = ((shares * sig.price + cash) / 10000 - 1) * 100;
      trades.push({ buy: position.date, sell: sig.date, buyPrice: position.price, sellPrice: sig.price, profit: parseFloat(profit.toFixed(2)), pct: parseFloat(pct.toFixed(2)) });
      cash += shares * sig.price;
      shares = 0;
      position = null;
    }
  }
  const finalValue = cash + shares * (data[data.length - 1]?.close ?? 0);
  return { trades, finalValue: parseFloat(finalValue.toFixed(2)), totalReturn: parseFloat(((finalValue / 10000 - 1) * 100).toFixed(2)) };
}

// ─── MOCK DATA GENERATOR ─────────────────────────────────────────────────────

function generateMockData(ticker, days = 180) {
  const seed = ticker.charCodeAt(0) + (ticker.charCodeAt(1) ?? 65);
  let price = 100 + seed * 2;
  const data = [];
  const start = new Date();
  start.setDate(start.getDate() - days);
  for (let i = 0; i < days; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    const vol = (Math.random() - 0.48) * 3;
    price = Math.max(10, price * (1 + vol / 100));
    data.push({
      date: date.toISOString().slice(0, 10),
      open: parseFloat((price * (1 - Math.random() * 0.01)).toFixed(2)),
      high: parseFloat((price * (1 + Math.random() * 0.015)).toFixed(2)),
      low: parseFloat((price * (1 - Math.random() * 0.015)).toFixed(2)),
      close: parseFloat(price.toFixed(2)),
      volume: Math.floor(500000 + Math.random() * 2000000),
    });
  }
  return data;
}

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

const TICKERS = ["AAPL", "TSLA", "NVDA", "MSFT", "AMZN", "META", "GOOGL", "AMD"];

const TAG = ({ type }) => (
  <span style={{
    padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: 1,
    background: type === "BUY" ? "rgba(0,255,136,0.15)" : "rgba(255,75,75,0.15)",
    color: type === "BUY" ? "#00ff88" : "#ff4b4b",
    border: `1px solid ${type === "BUY" ? "#00ff88" : "#ff4b4b"}33`,
  }}>{type}</span>
);

const Metric = ({ label, value, sub, color }) => (
  <div style={{ flex: 1, padding: "14px 16px", background: "#111318", borderRadius: 10, border: "1px solid #1e2130" }}>
    <div style={{ fontSize: 11, color: "#6b7280", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 800, color: color ?? "#e2e8f0", fontFamily: "'Space Mono', monospace" }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{sub}</div>}
  </div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0d1117", border: "1px solid #1e2130", borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
      <div style={{ color: "#94a3b8", marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color ?? "#e2e8f0" }}>
          {p.name}: <b>{typeof p.value === "number" ? p.value.toFixed(2) : p.value}</b>
        </div>
      ))}
    </div>
  );
};

// ─── AI ANALYSIS ──────────────────────────────────────────────────────────────

async function getAIAnalysis(ticker, totalReturn, trades, lastRSI, lastSignal, apiKey) {
  const prompt = `You are a quantitative analyst. Analyze this trading algorithm result for ${ticker}:
- Strategy: EMA 20/50 Crossover + RSI Filter
- Total Return: ${totalReturn}%
- Total Trades: ${trades.length}
- Last Signal: ${lastSignal}
- Current RSI: ${lastRSI}
- Win Rate: ${trades.length ? ((trades.filter(t => t.profit > 0).length / trades.length) * 100).toFixed(0) : 0}%

Give a SHORT 3-bullet analysis: market condition assessment, strategy performance, and one risk warning. Keep each bullet under 20 words. Format as bullet points with emoji.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content?.[0]?.text ?? "Analysis unavailable.";
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function TradingAlgo() {
  const [ticker, setTicker] = useState("AAPL");
  const [customTicker, setCustomTicker] = useState("");
  const [chartData, setChartData] = useState([]);
  const [signals, setSignals] = useState([]);
  const [result, setResult] = useState(null);
  const [rsiData, setRsiData] = useState([]);
  const [macdData, setMacdData] = useState([]);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [activeTab, setActiveTab] = useState("price");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  const run = useCallback((sym) => {
    const raw = generateMockData(sym);
    const ema20 = calcEMA(raw, 20);
    const ema50 = calcEMA(raw, 50);
    const rsi = calcRSI(raw);
    const { macdLine, signal, histogram } = calcMACD(raw);
    const sigs = generateSignals(raw, ema20, ema50, rsi);
    const bt = backtest(raw, sigs);

    const cd = raw.map((d, i) => ({
      ...d,
      ema20: ema20[i],
      ema50: ema50[i],
      signal: sigs.find(s => s.index === i)?.type ?? null,
    }));
    setChartData(cd);
    setSignals(sigs);
    setResult(bt);
    setRsiData(raw.map((d, i) => ({ date: d.date, rsi: rsi[i] })));
    setMacdData(raw.map((d, i) => ({ date: d.date, macd: macdLine[i], signal: signal[i], hist: histogram[i] })));
    setAiText("");
    setAiError("");
  }, []);

  useEffect(() => { run(ticker); }, [ticker, run]);

  const handleAI = async () => {
    if (!result) return;
    if (!apiKey.trim()) {
      setAiError("Please enter your Anthropic API key above to use AI analysis.");
      return;
    }
    setAiLoading(true);
    setAiError("");
    try {
      const lastRSI = rsiData.filter(r => r.rsi != null).slice(-1)[0]?.rsi ?? 50;
      const lastSig = signals.slice(-1)[0]?.type ?? "None";
      const text = await getAIAnalysis(ticker, result.totalReturn, result.trades, lastRSI, lastSig, apiKey);
      setAiText(text);
    } catch (e) {
      setAiError(`Error: ${e.message}`);
    }
    setAiLoading(false);
  };

  const winRate = result?.trades.length
    ? ((result.trades.filter(t => t.profit > 0).length / result.trades.length) * 100).toFixed(0)
    : 0;

  const lastSignal = signals[signals.length - 1];

  return (
    <div style={{
      minHeight: "100vh", background: "#080b10", color: "#e2e8f0",
      fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif",
      padding: "0 0 60px",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=IBM+Plex+Sans:wght@300;400;600;700&display=swap" rel="stylesheet" />

      {/* HEADER */}
      <div style={{
        borderBottom: "1px solid #1a1f2e",
        padding: "18px 32px",
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
        background: "linear-gradient(180deg, #0a0e17 0%, #080b10 100%)",
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5, color: "#fff" }}>
            AlgoTrader <span style={{ color: "#00d4ff", fontFamily: "'Space Mono', monospace" }}>v1</span>
          </div>
          <div style={{ fontSize: 11, color: "#4b5563", marginTop: 1 }}>EMA CROSSOVER · RSI FILTER · MACD CONFIRMATION</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TICKERS.map(t => (
            <button key={t} onClick={() => setTicker(t)} style={{
              padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer",
              background: ticker === t ? "#00d4ff22" : "transparent",
              color: ticker === t ? "#00d4ff" : "#6b7280",
              border: `1px solid ${ticker === t ? "#00d4ff44" : "#1e2130"}`,
              transition: "all .15s",
            }}>{t}</button>
          ))}
          <input
            value={customTicker}
            onChange={e => setCustomTicker(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === "Enter" && customTicker) { setTicker(customTicker); setCustomTicker(""); } }}
            placeholder="CUSTOM"
            style={{
              padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700,
              background: "#111318", color: "#e2e8f0", border: "1px solid #1e2130",
              width: 100, outline: "none",
            }}
          />
        </div>
      </div>

      <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* METRICS ROW */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Metric label="Ticker" value={ticker} sub="Simulated OHLCV data" />
          <Metric
            label="Total Return"
            value={`${result?.totalReturn > 0 ? "+" : ""}${result?.totalReturn ?? 0}%`}
            sub={`$10,000 → $${result?.finalValue?.toLocaleString()}`}
            color={result?.totalReturn >= 0 ? "#00ff88" : "#ff4b4b"}
          />
          <Metric label="Total Trades" value={result?.trades.length ?? 0} sub="Round trips" />
          <Metric label="Win Rate" value={`${winRate}%`} sub={`${result?.trades.filter(t => t.profit > 0).length ?? 0} winning trades`} color={winRate >= 50 ? "#00ff88" : "#ff4b4b"} />
          <Metric
            label="Last Signal"
            value={lastSignal?.type ?? "—"}
            sub={lastSignal ? `@ $${lastSignal.price} · RSI ${lastSignal.rsi}` : "No signal yet"}
            color={lastSignal?.type === "BUY" ? "#00ff88" : "#ff4b4b"}
          />
        </div>

        {/* TABS */}
        <div style={{ display: "flex", gap: 2, borderBottom: "1px solid #1a1f2e" }}>
          {["price", "rsi", "macd", "trades"].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: "8px 18px", fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
              textTransform: "uppercase", cursor: "pointer", border: "none",
              background: "transparent",
              color: activeTab === tab ? "#00d4ff" : "#4b5563",
              borderBottom: `2px solid ${activeTab === tab ? "#00d4ff" : "transparent"}`,
              transition: "all .15s",
            }}>{tab}</button>
          ))}
        </div>

        {/* PRICE CHART */}
        {activeTab === "price" && (
          <div style={{ background: "#0d1117", borderRadius: 12, border: "1px solid #1e2130", padding: "20px 16px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: "#94a3b8" }}>
              Price · EMA 20 · EMA 50 · Buy/Sell Signals
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#4b5563" }} tickLine={false} interval={20} />
                <YAxis tick={{ fontSize: 10, fill: "#4b5563" }} tickLine={false} width={60} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="close" stroke="#00d4ff" strokeWidth={1.5} fill="url(#priceGrad)" dot={false} name="Close" />
                <Line type="monotone" dataKey="ema20" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="EMA 20" />
                <Line type="monotone" dataKey="ema50" stroke="#8b5cf6" strokeWidth={1.5} dot={false} name="EMA 50" />
                {signals.map((s, i) => (
                  <ReferenceLine key={i} x={s.date} stroke={s.type === "BUY" ? "#00ff88" : "#ff4b4b"} strokeDasharray="4 2" strokeWidth={1} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", gap: 20, marginTop: 12, fontSize: 11, color: "#6b7280" }}>
              <span style={{ color: "#00d4ff" }}>── Price</span>
              <span style={{ color: "#f59e0b" }}>── EMA 20</span>
              <span style={{ color: "#8b5cf6" }}>── EMA 50</span>
              <span style={{ color: "#00ff88" }}>| BUY</span>
              <span style={{ color: "#ff4b4b" }}>| SELL</span>
            </div>
          </div>
        )}

        {/* RSI CHART */}
        {activeTab === "rsi" && (
          <div style={{ background: "#0d1117", borderRadius: 12, border: "1px solid #1e2130", padding: "20px 16px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: "#94a3b8" }}>RSI (14) — Overbought: 70 · Oversold: 30</div>
            <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 16 }}>Buy when RSI &lt; 70 (not overbought) · Sell when RSI &gt; 30 (not oversold)</div>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={rsiData}>
                <defs>
                  <linearGradient id="rsiGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#4b5563" }} tickLine={false} interval={20} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#4b5563" }} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={70} stroke="#ff4b4b" strokeDasharray="4 2" label={{ value: "OB 70", fill: "#ff4b4b", fontSize: 10 }} />
                <ReferenceLine y={30} stroke="#00ff88" strokeDasharray="4 2" label={{ value: "OS 30", fill: "#00ff88", fontSize: 10 }} />
                <Area type="monotone" dataKey="rsi" stroke="#8b5cf6" fill="url(#rsiGrad)" strokeWidth={2} dot={false} name="RSI" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* MACD CHART */}
        {activeTab === "macd" && (
          <div style={{ background: "#0d1117", borderRadius: 12, border: "1px solid #1e2130", padding: "20px 16px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: "#94a3b8" }}>MACD (12, 26, 9) — Momentum Confirmation</div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={macdData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#4b5563" }} tickLine={false} interval={20} />
                <YAxis tick={{ fontSize: 10, fill: "#4b5563" }} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0} stroke="#2d3748" />
                <Bar dataKey="hist" name="Histogram" fill="#00d4ff" opacity={0.6} />
                <Line type="monotone" dataKey="macd" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="MACD" />
                <Line type="monotone" dataKey="signal" stroke="#ff4b4b" strokeWidth={1.5} dot={false} name="Signal" />
                <Legend wrapperStyle={{ fontSize: 11, color: "#6b7280" }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* TRADES TABLE */}
        {activeTab === "trades" && (
          <div style={{ background: "#0d1117", borderRadius: 12, border: "1px solid #1e2130", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #1a1f2e", fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>
              Trade History · $10,000 starting capital
            </div>
            {result?.trades.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "#4b5563" }}>No completed trades in this period.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1a1f2e" }}>
                    {["#", "Buy Date", "Buy Price", "Sell Date", "Sell Price", "P&L", "Return"].map(h => (
                      <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "#4b5563", fontWeight: 600, letterSpacing: 0.5 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.trades.map((t, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #111318" }}>
                      <td style={{ padding: "10px 16px", color: "#6b7280" }}>{i + 1}</td>
                      <td style={{ padding: "10px 16px", color: "#94a3b8" }}>{t.buy}</td>
                      <td style={{ padding: "10px 16px", fontFamily: "'Space Mono', monospace" }}>${t.buyPrice}</td>
                      <td style={{ padding: "10px 16px", color: "#94a3b8" }}>{t.sell}</td>
                      <td style={{ padding: "10px 16px", fontFamily: "'Space Mono', monospace" }}>${t.sellPrice}</td>
                      <td style={{ padding: "10px 16px", fontFamily: "'Space Mono', monospace", color: t.profit >= 0 ? "#00ff88" : "#ff4b4b" }}>
                        {t.profit >= 0 ? "+" : ""}${t.profit}
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        <TAG type={t.pct >= 0 ? "BUY" : "SELL"} />
                        <span style={{ marginLeft: 8, fontFamily: "'Space Mono', monospace", fontSize: 11, color: t.pct >= 0 ? "#00ff88" : "#ff4b4b" }}>
                          {t.pct >= 0 ? "+" : ""}{t.pct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* STRATEGY + AI SECTION */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 280, background: "#0d1117", borderRadius: 12, border: "1px solid #1e2130", padding: "20px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: "#00d4ff" }}>Algorithm Logic</div>
            {[
              { step: "1", label: "Data Source", desc: "Simulated OHLCV · integrate yfinance Python backend for real data" },
              { step: "2", label: "Entry Signal", desc: "EMA 20 crosses ABOVE EMA 50 AND RSI < 70" },
              { step: "3", label: "Exit Signal", desc: "EMA 20 crosses BELOW EMA 50 AND RSI > 30" },
              { step: "4", label: "Confirmation", desc: "MACD histogram direction as secondary filter" },
              { step: "5", label: "Position Size", desc: "100% of capital per trade (full position)" },
            ].map(s => (
              <div key={s.step} style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-start" }}>
                <div style={{
                  width: 22, height: 22, borderRadius: "50%", background: "#00d4ff22",
                  border: "1px solid #00d4ff44", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 800, color: "#00d4ff", flexShrink: 0, marginTop: 1
                }}>{s.step}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* AI ANALYSIS */}
          <div style={{ flex: 3, minWidth: 280, background: "#0d1117", borderRadius: 12, border: "1px solid #1e2130", padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#8b5cf6" }}>AI Analysis (Claude)</div>
              <button onClick={handleAI} disabled={aiLoading} style={{
                padding: "7px 18px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: aiLoading ? "#1a1f2e" : "linear-gradient(135deg, #7c3aed, #4f46e5)",
                color: "#fff", border: "none", opacity: aiLoading ? 0.7 : 1,
              }}>
                {aiLoading ? "Analyzing..." : "Run AI Analysis"}
              </button>
            </div>

            {/* API KEY INPUT */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 6 }}>
                Anthropic API Key — required for AI analysis (stored in memory only, never sent elsewhere)
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  style={{
                    flex: 1, padding: "7px 12px", borderRadius: 6, fontSize: 12,
                    background: "#111318", color: "#e2e8f0", border: "1px solid #1e2130",
                    outline: "none", fontFamily: "'Space Mono', monospace",
                  }}
                />
                <button onClick={() => setShowApiKey(v => !v)} style={{
                  padding: "7px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                  background: "#111318", color: "#6b7280", border: "1px solid #1e2130",
                }}>
                  {showApiKey ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {aiError && (
              <div style={{ fontSize: 12, color: "#ff4b4b", marginBottom: 12, padding: "8px 12px", background: "#ff4b4b11", borderRadius: 6, border: "1px solid #ff4b4b22" }}>
                {aiError}
              </div>
            )}

            {aiText ? (
              <div style={{ fontSize: 13, lineHeight: 1.8, color: "#cbd5e1", whiteSpace: "pre-wrap" }}>{aiText}</div>
            ) : (
              <div style={{ color: "#4b5563", fontSize: 13, paddingTop: 4 }}>
                Enter your API key and click <b style={{ color: "#8b5cf6" }}>Run AI Analysis</b> to get Claude's read on <b style={{ color: "#e2e8f0" }}>{ticker}</b>.
              </div>
            )}
          </div>
        </div>

        {/* FOOTER */}
        <div style={{ fontSize: 11, color: "#374151", textAlign: "center", paddingTop: 4 }}>
          Educational use only. Not financial advice. Data is simulated for demo purposes.
        </div>
      </div>
    </div>
  );
}
