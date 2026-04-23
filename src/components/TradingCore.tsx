/**
 * TradingCore.tsx
 *
 * Fix: watchlist items now call onSymbolChange(symbol) to switch the viewed stock.
 * All indicator math inlined. ChartWidget lazy-loaded.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as api from '../services/api';
import { STORAGE_KEYS, saveToStorage, loadFromStorage } from '../utils/storage';
import { chatWithAI } from '../services/aiService';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import { Watchlist } from './Watchlist';
import { PriceBar } from './PriceBar';
import { BacktestPanel } from './BacktestPanel';
import { ChartSection } from './ChartSection';
import { NewsSentimentBelowChart } from './NewsSentimentBelowChart';
import { RightPanel } from './RightPanel';
import { useQueryClient } from '@tanstack/react-query';
import { useWatchlist } from '../hooks/useQueryHooks';
import { useTradeExecution, useWatchlistManagement } from '../hooks/useTradingCore';
import { useSettings } from '../contexts/SettingsContext';
import { useStockAnalysis } from '../hooks/useStockAnalysis';
import { Order, WatchlistItem, Alert } from '../types';
import Decimal from 'decimal.js';

// ─────────────────────────────────────────────────────────────────────────────
interface Props {
  model: string;
  symbol: string;
  onSymbolChange?: (sym: string) => void;
  onGoBacktest?:   (sym: string) => void;  // ← navigate to BacktestPage with this symbol
  isLandscape?: boolean;
  focusMode?: boolean; // 新增 focusMode prop
}

export default function TradingCore({ model, symbol, onSymbolChange, onGoBacktest, isLandscape, focusMode: propFocusMode }: Props) {
  const { settings } = useSettings();
  const compact = Boolean(settings.compactMode);
  const [tab, setTab] = useState<'news' | 'calendar' | 'mtf'>('news');
  
  // 原有的 local focusMode
  const [localFocusMode, setLocalFocusMode] = useState(false);
  
  // 決定最終是否處於焦點模式：優先採用 prop，其次為 local state
  const isFocusActive = propFocusMode !== undefined ? propFocusMode : localFocusMode;
  
  // 用於傳遞給 sub-components 的 setter，如果傳入 propFocusMode 則此 setter 僅影響內部
  const handleSetFocusMode = useCallback((v: boolean) => {
    setLocalFocusMode(v);
  }, []);

  const {
    quote,
    hist,
    news,
    cal,
    twse,
    sentiment,
    mtfData,
    mtfStatus,
    newsStatus,
    dataState,
    loadData,
    norm,
    indic
  } = useStockAnalysis({
    symbol,
    model,
    systemInstruction: String(settings.systemInstruction || ''),
    activeTab: tab
  });

  const [portfolio, setPortfolio] = useState<Order[]>(() => loadFromStorage(STORAGE_KEYS.PORTFOLIO, []));
  const { data: rawWatchlist = [] } = useWatchlist();
  // Enrich watchlist items with live quote prices
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);

  useEffect(() => {
    const base = rawWatchlist as WatchlistItem[];
    setWatchlist(base); // show symbols immediately while quotes load
    if (!base.length) return;
    const symbols = base.map(w => w.symbol);
    api.getBatchQuotes(symbols).then(quotes => {
      const qMap = new Map<string, typeof quotes[number]>(
        (Array.isArray(quotes) ? quotes.filter(Boolean) : []).map(q => [q.symbol, q])
      );
      setWatchlist(base.map(w => {
        const q = qMap.get(w.symbol);
        if (!q) return w;
        return {
          ...w,
          price:     q.regularMarketPrice           ?? w.price,
          change:    q.regularMarketChange          ?? w.change,
          changePct: q.regularMarketChangePercent   ?? w.changePct,
          name:      q.shortName ?? q.longName      ?? w.name,
          shortName: q.shortName                    ?? w.shortName,
        };
      }));
    }).catch(() => { /* keep base items displayed */ });
  }, [rawWatchlist]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.PORTFOLIO, portfolio);
  }, [portfolio]);

  const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showToast = useCallback((msg: string, type: 'success' | 'error', ms = 3000) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => setToast(null), ms);
  }, []);
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  const onSetAlert = useCallback((symbol: string, price: number) => {
    setAlerts(prev => [...prev, { id: Date.now(), symbol, target: price, condition: 'above' }]);
    showToast(`已設定 ${symbol} 警示: ${price}`, 'success');
  }, [showToast]);

  useEffect(() => {
    if (quote && quote.regularMarketPrice) {
      const currentPrice = quote.regularMarketPrice;
      const triggered = alerts.filter(alert => alert.symbol === symbol && currentPrice >= alert.target);
      if (triggered.length > 0) {
        triggered.forEach(alert => {
          showToast(`警示觸發: ${symbol} 價格已達 ${alert.target}`, 'success', 5000);
        });
        setAlerts(prev => prev.filter(a => !triggered.includes(a)));
      }
    }
  }, [quote, alerts, symbol, showToast]);

  const { executeOrder, orderStatus } = useTradeExecution(showToast, setPortfolio);
  const { addToWatchlist, wlSearch, setWlSearch, wlAdding, setWlAdding, searchResults, isSearching } = useWatchlistManagement(watchlist, showToast);

  const [mobilePanel, setMobilePanel] = useState<'list' | 'chart' | 'panel'>('chart');
  const [orderQty,  setOrderQty]  = useState(Number(settings.defaultOrderQty) || 100);
  const [oSide,     setOSide]     = useState<'buy'|'sell'>('buy');
  const [chat,      setChat]      = useState('');
  const [chatRep,   setChatRep]   = useState('');
  const [chatStatus, setChatStatus] = useState<'idle' | 'busy'>('idle');

  useEffect(() => { setMobilePanel('chart'); }, [symbol]);

  const handleChat = useCallback(async () => {
    if(!chat.trim()||chatStatus === 'busy') return;
    setChatStatus('busy'); setChatRep('');
    try {
      const rep = await chatWithAI(chat, symbol, quote || {}, hist, model, String(settings.systemInstruction || ''));
      setChatRep(rep ?? '分析失敗');
    } catch(e: unknown) {
      console.error('[TradingCore] AI chat error:', e);
      setChatRep('目前無法取得分析結果，請稍後再試。');
    } finally {
      setChatStatus('idle');
    }
  }, [chat, chatStatus, symbol, quote, hist, model, settings.systemInstruction]);

  const portfolioValue = useMemo(() => portfolio.reduce((acc: number, order: Order) => {
    const value = new Decimal(order.price ?? 0).times(order.qty ?? 0).toNumber();
    return acc + (order.side === 'sell' ? -value : value);
  }, 0), [portfolio]);

  const eDateFmt = cal.earningsDate ? new Date(cal.earningsDate[0]).toLocaleDateString() : null;
  const latestHist = hist[hist.length - 1];
  const price = quote?.regularMarketPrice || latestHist?.close;
  const change = quote?.regularMarketChange ?? (latestHist && hist.length > 1 ? latestHist.close - hist[hist.length - 2].close : null);
  const pct = quote?.regularMarketChangePercent ?? (change && hist.length > 1 ? (change / hist[hist.length - 2].close) * 100 : null);
  const isUp = change != null ? change >= 0 : true;
  const high = quote?.regularMarketDayHigh || latestHist?.high;
  const low = quote?.regularMarketDayLow || latestHist?.low;
  const vol = quote?.regularMarketVolume || latestHist?.volume;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={cn("h-full flex flex-col lg:flex-row overflow-y-auto", isLandscape ? "p-0 gap-0" : compact ? "p-2 sm:p-4 gap-2" : "p-2 sm:p-4 gap-4")}
    >


      {/* ── LEFT: Watchlist + Portfolio Summary ── */}
      {!isFocusActive && !isLandscape && (
        <div className={cn("w-full lg:w-72 flex flex-col shrink-0", compact ? "gap-2" : "gap-4", mobilePanel !== 'list' && "hidden lg:flex")}>
          {/* Portfolio Summary */}
          <div className={cn("liquid-glass-strong rounded-3xl border border-[var(--border-color)] shadow-xl", compact ? "p-3" : "p-5")}>
            <div className="label-meta font-bold text-zinc-500 uppercase tracking-widest mb-1">委託概覽</div>
            <div className={cn("font-black text-[var(--text-color)] tracking-tight", compact ? "text-lg" : "text-2xl")}>
              {portfolio.length > 0 ? `$${portfolioValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
            </div>
            {portfolio.length > 0 && (
              <div className="flex items-center gap-2 mt-0.5">
                <span className="label-meta font-bold text-zinc-400">{portfolio.length} 筆委託</span>
              </div>
            )}
          </div>
          {/* Watchlist */}
          <div className="flex-1 min-h-[260px] md:min-h-[400px] lg:min-h-0 liquid-glass rounded-3xl border border-[var(--border-color)] overflow-hidden flex flex-col">
            <Watchlist
              watchlist={watchlist}
              norm={norm}
              symbol={symbol}
              onSymbolChange={onSymbolChange || (() => {})}
              wlAdding={wlAdding}
              setWlAdding={setWlAdding}
              wlSearch={wlSearch}
              setWlSearch={setWlSearch}
              addToWatchlist={addToWatchlist}
              searchResults={searchResults}
              isSearching={isSearching}
              onSwipeAction={(sym, side) => {
                 if (onSymbolChange) onSymbolChange(sym);
                 setOSide(side);
                 setMobilePanel('panel');
              }}
            />
          </div>
        </div>
      )}

      {/* ── CENTER: Chart ── */}
      <div className={cn("flex-1 flex flex-col min-w-0 min-h-[400px] lg:min-h-0", isLandscape ? "gap-0" : compact ? "gap-2" : "gap-4", (!isFocusActive && !isLandscape) && mobilePanel !== 'chart' && "hidden lg:flex")}>
        {/* Price bar */}
        <div className={cn("shrink-0 overflow-hidden", isLandscape ? "bg-black border-b border-white/10" : "liquid-glass-strong rounded-3xl border border-[var(--border-color)]")}>
          <PriceBar
            symbol={symbol}
            twse={twse}
            loading={dataState.status === 'loading'}
            price={price}
            isUp={isUp}
            change={change}
            pct={pct}
            high={high}
            low={low}
            vol={vol}
            focusMode={isFocusActive || Boolean(isLandscape)}
            setFocusMode={handleSetFocusMode}
            onSetAlert={onSetAlert}
            loadData={loadData}
            isLandscape={isLandscape}
            recommendation={indic?.recommendation}
          />
        </div>

        {/* Chart */}
        <div className={cn("flex-1 min-h-[300px] lg:min-h-0 overflow-hidden flex flex-col", isLandscape ? "p-0 rounded-none border-none bg-black" : "liquid-glass rounded-3xl border border-[var(--border-color)] p-1")}>
          <div className="flex-1 min-h-0"><ChartSection symbol={symbol} model={model} focusMode={isFocusActive || Boolean(isLandscape)} data={hist} /></div>
        </div>
        
        {/* News & AI Sentiment Below Chart */}
        {!isLandscape && (
          <NewsSentimentBelowChart news={news} sentiment={sentiment} newsStatus={newsStatus} />
        )}
      </div>

      {/* ── RIGHT: Depth + News + Order ── */}
      {!isFocusActive && !isLandscape && (
        <div className={cn("w-full lg:w-80 flex flex-col shrink-0 relative", compact ? "gap-2" : "gap-4", mobilePanel !== 'panel' && "hidden lg:flex")}>
          {toast && (
            <div className={cn("fixed top-16 left-1/2 -translate-x-1/2 lg:absolute lg:top-0 lg:-translate-y-full px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-2xl z-50 whitespace-nowrap animate-[slideUp_0.3s_ease-out] safe-area-top", toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500')}>
              {toast.type === 'success' ? '\u2713 ' : '\u2717 '}{toast.msg}
            </div>
          )}
          <div className="liquid-glass rounded-3xl border border-[var(--border-color)] p-1">
            <BacktestPanel history={hist} />
          </div>
          <div className="flex-1 min-h-[300px] md:min-h-[500px] lg:min-h-0 liquid-glass rounded-3xl border border-[var(--border-color)] overflow-y-auto">
            <RightPanel
              price={price}
              symbol={symbol}
              news={news}
              sentiment={sentiment}
              newsStatus={newsStatus}
              tab={tab}
              setTab={setTab}
              eDateFmt={eDateFmt}
              chat={chat}
              setChat={setChat}
              chatRep={chatRep}
              chatStatus={chatStatus}
              handleChat={handleChat}
              oSide={oSide}
              setOSide={setOSide}
              orderQty={orderQty}
              setOrderQty={setOrderQty}
              isUp={isUp}
              onGoBacktest={onGoBacktest}
              executeOrder={executeOrder}
              mtfData={mtfData}
              mtfStatus={mtfStatus}
              portfolio={portfolio}
              orderStatus={orderStatus}
            />
          </div>
        </div>
      )}

      {/* ── Mobile Panel Switcher (Bottom Bar) ── */}
      {!isFocusActive && (
        <div className="lg:hidden sticky bottom-0 left-0 right-0 z-40 flex gap-1 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-2xl p-1.5 shrink-0 mt-auto safe-area-bottom shadow-[0_-10px_20px_rgba(0,0,0,0.2)]">
          {([
            { id: 'list'  as const, label: '自選股' },
            { id: 'chart' as const, label: '圖表' },
            { id: 'panel' as const, label: '面板' },
          ]).map(p => (
            <button
              key={p.id}
              onClick={() => { setMobilePanel(p.id); }}
              className={cn(
                'flex-1 py-3 min-h-[48px] rounded-xl text-xs sm:text-sm font-black tracking-widest uppercase transition-all press-feedback',
                mobilePanel === p.id
                  ? 'bg-emerald-500 text-black shadow-[0_0_12px_rgba(52,211,153,0.3)]'
                  : 'text-zinc-500 hover:text-[var(--text-color)] hover:bg-white/5'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

