import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Check, ChevronDown } from 'lucide-react';
import {
  createChart, ColorType, CrosshairMode,
  IChartApi, ISeriesApi, Time, LineWidth, LogicalRange, MouseEventParams,
  CandlestickSeries, HistogramSeries, LineSeries
} from 'lightweight-charts';
import { useSettings } from '../contexts/SettingsContext';
import { HistoricalData } from '../types';
import { calcEMA, calcRSISeries as calcRSI, calcMACDSeries as calcMACD, calcBBSeries as calcBB } from '../utils/math';
import { vibrate } from '../utils/helpers';

// 內建 safeCn，防止 import { cn } 失敗導致黑屏
function safeCn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}

interface Props { 
  data: HistoricalData[]; 
  focusMode?: boolean;
}
type Indicator = 'EMA1' | 'EMA2' | 'BB' | 'Volume';
type SubPanel  = 'none' | 'RSI' | 'MACD';

const SUB_H = 120;
const VALID_SUBPANELS: SubPanel[] = ['none', 'RSI', 'MACD'];

export default function ChartWidget({ data: history, focusMode = false }: Props) {
  const mainRef  = useRef<HTMLDivElement>(null);
  const volRef   = useRef<HTMLDivElement>(null);
  const subRef   = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const volChartRef = useRef<IChartApi | null>(null);
  const subChartRef = useRef<IChartApi | null>(null);
  const tooltipRef  = useRef<HTMLDivElement>(null);

  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettings(false);
      }
    };
    if (showSettings) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSettings]);

  const [ema1Period, setEma1Period] = useState(() => {
    try { return Number(localStorage.getItem('chart_ema1')) || 20; } catch { return 20; }
  });
  const [ema2Period, setEma2Period] = useState(() => {
    try { return Number(localStorage.getItem('chart_ema2')) || 50; } catch { return 50; }
  });

  const [indics,  setIndics]  = useState<Set<Indicator>>(() => {
    try { 
      const s = localStorage.getItem('chart_indicators'); 
      if (s) {
        const parsed = JSON.parse(s);
        const mapped = parsed.map((i: string) => i === 'EMA20' ? 'EMA1' : i === 'EMA50' ? 'EMA2' : i);
        return new Set<Indicator>(mapped);
      }
      return new Set(['EMA1', 'Volume']); 
    }
    catch { return new Set(['EMA1', 'Volume']); }
  });
  const [subPanel, setSubPanel] = useState<SubPanel>(() => {
    try {
      const v = localStorage.getItem('chart_subpanel');
      return VALID_SUBPANELS.includes(v as SubPanel) ? (v as SubPanel) : 'RSI';
    }
    catch { return 'RSI'; }
  });

  const closes = useMemo(() => history?.map(r => Number(r.close)) ?? [], [history]);
  const ema1Data = useMemo(() => calcEMA(closes, ema1Period), [closes, ema1Period]);
  const ema2Data = useMemo(() => calcEMA(closes, ema2Period), [closes, ema2Period]);
  const rsiIndicatorData = useMemo(() => calcRSI(closes), [closes]);
  const macdData = useMemo(() => calcMACD(closes), [closes]);
  const bbData = useMemo(() => calcBB(closes), [closes]);

  const toggleIndic = (i: Indicator) => setIndics(prev => {
    const n = new Set(prev);
    if (n.has(i)) n.delete(i);
    else n.add(i);
    try { localStorage.setItem('chart_indicators', JSON.stringify([...n])); } catch (e) { console.error(e); }
    return n;
  });
  const setEmaPersist = (which: 1 | 2, val: number) => {
    const v = Math.max(1, Math.min(200, val));
    if (which === 1) {
      setEma1Period(v);
      try { localStorage.setItem('chart_ema1', v.toString()); } catch (e) { console.error(e); }
    } else {
      setEma2Period(v);
      try { localStorage.setItem('chart_ema2', v.toString()); } catch (e) { console.error(e); }
    }
  };

  const setSubPanelPersist = (p: SubPanel) => {
    setSubPanel(p);
    try { localStorage.setItem('chart_subpanel', p); } catch (e) { console.error(e); }
  };

  const { settings } = useSettings();
  const isLight = settings.theme === 'light';

  useEffect(() => {
    if (!mainRef.current || !history?.length) return;

    chartRef.current?.remove();
    subChartRef.current?.remove();
    volChartRef.current?.remove();

    const textColor = isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.4)';
    const gridColor = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.03)';
    const crosshairColor = isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.12)';
    const borderColor = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.07)';

    const baseOpts = {
      layout:     { background: { type: ColorType.Solid, color: 'transparent' }, textColor, fontSize: focusMode ? 14 : 12 },
      grid:       { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
      crosshair:  { mode: CrosshairMode.Normal, vertLine: { width: 1 as LineWidth, color: crosshairColor, style: 1 }, horzLine: { width: 1 as LineWidth, color: crosshairColor, style: 1 } },
      rightPriceScale: { 
        borderColor: borderColor, 
        scaleMargins: { top: 0.1, bottom: 0.1 } 
      },
      timeScale:       { borderColor: borderColor, timeVisible: true },
    };

    const chart = createChart(mainRef.current, { 
      ...baseOpts, 
      width: mainRef.current.clientWidth, 
      height: mainRef.current.clientHeight 
    });
    chartRef.current = chart;

    // 🚨 終極修復：絕對嚴謹的時間排序與去重，使用 Unix Seconds 徹底防止 Lightweight charts 崩潰！
    const uniqueMap = new Map<number, { time: Time, open: number, high: number, low: number, close: number, volume: number }>();
    history.forEach((d: HistoricalData) => {
      try {
        if (!d || !d.date) return;
        const t = new Date(d.date).getTime();
        if (isNaN(t)) return;
        
        const timeVal = Math.floor(t / 1000) as Time; 
        const close = Number(d.close);
        if (isNaN(close) || close <= 0) return;

        uniqueMap.set(timeVal as number, { 
          time: timeVal, 
          open: Number(d.open ?? close) || close, 
          high: Number(d.high ?? close) || close, 
          low: Number(d.low ?? close) || close, 
          close: close, 
          volume: Number(d.volume) || 0 
        });
      } catch (e) { console.error(e); }
    });

    const rows = Array.from(uniqueMap.values()).sort((a, b) => (a.time as number) - (b.time as number));
    if (!rows.length) return;

    const times  = rows.map(r => r.time);

    // 修正：使用 addCandlestickSeries
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: '#34d399', downColor: '#fb7185', borderVisible: false,
      wickUpColor: '#34d399', wickDownColor: '#fb7185',
    });
    candles.setData(rows);
    chart.timeScale().fitContent();

    let volSeries: ISeriesApi<'Histogram'> | null = null;
    if (indics.has('Volume') && volRef.current) {
      const volChart = createChart(volRef.current, {
        ...baseOpts,
        timeScale: { ...baseOpts.timeScale, visible: false },
        rightPriceScale: { borderColor: borderColor, scaleMargins: { top: 0.1, bottom: 0 } },
      });
      volChartRef.current = volChart;
      
      volSeries = volChart.addSeries(HistogramSeries, { color: '#26a69a', priceFormat: { type: 'volume' }, priceScaleId: 'right' });
      volSeries.setData(rows.map(r => ({ time: r.time, value: r.volume, color: r.close >= r.open ? 'rgba(52,211,153,0.5)' : 'rgba(251,113,133,0.5)' })));
    }

    if (indics.has('EMA1')) {
      const ema1Series = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1 as LineWidth, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
      ema1Series.setData(times.map((t, i) => ({ time: t, value: ema1Data[i] })));
    }

    if (indics.has('EMA2')) {
      const ema2Series = chart.addSeries(LineSeries, { color: '#a78bfa', lineWidth: 1 as LineWidth, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
      ema2Series.setData(times.map((t, i) => ({ time: t, value: ema2Data[i] })));
    }

    if (indics.has('BB')) {
      const bbOpts = { lineWidth: 1 as LineWidth, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false };
      const upper = chart.addSeries(LineSeries, { ...bbOpts, color: 'rgba(99,102,241,0.6)' });
      const lower = chart.addSeries(LineSeries, { ...bbOpts, color: 'rgba(99,102,241,0.6)' });
      const mid   = chart.addSeries(LineSeries, { ...bbOpts, color: 'rgba(99,102,241,0.3)', lineStyle: 2 });
      const valid = bbData.map((b: { upper: number, mid: number, lower: number } | null, i: number) => b ? { time: times[i], upper: b.upper, mid: b.mid, lower: b.lower } : null).filter(Boolean) as { time: Time, upper: number, mid: number, lower: number }[];
      upper.setData(valid.map(d => ({ time: d.time, value: d.upper })));
      lower.setData(valid.map(d => ({ time: d.time, value: d.lower })));
      mid.setData(valid.map(d => ({ time: d.time, value: d.mid })));
    }

    let primarySubSeries: ISeriesApi<'Line'> | null = null;

    if (subPanel !== 'none' && subRef.current) {
      const sub = createChart(subRef.current, {
        ...baseOpts,
        timeScale: { ...baseOpts.timeScale, visible: false },
        rightPriceScale: { borderColor: borderColor, scaleMargins: { top: 0.1, bottom: 0.1 } },
      });
      subChartRef.current = sub;

      if (subPanel === 'RSI') {
        const rsiLine = sub.addSeries(LineSeries, { color: '#38bdf8', lineWidth: 1 as LineWidth, crosshairMarkerVisible: false, lastValueVisible: true, priceLineVisible: false });
        rsiLine.setData(times.map((t, i) => ({ time: t, value: rsiIndicatorData[i] })));
        const ob = sub.addSeries(LineSeries, { color: 'rgba(251,113,133,0.4)', lineWidth: 1 as LineWidth, lineStyle: 1, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
        const os = sub.addSeries(LineSeries, { color: 'rgba(52,211,153,0.4)',  lineWidth: 1 as LineWidth, lineStyle: 1, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
        ob.setData(times.map(t => ({ time: t, value: 70 })));
        os.setData(times.map(t => ({ time: t, value: 30 })));
        primarySubSeries = rsiLine;
      } else if (subPanel === 'MACD') {
        const macdLine = sub.addSeries(LineSeries, { color: '#34d399', lineWidth: 1 as LineWidth, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
        const sigLine  = sub.addSeries(LineSeries, { color: '#fb923c', lineWidth: 1 as LineWidth,   crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
        const histBar  = sub.addSeries(HistogramSeries, { color: '#6366f1', priceScaleId: 'right' });
        macdLine.setData(times.map((t, i) => ({ time: t, value: macdData[i].macd })));
        sigLine.setData( times.map((t, i) => ({ time: t, value: macdData[i].signal })));
        histBar.setData( times.map((t, i) => ({ time: t, value: macdData[i].hist, color: macdData[i].hist >= 0 ? 'rgba(52,211,153,0.5)' : 'rgba(251,113,133,0.5)' })));
        primarySubSeries = macdLine;
      }
    }

    const syncTimeScale = (range: LogicalRange | null, source: IChartApi) => {
      if (!range) return;
      if (source !== chartRef.current && chartRef.current) chartRef.current.timeScale().setVisibleLogicalRange(range);
      if (source !== volChartRef.current && volChartRef.current) volChartRef.current.timeScale().setVisibleLogicalRange(range);
      if (source !== subChartRef.current && subChartRef.current) subChartRef.current.timeScale().setVisibleLogicalRange(range);
    };

    const updateTooltip = (p: MouseEventParams, r: any, idx: number) => {
      if (!tooltipRef.current || !mainRef.current) return;
      if (!r || p.time === undefined || !p.point) {
        tooltipRef.current.style.display = 'none';
        return;
      }

      tooltipRef.current.style.display = 'block';
      const d = new Date((p.time as number) * 1000);
      const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      let html = `<div class="font-bold border-b border-[var(--border-color)] pb-1 mb-1">${dateStr}</div>`;
      html += `<div class="grid grid-cols-2 gap-x-4 gap-y-0.5">`;
      html += `<span class="opacity-60">Open:</span> <span class="text-right">${r.open.toFixed(2)}</span>`;
      html += `<span class="opacity-60">High:</span> <span class="text-right">${r.high.toFixed(2)}</span>`;
      html += `<span class="opacity-60">Low:</span> <span class="text-right">${r.low.toFixed(2)}</span>`;
      const cClass = r.close >= r.open ? 'text-emerald-400' : 'text-rose-400';
      html += `<span class="opacity-60">Close:</span> <span class="text-right font-bold ${cClass}">${r.close.toFixed(2)}</span>`;
      
      if (indics.has('Volume')) {
        html += `<span class="opacity-60 text-indigo-400">Vol:</span> <span class="text-right">${Math.round(r.volume).toLocaleString()}</span>`;
      }
      if (indics.has('EMA1')) {
        html += `<span class="opacity-60 text-amber-400">EMA${ema1Period}:</span> <span class="text-right">${ema1Data[idx]?.toFixed(2) ?? '-'}</span>`;
      }
      if (indics.has('EMA2')) {
        html += `<span class="opacity-60 text-violet-400">EMA${ema2Period}:</span> <span class="text-right">${ema2Data[idx]?.toFixed(2) ?? '-'}</span>`;
      }
      
      // Always show RSI/MACD in tooltip even if panel hidden? 
      // User said "comprehensive information including RSI and MACD values"
      const rsiVal = rsiIndicatorData[idx];
      html += `<span class="opacity-60 text-sky-400">RSI:</span> <span class="text-right">${!isNaN(rsiVal) ? rsiVal.toFixed(1) : '-'}</span>`;
      
      const m = macdData[idx];
      if (m) {
        html += `<span class="opacity-60 text-sky-400">MACD:</span> <span class="text-right">${m.macd.toFixed(2)}</span>`;
        html += `<span class="opacity-60 text-amber-400">Signal:</span> <span class="text-right">${m.signal.toFixed(2)}</span>`;
        html += `<span class="opacity-60 text-[var(--text-color)]">Hist:</span> <span class="text-right">${m.hist.toFixed(2)}</span>`;
      }
      
      html += `</div>`;
      tooltipRef.current.innerHTML = html;

      // Position tooltip safely
      const containerRect = mainRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      let left = p.point.x + 15;
      let top = p.point.y + 15;
      
      if (left + tooltipRect.width > containerRect.width) {
        left = p.point.x - tooltipRect.width - 15;
      }
      if (top + tooltipRect.height > containerRect.height) {
        top = p.point.y - tooltipRect.height - 15;
      }
      
      tooltipRef.current.style.left = `${left}px`;
      tooltipRef.current.style.top = `${top}px`;
    };

    const syncCrosshair = (p: MouseEventParams, sourceChart: IChartApi) => {
      if (p.time !== undefined) {
        updateLegendFromTime(p.time);
        const idx = timeToIndex.get(p.time as Time);
        const r = idx !== undefined ? rows[idx] : null;
        
        if (sourceChart === chartRef.current) {
          updateTooltip(p, r, idx ?? -1);
        }

        // Sync to main chart
        if (sourceChart !== chartRef.current && chartRef.current && candles) {
          const price = idx !== undefined ? rows[idx].close : 0;
          chartRef.current.setCrosshairPosition(price, p.time as Time, candles);
        }
        
        // Sync to volume chart
        if (sourceChart !== volChartRef.current && volChartRef.current && volSeries) {
          const price = idx !== undefined ? rows[idx].volume : 0;
          volChartRef.current.setCrosshairPosition(price, p.time as Time, volSeries);
        }
        
        // Sync to sub chart
        if (sourceChart !== subChartRef.current && subChartRef.current && primarySubSeries) {
          let price = 0;
          if (idx !== undefined) {
            if (subPanel === 'RSI') price = rsiIndicatorData[idx];
            else if (subPanel === 'MACD') price = macdData[idx].macd;
          }
          subChartRef.current.setCrosshairPosition(price, p.time as Time, primarySubSeries);
        }
      } else {
        setLeg(last);
        if (tooltipRef.current) tooltipRef.current.style.display = 'none';
        if (sourceChart !== chartRef.current && chartRef.current) chartRef.current.clearCrosshairPosition();
        if (sourceChart !== volChartRef.current && volChartRef.current) volChartRef.current.clearCrosshairPosition();
        if (sourceChart !== subChartRef.current && subChartRef.current) subChartRef.current.clearCrosshairPosition();
      }
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(range => syncTimeScale(range, chart));
    if (volChartRef.current) volChartRef.current.timeScale().subscribeVisibleLogicalRangeChange(range => syncTimeScale(range, volChartRef.current!));
    if (subChartRef.current) subChartRef.current.timeScale().subscribeVisibleLogicalRangeChange(range => syncTimeScale(range, subChartRef.current!));

    const last = rows[rows.length - 1];
    const timeToIndex = new Map(rows.map((r, i) => [r.time, i]));

    const setLeg = (r: typeof last) => {
      if (!r) return;
      const o = document.getElementById('legend-open');
      const h = document.getElementById('legend-high');
      const l = document.getElementById('legend-low');
      const c = document.getElementById('legend-close');
      const v = document.getElementById('legend-vol');
      const e20 = document.getElementById('legend-ema20');
      const e50 = document.getElementById('legend-ema50');
      const rsi = document.getElementById('legend-rsi');
      const macd = document.getElementById('legend-macd');
      const macdSig = document.getElementById('legend-macd-sig');
      const macdHist = document.getElementById('legend-macd-hist');

      if (o) o.textContent = r.open.toFixed(2);
      if (h) h.textContent = r.high.toFixed(2);
      if (l) l.textContent = r.low.toFixed(2);
      if (c) {
        c.textContent = r.close.toFixed(2);
        c.className = r.close >= r.open ? 'font-bold text-emerald-400' : 'font-bold text-rose-400';
      }
      if (v) v.textContent = Math.round(r.volume).toLocaleString();
      
      const idx = rows.indexOf(r);
      if (e20) e20.textContent = idx >= 0 && !isNaN(ema1Data[idx]) ? ema1Data[idx].toFixed(2) : '-';
      if (e50) e50.textContent = idx >= 0 && !isNaN(ema2Data[idx]) ? ema2Data[idx].toFixed(2) : '-';
      if (rsi) rsi.textContent = idx >= 0 && !isNaN(rsiIndicatorData[idx]) ? rsiIndicatorData[idx].toFixed(1) : '-';
      if (macd && macdData[idx]) macd.textContent = !isNaN(macdData[idx].macd) ? macdData[idx].macd.toFixed(2) : '-';
      if (macdSig && macdData[idx]) macdSig.textContent = !isNaN(macdData[idx].signal) ? macdData[idx].signal.toFixed(2) : '-';
      if (macdHist && macdData[idx]) macdHist.textContent = !isNaN(macdData[idx].hist) ? macdData[idx].hist.toFixed(2) : '-';
    };

    // Initial legend update
    setTimeout(() => setLeg(last), 0);

    const updateLegendFromTime = (time: Time) => {
      const idx = timeToIndex.get(time);
      if (idx !== undefined) {
        setLeg(rows[idx]);
      }
    };

    chart.subscribeCrosshairMove(p => syncCrosshair(p, chart));
    if (volChartRef.current) volChartRef.current.subscribeCrosshairMove(p => syncCrosshair(p, volChartRef.current!));
    if (subChartRef.current) subChartRef.current.subscribeCrosshairMove(p => syncCrosshair(p, subChartRef.current!));

    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    const resize = () => {
      // Direct update for better performance
      if (mainRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: mainRef.current.clientWidth, height: mainRef.current.clientHeight });
      }
      if (subRef.current && subChartRef.current) {
        subChartRef.current.applyOptions({ width: subRef.current.clientWidth, height: subRef.current.clientHeight });
      }
      if (volRef.current && volChartRef.current) {
        volChartRef.current.applyOptions({ width: volRef.current.clientWidth, height: volRef.current.clientHeight });
      }
    };

    const ro = new ResizeObserver(() => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(resize, 100);
    });
    if (mainRef.current) ro.observe(mainRef.current);
    if (subRef.current) ro.observe(subRef.current);
    if (volRef.current) ro.observe(volRef.current);

    resize();

    return () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      ro.disconnect();
      chart.remove();
      subChartRef.current?.remove();
      volChartRef.current?.remove();
      chartRef.current = null; subChartRef.current = null; volChartRef.current = null;
    };
  }, [history, indics, subPanel, ema1Period, ema2Period, isLight, ema1Data, ema2Data, rsiIndicatorData, macdData, bbData, focusMode]);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden relative">
      {/* Indicator Settings Floating Button */}
      <div className="absolute top-3 right-3 z-30" ref={settingsRef}>
        <button 
          onClick={() => { setShowSettings(!showSettings); vibrate(20); }}
          className={safeCn(
            "flex items-center justify-center w-10 h-10 rounded-2xl shadow-xl transition-all backdrop-blur-xl border border-white/10",
            showSettings 
              ? "bg-indigo-500 text-white border-indigo-400 rotate-90" 
              : "bg-black/60 text-zinc-400 hover:bg-black/80 hover:text-white"
          )}
          aria-label="指標設定"
        >
          <Settings size={20} strokeWidth={2.5} />
        </button>

        {/* Dropdown Menu */}
        <AnimatePresence>
          {showSettings && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: -10, x: 10, filter: 'blur(10px)' }}
              animate={{ opacity: 1, scale: 1, y: 0, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.95, y: -10, x: 10, filter: 'blur(10px)' }}
              className="absolute top-full right-0 mt-3 w-72 glass-card border border-white/10 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-6 z-[60] flex flex-col gap-6 backdrop-blur-3xl overflow-hidden"
            >
              <div className="absolute inset-0 bg-indigo-500/5 pointer-events-none" />
              
              {/* Main Overlays */}
              <div className="flex flex-col gap-3 relative z-10">
                <div className="text-[10px] font-black opacity-30 uppercase tracking-[0.25em] px-1" style={{ fontFamily: 'var(--font-data)' }}>分析疊加 OVERLAYS</div>
                
                <div className="space-y-1">
                  <label className="flex items-center gap-4 p-2 rounded-2xl hover:bg-white/5 cursor-pointer group transition-all">
                    <div className={safeCn(
                      "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                      indics.has('EMA1') ? "bg-amber-500 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)]" : "border-white/10 group-hover:border-white/30"
                    )}>
                      {indics.has('EMA1') && <Check className="w-4 h-4 text-black stroke-[3px]" />}
                    </div>
                    <input type="checkbox" className="hidden" checked={indics.has('EMA1')} onChange={() => { toggleIndic('EMA1'); vibrate(15); }} />
                    <span className="text-sm font-black text-zinc-200 flex-1" style={{ fontFamily: 'var(--font-heading)' }}>EMA 1</span>
                    <input 
                      type="number" 
                      value={ema1Period}
                      onChange={(e) => setEmaPersist(1, parseInt(e.target.value) || 20)}
                      className="w-14 bg-black/40 border border-white/10 rounded-xl py-1.5 text-[11px] font-black text-center text-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </label>

                  <label className="flex items-center gap-4 p-2 rounded-2xl hover:bg-white/5 cursor-pointer group transition-all">
                    <div className={safeCn(
                      "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                      indics.has('EMA2') ? "bg-violet-500 border-violet-400 shadow-[0_0_15px_rgba(167,139,250,0.3)]" : "border-white/10 group-hover:border-white/30"
                    )}>
                      {indics.has('EMA2') && <Check className="w-4 h-4 text-black stroke-[3px]" />}
                    </div>
                    <input type="checkbox" className="hidden" checked={indics.has('EMA2')} onChange={() => { toggleIndic('EMA2'); vibrate(15); }} />
                    <span className="text-sm font-black text-zinc-200 flex-1" style={{ fontFamily: 'var(--font-heading)' }}>EMA 2</span>
                    <input 
                      type="number" 
                      value={ema2Period}
                      onChange={(e) => setEmaPersist(2, parseInt(e.target.value) || 50)}
                      className="w-14 bg-black/40 border border-white/10 rounded-xl py-1.5 text-[11px] font-black text-center text-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </label>

                  <label className="flex items-center gap-4 p-2 rounded-2xl hover:bg-white/5 cursor-pointer group transition-all">
                    <div className={safeCn(
                      "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                      indics.has('BB') ? "bg-indigo-500 border-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.3)]" : "border-white/10 group-hover:border-white/30"
                    )}>
                      {indics.has('BB') && <Check className="w-4 h-4 text-black stroke-[3px]" />}
                    </div>
                    <input type="checkbox" className="hidden" checked={indics.has('BB')} onChange={() => { toggleIndic('BB'); vibrate(15); }} />
                    <span className="text-sm font-black text-zinc-200" style={{ fontFamily: 'var(--font-heading)' }}>布林通道 BOLLINGER</span>
                  </label>
                </div>
              </div>

              <div className="h-px bg-white/10 relative z-10" />

              {/* Sub Panels */}
              <div className="flex flex-col gap-3 relative z-10">
                <div className="text-[10px] font-black opacity-30 uppercase tracking-[0.25em] px-1" style={{ fontFamily: 'var(--font-data)' }}>震盪指標 OSCILLATORS</div>
                
                <label className="flex items-center gap-4 p-2 rounded-2xl hover:bg-white/5 cursor-pointer group transition-all">
                  <div className={safeCn(
                    "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                    indics.has('Volume') ? "bg-emerald-500 border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]" : "border-white/10 group-hover:border-white/30"
                  )}>
                    {indics.has('Volume') && <Check className="w-4 h-4 text-black stroke-[3px]" />}
                  </div>
                  <input type="checkbox" className="hidden" checked={indics.has('Volume')} onChange={() => { toggleIndic('Volume'); vibrate(15); }} />
                  <span className="text-sm font-black text-zinc-200" style={{ fontFamily: 'var(--font-heading)' }}>成交量 VOLUME</span>
                </label>

                <div className="flex items-center gap-1.5 mt-2 bg-black/40 p-1.5 rounded-2xl border border-white/5">
                  {(['none','RSI','MACD'] as SubPanel[]).map(p => (
                    <button key={p} onClick={() => { setSubPanelPersist(p); vibrate(15); }}
                      className={safeCn('flex-1 py-2.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest',
                        subPanel===p ? 'bg-indigo-500 text-white shadow-lg' : 'text-zinc-500 hover:text-white hover:bg-white/5')}>
                      {p==='none'?'OFF':p}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Top Legend Bar (Minimized) */}
      <div className="flex items-center gap-4 px-4 py-2.5 shrink-0 z-20 bg-black/40 border-b border-white/5 relative overflow-x-auto no-scrollbar pointer-events-none backdrop-blur-md">
        <div className="flex items-center gap-4 pr-12 min-w-max">
          <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums"><span className="opacity-30 font-black">O</span><span id="legend-open" className="font-bold opacity-80">-</span></div>
          <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums"><span className="opacity-30 font-black">H</span><span id="legend-high" className="font-bold opacity-80">-</span></div>
          <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums"><span className="opacity-30 font-black">L</span><span id="legend-low" className="font-bold opacity-80">-</span></div>
          <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums"><span className="opacity-30 font-black">C</span><span id="legend-close" className="font-bold">-</span></div>
          
          <div className="w-px h-3 bg-white/10 mx-1" />

          {indics.has('Volume') && <div className="flex items-center gap-1.5 text-[10px] font-mono font-black text-indigo-400/80 uppercase tracking-tighter"><span>VOL</span><span id="legend-vol" className="font-bold opacity-100">-</span></div>}
          {indics.has('EMA1') && <div className="flex items-center gap-1.5 text-[10px] font-mono font-black text-amber-400/80 uppercase tracking-tighter"><span>EMA1</span><span id="legend-ema20" className="font-bold opacity-100">-</span></div>}
          {indics.has('EMA2') && <div className="flex items-center gap-1.5 text-[10px] font-mono font-black text-violet-400/80 uppercase tracking-tighter"><span>EMA2</span><span id="legend-ema50" className="font-bold opacity-100">-</span></div>}
          {subPanel==='RSI' && <div className="flex items-center gap-1.5 text-[10px] font-mono font-black text-sky-400/80 uppercase tracking-tighter"><span>RSI</span><span id="legend-rsi" className="font-bold opacity-100">-</span></div>}
          {subPanel==='MACD' && (
            <div className="flex items-center gap-3 text-[10px] font-mono font-black uppercase tracking-tighter">
              <span className="text-sky-400/80">MACD <span id="legend-macd" className="font-bold opacity-100">-</span></span>
              <span className="text-amber-400/80">SIG <span id="legend-macd-sig" className="font-bold opacity-100">-</span></span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 relative min-h-0 bg-[#0a0a0c]">
        <div ref={mainRef} className="absolute inset-0" />
        <div 
          ref={tooltipRef} 
          className="absolute hidden z-30 pointer-events-none p-4 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] text-[10px] sm:text-[11px] font-mono min-w-[220px] glass-card border border-white/10 backdrop-blur-2xl" 
          style={{ 
            color: 'var(--md-on-surface)'
          }}
        />
      </div>

      {indics.has('Volume') && (
        <div className="shrink-0 border-t border-[var(--border-color)] relative" style={{ height: SUB_H }}>
          <span className="absolute top-1 left-1.5 text-xs text-[var(--text-color)] opacity-50 font-bold z-10 pointer-events-none">Volume</span>
          <div ref={volRef} className="w-full h-full" />
        </div>
      )}

      {subPanel !== 'none' && (
        <div className="shrink-0 border-t border-[var(--border-color)] relative" style={{ height: SUB_H }}>
          <span className="absolute top-1 left-1.5 text-xs text-[var(--text-color)] opacity-50 font-bold z-10 pointer-events-none">{subPanel}</span>
          <div ref={subRef} className="w-full h-full" />
        </div>
      )}
    </div>
  );
}