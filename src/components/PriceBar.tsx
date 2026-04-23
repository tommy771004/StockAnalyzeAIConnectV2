import React, { useState, useRef, useEffect } from 'react';
import { Loader2, RefreshCw, TrendingUp, TrendingDown, X } from 'lucide-react';
import { safeCn, safeN, vibrate } from '../utils/helpers';
import { motion, AnimatePresence } from 'motion/react';
import { useSettings } from '../contexts/SettingsContext';
import { TWSEData } from '../types';

interface PriceBarProps {
  symbol: string;
  twse: TWSEData | null;
  loading: boolean;
  price: number | null;
  isUp: boolean;
  change: number | null;
  pct: number | null;
  high: number | null;
  low: number | null;
  vol: number | null;
  focusMode: boolean;
  setFocusMode: (v: boolean) => void;
  onSetAlert: (symbol: string, price: number) => void;
  loadData: () => void;
  isLandscape?: boolean;
  recommendation?: string;
}

export const PriceBar: React.FC<PriceBarProps> = React.memo(({
  symbol, twse, loading, price, isUp, change, pct, high, low, vol, focusMode, setFocusMode, onSetAlert, loadData, isLandscape, recommendation
}) => {
  const { settings } = useSettings();
  const compact = settings.compactMode;
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertVal, setAlertVal] = useState('');
  const alertInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (alertOpen && alertInputRef.current) {
      alertInputRef.current.focus();
    }
  }, [alertOpen]);

  const handleAlertSubmit = () => {
    const target = parseFloat(alertVal);
    if (!isNaN(target) && target > 0) {
      onSetAlert(symbol, target);
      setAlertOpen(false);
      setAlertVal('');
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={safeCn(
          "shrink-0 flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/5 bg-[#0a0a0c]/80 backdrop-blur-xl relative z-40 overflow-hidden",
          isLandscape ? "p-3 px-4 gap-3" : compact ? "p-2.5 px-4 gap-2" : "p-4 px-6 gap-3 sm:gap-6",
          !isLandscape && "rounded-t-3xl sm:rounded-3xl border border-white/5 shadow-2xl"
        )}
      >
        <div className={safeCn("flex items-center flex-wrap min-w-0", compact ? "gap-3" : "gap-4 sm:gap-6")}>
          <div className="flex flex-col">
            <span className={safeCn("font-black tracking-tighter text-white uppercase leading-none", compact ? "text-xl" : "text-2xl sm:text-3xl")} style={{ fontFamily: 'var(--font-heading)' }}>{symbol}</span>
            {twse && <span className="text-[9px] font-black tracking-[0.2em] text-emerald-400 mt-1 uppercase opacity-60">TWSE TERMINAL</span>}
          </div>

          <div className="w-px h-8 bg-white/10 hidden sm:block mx-1" />

          {loading ? (
            <div className="flex items-center gap-3">
              <div className={safeCn("bg-white/5 animate-pulse rounded-xl", compact ? "w-20 h-7" : "w-28 h-9")} />
              <Loader2 size={18} className="animate-spin text-indigo-400" />
            </div>
          ) : price != null && (
            <div className="flex flex-col sm:flex-row sm:items-end gap-1 sm:gap-3">
              <div className="flex items-center gap-2">
                <span className={safeCn('font-black tabular-nums tracking-tighter', compact ? 'text-2xl' : 'text-3xl sm:text-4xl', isUp ? 'text-rose-400' : 'text-emerald-400')} style={{ fontFamily: 'var(--font-data)' }}>
                  {safeN(price)}
                </span>
                <div className={safeCn("p-1 rounded-lg", isUp ? "bg-rose-500/10 text-rose-400" : "bg-emerald-500/10 text-emerald-400")}>
                  {isUp ? <TrendingUp size={16} strokeWidth={2.5} /> : <TrendingDown size={16} strokeWidth={2.5} />}
                </div>
              </div>
              <div className={safeCn('font-black tabular-nums flex items-center gap-2 pb-0.5', compact ? 'text-[11px]' : 'text-[13px]', isUp ? 'text-rose-400 opacity-80' : 'text-emerald-400 opacity-80')} style={{ fontFamily: 'var(--font-data)' }}>
                <span>{isUp ? '+' : ''}{safeN(change)}</span>
                <span className="opacity-40">({isUp ? '+' : ''}{safeN(pct)}%)</span>
              </div>
            </div>
          )}

          {recommendation && (
            <div className={safeCn(
              "px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] border shadow-sm",
              recommendation.includes('買進') ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
              recommendation.includes('賣出') ? "bg-rose-500/10 text-rose-400 border-rose-500/20" :
              "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
            )}>
              {recommendation}
            </div>
          )}
        </div>

        <div className={safeCn("flex items-center font-mono flex-wrap bg-black/40 p-1.5 px-3 rounded-2xl border border-white/5", compact ? "gap-3 text-[10px]" : "gap-4 sm:gap-5 text-[11px]")}>
          {high != null && <div className="flex flex-col"><span className="opacity-30 font-black">HIGH</span><span className="text-rose-400 font-bold tabular-nums">{safeN(high)}</span></div>}
          {low != null && <div className="flex flex-col"><span className="opacity-30 font-black">LOW</span><span className="text-emerald-400 font-bold tabular-nums">{safeN(low)}</span></div>}
          {vol != null && !isNaN(Number(vol)) && (
            <div className="flex flex-col">
              <span className="opacity-30 font-black">VOL</span>
              <span className="text-white font-bold tabular-nums">{Number(vol) >= 1e6 ? `${(Number(vol) / 1e6).toFixed(1)}M` : Number(vol).toLocaleString()}</span>
            </div>
          )}
          
          <div className="flex items-center gap-1.5 ml-2">
            <button type="button" onClick={(e) => { setFocusMode(!focusMode); vibrate(20); }} aria-label="專注模式" aria-pressed={focusMode} 
              className={safeCn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition font-black uppercase tracking-widest text-[9px]", 
                focusMode ? "bg-indigo-500 text-white shadow-lg" : "bg-white/5 text-zinc-400 hover:text-white")}>
              <span className={safeCn(focusMode ? "scale-110" : "opacity-40 animate-pulse")}>✨</span> 專注
            </button>
            <button type="button" onClick={(e) => { setAlertVal(String(price ?? '')); setAlertOpen(true); vibrate(20); }} aria-label="設定價格警示" 
              className="p-1.5 rounded-xl bg-white/5 text-zinc-400 hover:text-white border border-transparent hover:border-white/10 transition">
              🔔
            </button>
            <button type="button" onClick={(e) => { loadData(); vibrate(20); }} disabled={loading} aria-label="重新載入資料" 
              className="p-1.5 rounded-xl bg-white/5 text-zinc-400 hover:text-white border border-transparent hover:border-white/10 transition">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Alert Modal (replaces browser prompt()) */}
      <AnimatePresence>
        {alertOpen && (
          <div className="alert-modal-backdrop" onClick={() => setAlertOpen(false)} role="dialog" aria-modal="true" aria-label="設定價格警示">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="alert-modal"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-[var(--text-color)]">設定價格警示</h3>
                <button type="button" onClick={(e) => {}} className="p-1 rounded-lg hover:bg-[var(--border-color)] text-zinc-500" aria-label="關閉">
                  <X size={16} />
                </button>
              </div>
              <div className="text-xs text-zinc-500 mb-3">{symbol} · 當前價格: {safeN(price)}</div>
              <label htmlFor="alert-price-input" className="text-xs font-bold text-zinc-400 mb-1 block">目標價格</label>
              <input
                ref={alertInputRef}
                id="alert-price-input"
                type="number"
                value={alertVal}
                onChange={e => setAlertVal(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAlertSubmit()}
                placeholder="輸入目標價格"
                className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-color)] font-mono focus:outline-none focus:border-emerald-500/50 mb-4"
                step="any"
              />
              <div className="flex gap-2">
                <button type="button" onClick={(e) => {}} className="flex-1 py-2 rounded-xl bg-[var(--border-color)] text-[var(--text-color)] opacity-70 text-sm font-bold hover:opacity-100 transition-colors">取消</button>
                <button type="button">確認設定</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
});
