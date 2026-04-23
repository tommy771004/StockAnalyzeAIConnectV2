import React from "react";
import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  memo,
  lazy,
  Suspense,
} from "react";
import { motion } from "motion/react";
import {
  TrendingUp,
  TrendingDown,
  AlertCircle,
  BrainCircuit,
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
  Zap,
  RefreshCw,
} from "lucide-react";
import { cn } from "../lib/utils";
import * as api from "../services/api";
import ChartWidget from "./ChartWidget";
import { PerformanceSummary } from "./PerformanceSummary";
import { StatusIndicator3D } from "./StatusIndicator3D";
import {
  Quote,
  HistoricalData,
  AIAnalysisResult,
  SentimentData,
  Trade,
} from "../types";
import { useSettings } from "../contexts/SettingsContext";

const MemoizedChartWidget = memo(ChartWidget);

const PaperTradingDashboard = lazy(() => import("./PaperTradingDashboard"));
const StrategyComparison = lazy(() => import("./StrategyComparison"));
const LiveTradingConsole = lazy(() => import("./LiveTradingConsole"));
import { analyzeStock, analyzeSentiment } from "../services/aiService";
import { isMarketHours } from "../services/cache";
import {
  calculateRSI,
  calculateMACD,
  calcSMA,
  calculateKD,
  calculateVWAP,
} from "../lib/indicators";

type FetchStatus = "loading" | "refreshing" | "idle" | "error";
type AiStatus = "idle" | "analyzing" | "sentiment" | "done";

export default function Dashboard({
  model,
  symbol,
}: {
  model: string;
  symbol: string;
}) {
  const { settings, format } = useSettings();
  const compact = settings.compactMode;
  const [quote, setQuote] = useState<Quote | null>(null);
  const [historicalData, setHistoricalData] = useState<HistoricalData[]>([]);
  const [marketData, setMarketData] = useState<Partial<Quote>[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);
  const [sentimentAnalysis, setSentimentAnalysis] =
    useState<SentimentData | null>(null);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>("loading");
  const [aiStatus, setAiStatus] = useState<AiStatus>("idle");
  const [timeframe, setTimeframe] = useState("1Y");
  const analyzingRef = useRef(false);

  const fetchData = useCallback(
    async (quiet = false, selectedTimeframe = timeframe) => {
      setFetchStatus(quiet ? "refreshing" : "loading");
      try {
        let period1 = "";
        let interval = "1d";
        const now = new Date();

        switch (selectedTimeframe) {
          case "1D":
            now.setDate(now.getDate() - 1);
            period1 = now.toISOString().split("T")[0];
            interval = "1m";
            break;
          case "5D":
            now.setDate(now.getDate() - 5);
            period1 = now.toISOString().split("T")[0];
            interval = "5m";
            break;
          case "1M":
            now.setMonth(now.getMonth() - 1);
            period1 = now.toISOString().split("T")[0];
            interval = "1h";
            break;
          case "6M":
            now.setMonth(now.getMonth() - 6);
            period1 = now.toISOString().split("T")[0];
            interval = "1d";
            break;
          case "YTD":
            period1 = `${now.getFullYear()}-01-01`;
            interval = "1d";
            break;
          case "1Y":
          default:
            now.setFullYear(now.getFullYear() - 1);
            period1 = now.toISOString().split("T")[0];
            interval = "1d";
            break;
        }

        const [quoteData, historyData, mData, tradesData] = await Promise.all([
          api.getQuote(symbol),
          api.getHistory(symbol, { period1, interval }),
          fetch(`/api/market-summary?symbol=${symbol}`)
            .then((r) => r.json())
            .catch(() => []),
          api.getTrades(),
        ]);

        if (quoteData) setQuote(quoteData);
        setHistoricalData(Array.isArray(historyData) ? historyData : []);
        setMarketData(Array.isArray(mData) ? mData : []);
        setRecentTrades(
          Array.isArray(tradesData) ? tradesData.slice(0, 5) : [],
        );
        setFetchStatus("idle");
      } catch (error) {
        console.error("Error fetching data:", error);
        setFetchStatus("error");
      }
    },
    [symbol, timeframe],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // polling for "very timely updates" during market hours
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    
    const setupInterval = () => {
      if (interval) clearInterval(interval);
      const isMarketOpen = isMarketHours();
      const delay = isMarketOpen ? 15000 : 300000; // 15s during market, 5m outside
      
      interval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchData(true);
        }
      }, delay);
    };

    setupInterval();
    // Re-check every 5 minutes if market has opened/closed to adjust frequency
    const checker = setInterval(setupInterval, 300000);

    return () => {
      clearInterval(interval);
      clearInterval(checker);
    };
  }, [fetchData]);

  useEffect(() => {
    let mounted = true;
    const runAnalysis = async () => {
      if (
        !quote ||
        !historicalData.length ||
        !marketData.length ||
        analyzingRef.current
      )
        return;

      try {
        analyzingRef.current = true;
        if (mounted) setAiStatus("analyzing");
        // Vercel react-best-practices: async-parallel — run independent AI calls concurrently
        const [analysis, sentiment] = await Promise.all([
          analyzeStock(symbol, quote, historicalData, model),
          analyzeSentiment(
            marketData,
            model,
            String(settings.systemInstruction || ""),
          ),
        ]);
        if (mounted) {
          setAiAnalysis(analysis);
          setSentimentAnalysis(sentiment);
          setAiStatus("done");
        }
      } catch (error) {
        console.error("Error running AI analysis:", error);
        if (mounted) setAiStatus("idle");
      } finally {
        analyzingRef.current = false;
      }
    };

    const handler = setTimeout(runAnalysis, 500);
    return () => {
      mounted = false;
      clearTimeout(handler);
    };
  }, [
    symbol,
    model,
    quote,
    historicalData,
    marketData,
    settings.systemInstruction,
  ]);

  const indicators = useMemo(() => {
    if (!Array.isArray(historicalData) || historicalData.length === 0)
      return null;

    // Calculate indicators
    const toNum = (v: unknown) => {
      const n = Number(v);
      return isFinite(n) ? n : 0;
    };
    const closes = historicalData.map((d) => toNum(d?.close));
    const highs = historicalData.map((d) => toNum(d?.high));
    const lows = historicalData.map((d) => toNum(d?.low));

    const rsiArr = calculateRSI(closes);
    const macdArr = calculateMACD(closes);
    const sma20Arr = calcSMA(closes, 20);
    const sma50Arr = calcSMA(closes, 50);

    const rsi = rsiArr?.at(-1);
    const macd = macdArr?.at(-1);
    const sma20 = sma20Arr?.at(-1);
    const sma50 = sma50Arr?.at(-1);
    const currentPrice = quote?.regularMarketPrice ?? closes?.at(-1) ?? 0;

    // Simple strategy logic
    let score = 0;
    if (rsi !== undefined && rsi !== null) {
      if (rsi < 30) score += 2;
      else if (rsi < 40) score += 1;
      else if (rsi > 70) score -= 2;
      else if (rsi > 60) score -= 1;
    }
    if (macd?.histogram !== undefined && macd?.histogram !== null) {
      if (macd.histogram > 0) score += 1;
      else if (macd.histogram < 0) score -= 1;
    }
    if (sma20 && sma50) {
      if (currentPrice > (sma20 ?? 0) && (sma20 ?? 0) > (sma50 ?? 0)) score += 2;
      else if (currentPrice < (sma20 ?? 0) && (sma20 ?? 0) < (sma50 ?? 0)) score -= 2;
    }

    const suggestion =
      score >= 3
        ? "強力買進 (Strong Buy)"
        : score >= 1
          ? "買進 (Buy)"
          : score <= -3
            ? "強力賣出 (Strong Sell)"
            : score <= -1
              ? "賣出 (Sell)"
              : "觀望 (Neutral)";

    const suggestionColor =
      score >= 1 ? "text-emerald-400" : score <= -1 ? "text-rose-400" : "text-amber-400";

    return {
      rsi: rsi !== undefined ? format.number(rsi, 1) : "-",
      rsiStatus: (rsi !== undefined
        ? rsi > 70
          ? "bearish"
          : rsi < 30
            ? "bullish"
            : "neutral"
        : "neutral") as "bullish" | "bearish" | "neutral",
      rsiLabel:
        rsi !== undefined
          ? rsi > 70
            ? "超買區 (Overbought)"
            : rsi < 30
              ? "超賣區 (Oversold)"
              : "中性區間 (Neutral)"
          : "-",

      macd: macd?.MACD !== undefined ? format.number(macd.MACD, 2) : "-",
      macdStatus: (macd?.histogram !== undefined
        ? macd.histogram > 0
          ? "bullish"
          : "bearish"
        : "neutral") as "bullish" | "bearish" | "neutral",
      macdLabel:
        macd?.histogram !== undefined
          ? macd.histogram > 0
            ? "多頭排列 (Bullish)"
            : "空頭排列 (Bearish)"
          : "-",

      sma20: sma20 ? format.number(sma20, 2) : "-",
      sma20Status: (sma20 && currentPrice > sma20 ? "bullish" : "bearish") as
        | "bullish"
        | "bearish"
        | "neutral",
      sma20Label:
        sma20 && currentPrice > sma20 ? "價格 > SMA20" : "價格 < SMA20",

      sma50: sma50 ? format.number(sma50, 2) : "-",
      sma50Status: (sma50 && currentPrice > sma50 ? "bullish" : "bearish") as
        | "bullish"
        | "bearish"
        | "neutral",
      sma50Label:
        sma50 && currentPrice > sma50 ? "價格 > SMA50" : "價格 < SMA50",

      suggestion,
      suggestionColor,
    };
  }, [historicalData, quote, format]);

  const isUp = (quote?.regularMarketChange ?? 0) >= 0;

  const exportToCSV = (data: HistoricalData[], filename: string) => {
    const csvContent =
      "data:text/csv;charset=utf-8," +
      ["Date,Open,High,Low,Close,Volume"]
        .concat(
          data.map(
            (r) =>
              `${r.date},${r.open},${r.high},${r.low},${r.close},${r.volume}`,
          ),
        )
        .join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${filename}.csv`);
    document.body.appendChild(link);
    try {
      link.click();
    } finally {
      document.body.removeChild(link);
    }
  };

  if (fetchStatus === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-zinc-900/50 rounded-3xl border border-zinc-800">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-zinc-100 mb-2">連線異常</h2>
        <p className="text-zinc-400 mb-6 max-w-md">
          無法取得 {symbol} 的市場資料，請檢查網路連線或稍後再試。
        </p>
        <button
          type="button"
          onClick={(e) => {}}
          className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl font-medium transition-colors flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          重新整理
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col gap-6 h-full pb-10"
    >
      {/* Main Content Area */}
      <div className={cn("grid grid-cols-12", compact ? "gap-4" : "gap-6")}>
        {/* Left Column - Main Chart & Indicators */}
        <div
          className={cn(
            "col-span-12 lg:col-span-8 flex flex-col",
            compact ? "gap-4" : "gap-6",
            "h-full",
          )}
        >
          <div className="shrink-0">
            <PerformanceSummary trades={recentTrades} />
          </div>
            <div
              className={cn(
                "flex flex-col flex-1 min-h-[450px] md:min-h-[600px] liquid-glass-strong rounded-[2.5rem] border border-zinc-800 bg-zinc-950/40 overflow-hidden shadow-2xl relative",
                compact ? "p-0.5" : "p-1.5",
              )}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.05] to-transparent pointer-events-none" />
              <div
                className={cn(
                  "flex items-center justify-between relative z-10 flex-wrap gap-4 border-b border-white/5",
                  compact ? "p-4" : "p-5 md:p-7",
                )}
              >
                <div className="flex items-center gap-4 md:gap-8 min-w-0">
                  <div
                    className={cn(
                      "rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shadow-inner group",
                      compact ? "w-12 h-12" : "w-14 h-14 md:w-20 md:h-20",
                    )}
                  >
                    <Zap
                      className={cn(
                        "text-indigo-400 group-hover:scale-110 transition-transform duration-500",
                        compact ? "w-6 h-6" : "w-7 h-7 md:w-10 md:h-10",
                      )}
                    />
                  </div>
                  <div className="min-w-0">
                    <h3
                      className={cn(
                        "font-black text-white tracking-tighter truncate filter drop-shadow-md",
                        compact ? "text-xl" : "text-2xl md:text-4xl",
                      )}
                    >
                      {quote?.shortName || symbol}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-zinc-400 text-xs md:text-base font-bold truncate opacity-80">
                        {quote?.longName || symbol}
                      </p>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-zinc-800 text-zinc-500 border border-zinc-700/50">
                        {symbol}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => fetchData(true)}
                      disabled={fetchStatus === "refreshing"}
                      className={cn(
                        "rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all active:scale-95 shadow-lg",
                        compact ? "p-2.5" : "p-3 md:p-4",
                      )}
                    >
                      <Loader2
                        className={cn(
                          "w-6 h-6",
                          fetchStatus === "refreshing" && "animate-spin text-indigo-400",
                        )}
                      />
                    </button>

                    {fetchStatus === "refreshing" && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="hidden md:flex items-center gap-2 px-4 py-2 rounded-2xl bg-indigo-500/10 border border-indigo-500/20"
                      >
                        <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                        <span className="text-xs font-black text-indigo-400 uppercase tracking-widest leading-none">
                          Real-time
                        </span>
                      </motion.div>
                    )}
                  </div>
                </div>

                <div className="text-right flex flex-col justify-center">
                  <div
                    className={cn(
                      "font-mono font-black text-white tracking-tighter leading-none mb-1",
                      compact ? "text-3xl" : "text-4xl md:text-6xl",
                    )}
                  >
                    {quote ? format.price(quote.regularMarketPrice ?? 0) : "---"}
                  </div>
                  {quote && (
                    <div
                      className={cn(
                        "text-base md:text-xl font-mono font-black flex items-center justify-end gap-2",
                        isUp ? "text-emerald-400" : "text-rose-400",
                      )}
                    >
                      <div className={cn(
                        "px-2 py-0.5 rounded-lg flex items-center",
                        isUp ? "bg-emerald-500/10" : "bg-rose-500/10"
                      )}>
                        {isUp ? (
                          <TrendingUp className="w-5 h-5 mr-1" />
                        ) : (
                          <TrendingDown className="w-5 h-5 mr-1" />
                        )}
                        <span>
                          {format.number(quote.regularMarketChange ?? 0, 2)}
                        </span>
                      </div>
                      <span className="opacity-80">
                        ({format.percent(quote.regularMarketChangePercent ?? 0)})
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1 w-full relative z-10">
                <MemoizedChartWidget
                  data={historicalData}
                  symbol={symbol}
                  onTimeframeChange={(t) => {
                    setTimeframe(t);
                    fetchData(true, t);
                  }}
                />
              </div>
            </div>

          {/* Technical Indicators Grid - Compact */}
          <div className="-mx-4 px-4 md:mx-0 md:px-0">
            <div
              className={cn(
                "flex md:grid md:grid-cols-4 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-2",
                compact ? "gap-2" : "gap-4",
              )}
            >
              <div className="snap-start shrink-0 w-[42%] md:w-auto">
                <IndicatorCard
                  title="RSI (14)"
                  value={indicators?.rsi ?? "-"}
                  status={indicators?.rsiStatus ?? "neutral"}
                  label={indicators?.rsiLabel ?? "-"}
                />
              </div>
              <div className="snap-start shrink-0 w-[42%] md:w-auto">
                <IndicatorCard
                  title="MACD"
                  value={indicators?.macd ?? "-"}
                  status={indicators?.macdStatus ?? "neutral"}
                  label={indicators?.macdLabel ?? "-"}
                />
              </div>
              <div className="snap-start shrink-0 w-[42%] md:w-auto">
                <IndicatorCard
                  title="SMA (20)"
                  value={indicators?.sma20 ?? "-"}
                  status={indicators?.sma20Status ?? "neutral"}
                  label={indicators?.sma20Label ?? "-"}
                />
              </div>
              <div className="snap-start shrink-0 w-[42%] md:w-auto">
                <IndicatorCard
                  title="SMA (50)"
                  value={indicators?.sma50 ?? "-"}
                  status={indicators?.sma50Status ?? "neutral"}
                  label={indicators?.sma50Label ?? "-"}
                />
              </div>
            </div>
          </div>

          {/* Recent Trades Section */}
          <div
            className={cn(
              "liquid-glass-strong rounded-[2rem] border border-zinc-800 bg-zinc-900/50 shadow-xl overflow-hidden",
              compact ? "p-4" : "p-6",
            )}
          >
            <h3
              className={cn(
                "font-black text-zinc-100 flex items-center gap-2 uppercase tracking-widest",
                compact ? "text-xs mb-4" : "text-sm mb-6",
              )}
            >
              <Activity className="text-emerald-400" size={compact ? 14 : 16} />{" "}
              最近交易記錄
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-zinc-500 border-b border-zinc-800 font-black uppercase tracking-widest">
                    <th className="px-4 py-3">日期</th>
                    <th className="px-4 py-3">標的</th>
                    <th className="px-4 py-3">動作</th>
                    <th className="px-4 py-3 text-right">進場</th>
                    <th className="px-4 py-3 text-right">出場</th>
                    <th className="px-4 py-3 text-right">損益</th>
                    <th className="px-4 py-3">狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTrades.length > 0 ? (
                    recentTrades.map((t) => (
                      <TradeRow
                        key={t.id ?? `${t.date}-${t.ticker}-${t.entry}`}
                        date={t.date?.slice(0, 10) || "-"}
                        ticker={t.ticker ?? t.symbol ?? "-"}
                        action={
                          t.action?.includes("Buy") || t.action === "BUY"
                            ? "Buy Long"
                            : "Sell Short"
                        }
                        entry={t.entry ?? t.entryPrice}
                        exit={t.exit ?? t.exitPrice}
                        pnl={t.pnl}
                        status={(t.pnl ?? 0) >= 0 ? "Win" : "Loss"}
                      />
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-10 text-center text-zinc-600 font-black uppercase tracking-widest"
                      >
                        目前尚無交易記錄
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column - AI Agent & Sentiment */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
          {/* AI Analysis */}
          <div className="liquid-glass rounded-3xl p-6 border border-[var(--border-color)] shadow-xl">
            <h3
              className={cn(
                "font-black text-[var(--text-color)] flex items-center gap-2 uppercase tracking-widest",
                compact ? "text-xs mb-3" : "text-sm mb-4",
              )}
            >
              <div className="absolute top-2 right-2">
                <StatusIndicator3D status={aiStatus} />
              </div>
              <BrainCircuit
                className="text-indigo-400"
                size={compact ? 14 : 16}
              />{" "}
              AI 分析
            </h3>
            {aiStatus === "analyzing" ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 size={14} className="animate-spin" /> 分析中…
              </div>
            ) : aiAnalysis ? (
              <div className="text-sm text-slate-300 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 uppercase">
                    建議:
                  </span>
                  <span
                    className={cn(
                      "font-bold",
                      (aiAnalysis.action?.toUpperCase()?.includes("BUY"))
                        ? "text-emerald-400"
                        : (aiAnalysis.action?.toUpperCase()?.includes("SELL"))
                          ? "text-rose-400"
                          : "text-yellow-400",
                    )}
                  >
                    {aiAnalysis.action === "STRONG BUY" ? "強力買進" :
                     aiAnalysis.action === "BUY" ? "買進" :
                     aiAnalysis.action === "STRONG SELL" ? "強力賣出" :
                     aiAnalysis.action === "SELL" ? "賣出" : "觀望"}
                  </span>
                </div>
                {aiAnalysis.reasoning && (
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {aiAnalysis.reasoning}
                  </p>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px]">
                  <div className="flex items-center gap-1 text-slate-500">
                    <span>目標:</span>
                    <span className="text-emerald-400 font-mono">
                      {aiAnalysis.targetPrice != null ? format.price(aiAnalysis.targetPrice) : "---"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-500">
                    <span>停損:</span>
                    <span className="text-rose-400 font-mono">
                      {aiAnalysis.stopLoss != null ? format.price(aiAnalysis.stopLoss) : "---"}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">載入報價後自動分析</p>
            )}
          </div>

          {/* Technical Suggestion */}
          <div className="liquid-glass rounded-3xl p-6 border border-[var(--border-color)] shadow-xl shrink-0">
            <h3
              className={cn(
                "font-black text-[var(--text-color)] flex items-center gap-2 uppercase tracking-widest",
                compact ? "text-xs mb-3" : "text-sm mb-4",
              )}
            >
              <TrendingUp className="text-blue-400" size={compact ? 14 : 16} />{" "}
              技術指標建議
            </h3>
            {indicators ? (
              <div className="text-sm space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 uppercase">
                    訊號:
                  </span>
                  <span className={cn("font-bold", indicators.suggestionColor)}>
                    {indicators.suggestion}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                  基於 SMA(20/50)、MACD 與 RSI(14) 的綜合評估。
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500">計算數據中…</p>
            )}
          </div>

          {/* Sentiment */}
          <div className="liquid-glass rounded-3xl p-6 border border-[var(--border-color)] shadow-xl">
            <h3
              className={cn(
                "font-black text-[var(--text-color)] flex items-center gap-2 uppercase tracking-widest",
                compact ? "text-xs mb-3" : "text-sm mb-4",
              )}
            >
              <Activity className="text-emerald-400" size={compact ? 14 : 16} />{" "}
              市場情緒
            </h3>
            {aiStatus === "sentiment" ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 size={14} className="animate-spin" /> 分析市場情緒中…
              </div>
            ) : sentimentAnalysis ? (
              <div className="text-sm text-slate-300 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 uppercase">
                    傾向:
                  </span>
                  <span
                    className={cn(
                      "font-bold",
                      (sentimentAnalysis.score ?? 50) >= 60
                        ? "text-emerald-400"
                        : (sentimentAnalysis.score ?? 50) <= 40
                          ? "text-rose-400"
                          : "text-yellow-400",
                    )}
                  >
                    {(sentimentAnalysis.score ?? 50) >= 60
                      ? "偏多"
                      : (sentimentAnalysis.score ?? 50) <= 40
                        ? "偏空"
                        : "中性"}{" "}
                    ({sentimentAnalysis.score ?? 50}/100)
                  </span>
                </div>
                {sentimentAnalysis.aiAdvice && (
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {sentimentAnalysis.aiAdvice}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500">載入市場資料後自動分析</p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Section - Trading Consoles */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Suspense
            fallback={
              <div className="h-60 flex items-center justify-center text-white/40">
                載入中…
              </div>
            }
          >
            <PaperTradingDashboard />
          </Suspense>
        </div>
        <div className="flex flex-col gap-6">
          <Suspense
            fallback={
              <div className="h-40 flex items-center justify-center text-white/40">
                載入中…
              </div>
            }
          >
            <StrategyComparison />
            <LiveTradingConsole />
          </Suspense>
        </div>
      </div>
    </motion.div>
  );
}

function IndicatorCard({
  title,
  value,
  status,
  label,
}: {
  title: string;
  value: string;
  status: "bullish" | "bearish" | "neutral";
  label: string;
}) {
  return (
    <div className="liquid-glass-strong rounded-[2.5rem] p-7 border border-zinc-800 bg-zinc-950/40 flex flex-col justify-between relative overflow-hidden transition group hover:border-indigo-500/30 hover:bg-zinc-950/60 shadow-xl">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.02] to-transparent pointer-events-none" />
      <div className="text-xs md:text-sm text-zinc-500 font-bold uppercase tracking-[0.2em] mb-4 relative z-10 opacity-70">
        {title}
      </div>
      <div className="relative z-10">
        <div
          className={cn(
            "text-4xl md:text-5xl font-black mb-2 tracking-tighter filter drop-shadow-sm",
            status === "bullish" && "text-emerald-400",
            status === "bearish" && "text-rose-400",
            status === "neutral" && "text-amber-400",
          )}
        >
          {value}
        </div>
        <div className="text-[10px] md:text-xs text-zinc-500 font-bold uppercase tracking-widest bg-zinc-800/20 w-fit px-2 py-0.5 rounded border border-white/5">
          {label}
        </div>
      </div>
    </div>
  );
}

const TradeRow: React.FC<{
  date: string;
  ticker: string;
  action: string;
  entry?: number;
  exit?: number;
  pnl: number;
  status: "Win" | "Loss";
}> = ({ date, ticker, action, entry, exit, pnl, status }) => {
  return (
    <tr className="border-b border-zinc-800 hover:bg-zinc-800/50 transition-colors">
      <td className="px-4 py-4 text-zinc-400 font-mono text-sm">{date}</td>
      <td className="px-4 py-4 font-black text-zinc-100 text-sm">{ticker}</td>
      <td className="px-4 py-3.5">
        <span
          className={cn(
            "px-2.5 py-1 rounded-lg text-sm font-medium shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]",
            action.includes("Buy")
              ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
              : "bg-rose-500/10 text-rose-300 border border-rose-500/20",
          )}
        >
          {action}
        </span>
      </td>
      <td className="px-4 py-3.5 text-white/70 text-sm">
        {entry != null ? entry.toFixed(2) : "-"}
      </td>
      <td className="px-4 py-3.5 text-white/70 text-sm">
        {exit != null ? exit.toFixed(2) : "-"}
      </td>
      <td
        className={cn(
          "px-4 py-3.5 font-medium drop-shadow-sm text-sm",
          pnl > 0 ? "text-emerald-400" : "text-rose-400",
        )}
      >
        {pnl > 0 ? "+" : ""}{pnl != null ? pnl.toFixed(2) : "-"}
      </td>
      <td className="px-4 py-3.5">
        {status === "Win" ? (
          <div className="flex items-center gap-1.5 text-emerald-400">
            <CheckCircle2 className="w-4 h-4 drop-shadow-[0_0_4px_rgba(52,211,153,0.5)]" />
            <span className="text-sm font-medium">獲利</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-rose-400">
            <XCircle className="w-4 h-4 drop-shadow-[0_0_4px_rgba(251,113,133,0.5)]" />
            <span className="text-sm font-medium">虧損</span>
          </div>
        )}
      </td>
    </tr>
  );
};
