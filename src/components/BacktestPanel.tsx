import React, { useState, memo, useMemo } from 'react';
import { runBacktest, BacktestConfig } from '../services/backtestEngine';
import { BacktestResult, HistoricalData } from '../types';
import { motion } from 'motion/react';
import { useSettings } from '../contexts/SettingsContext';
import { safeCn } from '../utils/helpers';
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip, XAxis } from 'recharts';
import { Activity } from 'lucide-react';

interface Props {
  history: HistoricalData[];
}

const BacktestPanelInner: React.FC<Props> = ({ history }) => {
  const { settings } = useSettings();
  const compact = settings.compactMode;
  const [result, setResult] = useState<BacktestResult | null>(null);

  const handleRun = () => {
    if (!history || history.length === 0) return;
    const shortPeriod = 50;
    const longPeriod = 200;
    const signals: ('BUY' | 'SELL' | 'HOLD')[] = [];
    let position = 0;

    let shortSum = 0;
    let longSum = 0;

    for (let i = 0; i < history.length; i++) {
      const close = Number(history[i]?.close) || 0;
      
      shortSum += close;
      longSum += close;
      
      if (i >= shortPeriod) {
        shortSum -= (Number(history[i - shortPeriod]?.close) || 0);
      }
      if (i >= longPeriod) {
        longSum -= (Number(history[i - longPeriod]?.close) || 0);
      }

      if (i < longPeriod - 1) {
        signals.push('HOLD');
        continue;
      }

      const shortSMA = shortSum / shortPeriod;
      const longSMA = longSum / longPeriod;
      
      if (!isFinite(shortSMA) || !isFinite(longSMA)) { 
        signals.push('HOLD'); 
        continue; 
      }

      if (position === 0 && shortSMA > longSMA) {
        signals.push('BUY');
        position = 1;
      } else if (position === 1 && shortSMA < longSMA) {
        signals.push('SELL');
        position = 0;
      } else {
        signals.push('HOLD');
      }
    }

    const config: BacktestConfig = {
      initialCapital: 100000,
      commissionRate: 0.001425,
      minimumCommission: 20,
      slippageRate: 0.001,
      taxRate: 0.003,
      positionSizing: 'all-in'
    };

    const res = runBacktest(history, signals, config);
    setResult(res);
  };

  const equityData = useMemo(() => {
    if (!result || !result.equityCurve) return [];
    return result.equityCurve.map((d, i) => ({
       index: i,
       date: d.date,
       equity: d.equity
    }));
  }, [result]);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className={safeCn("flex flex-col h-full", compact ? "gap-2" : "gap-4")}
    >
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
         <div className="flex items-center gap-2 text-indigo-400">
           <Activity size={16} />
           <span className="text-xs font-black tracking-widest uppercase">QUANTUM BACKTEST</span>
         </div>
         <button 
           onClick={handleRun}
           className="px-3 py-1 bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 transition-colors rounded-lg text-xs font-bold border border-indigo-500/30 uppercase tracking-wider"
         >
           RUN SMA 50/200
         </button>
      </div>

      {!result ? (
        <div className="flex-1 flex flex-col items-center justify-center opacity-30 gap-2 p-10">
          <Activity size={32} />
          <div className="text-xs font-medium uppercase tracking-widest">Awaiting Simulation</div>
        </div>
      ) : (
        <>
          {/* Equity Curve Chart */}
          <div className="w-full h-[140px] mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={equityData} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
                <YAxis domain={['auto', 'auto']} hide />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: '#888' }}
                  itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                  formatter={(val: number) => [`NT$ ${val.toLocaleString()}`, 'Equity']}
                  labelFormatter={(label) => `Date: ${equityData[label]?.date || label}`}
                />
                <Line 
                  type="monotone" 
                  dataKey="equity" 
                  stroke="#8b5cf6" 
                  strokeWidth={2} 
                  dot={false}
                  activeDot={{ r: 4, fill: '#8b5cf6', stroke: '#fff' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* KPI Grid */}
          {result.metrics && (
             <div className="grid grid-cols-2 gap-2 mt-auto">
               <div className="bg-black/30 border border-white/5 p-2 rounded-xl">
                 <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Total Return</div>
                 <div className={safeCn("text-lg font-black tracking-tighter", result.metrics.roi > 0 ? "text-emerald-400" : "text-rose-400")} style={{ fontFamily: 'var(--font-data)' }}>
                   {result.metrics.roi > 0 ? '+' : ''}{result.metrics.roi.toFixed(1)}%
                 </div>
               </div>
               <div className="bg-black/30 border border-white/5 p-2 rounded-xl">
                 <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Win Rate</div>
                 <div className="text-lg text-white font-black tracking-tighter" style={{ fontFamily: 'var(--font-data)' }}>
                   {result.metrics.winRate.toFixed(1)}% <span className="text-[10px] text-zinc-500 font-normal">({result.metrics.totalTrades} trades)</span>
                 </div>
               </div>
               <div className="bg-black/30 border border-white/5 p-2 rounded-xl">
                 <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Max Drawdown</div>
                 <div className="text-sm text-rose-400 font-black tracking-tighter mt-1" style={{ fontFamily: 'var(--font-data)' }}>
                   -{result.metrics.maxDrawdown.toFixed(1)}%
                 </div>
               </div>
               <div className="bg-black/30 border border-white/5 p-2 rounded-xl">
                 <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Sharpe Ratio</div>
                 <div className={safeCn("text-sm font-black tracking-tighter mt-1", result.metrics.sharpe > 1 ? "text-emerald-400" : "text-white")} style={{ fontFamily: 'var(--font-data)' }}>
                   {result.metrics.sharpe.toFixed(2)}
                 </div>
               </div>
             </div>
          )}
        </>
      )}
    </motion.div>
  );
};
export const BacktestPanel = memo(BacktestPanelInner);
