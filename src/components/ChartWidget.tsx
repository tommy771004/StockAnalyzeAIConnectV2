import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, IChartApi, ISeriesApi, ColorType, Time, CandlestickSeries, HistogramSeries, LineSeries, AreaSeries } from 'lightweight-charts';
import { useSettings } from '../contexts/SettingsContext';
import { HistoricalData } from '../types';
import { safeCn } from '../utils/helpers';
import { Loader2, Settings2, BarChart3, TrendingUp, Activity, Plus, Maximize2, Layers } from 'lucide-react';
import { calcSMA, calcRSI, calcMACD } from '../lib/indicators';

interface Props { 
  symbol?: string;
  data?: HistoricalData[]; 
  focusMode?: boolean;
  onTimeframeChange?: (timeframe: string) => void;
}

type ChartType = 'candle' | 'line' | 'area';

const ChartWidget: React.FC<Props> = ({ symbol = "AAPL", data = [], focusMode = false, onTimeframeChange }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const smaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  
  const { settings } = useSettings();
  const [chartType, setChartType] = useState<ChartType>('candle');
  const [showSMA, setShowSMA] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [timeframe, setTimeframe] = useState('1D');
  const [hoverData, setHoverData] = useState<any>(null);

  const isDark = settings.theme !== 'light';

  // Memoized data processing for performance
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return [...data]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map(d => {
        const timestamp = new Date(d.date).getTime();
        return {
          time: (timestamp / 1000) as Time,
          open: Number(d.open),
          high: Number(d.high),
          low: Number(d.low),
          close: Number(d.close),
          value: Number(d.volume || 0),
          color: Number(d.close) >= Number(d.open) ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
        };
      });
  }, [data]);

  // Unified chart initialization and update
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const bgColor = isDark ? (focusMode ? '#131722' : 'transparent') : '#ffffff';
    const textColor = isDark ? '#9ca3af' : '#4b5563';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: bgColor },
        textColor,
        fontSize: 11,
        fontFamily: 'var(--font-heading), sans-serif',
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      crosshair: {
        mode: 1,
        vertLine: { labelBackgroundColor: '#6366f1' },
        horzLine: { labelBackgroundColor: '#6366f1' },
      },
      timeScale: {
        borderColor: gridColor,
        timeVisible: true,
        fixLeftEdge: true,
        barSpacing: 8,
      },
      rightPriceScale: {
        borderColor: gridColor,
        autoScale: true,
      },
      localization: {
        locale: 'zh-Hant-CN',
        dateFormat: 'yyyy/MM/dd',
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
    });
    
    chartRef.current = chart;

    // Add Main Series
    let series: ISeriesApi<any>;
    if (chartType === 'candle') {
      series = chart.addSeries(CandlestickSeries, {
        upColor: '#10b981',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
      });
    } else if (chartType === 'area') {
      series = chart.addSeries(AreaSeries, {
        lineColor: '#6366f1',
        topColor: 'rgba(99, 102, 241, 0.4)',
        bottomColor: 'rgba(99, 102, 241, 0)',
        lineWidth: 2,
      });
    } else {
      series = chart.addSeries(LineSeries, {
        color: '#6366f1',
        lineWidth: 2,
      });
    }
    mainSeriesRef.current = series;

    // Add Volume
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    chart.priceScale('').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;

    // Add SMA
    const smaSeries = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    smaSeriesRef.current = smaSeries;

    // Crosshair move handler
    chart.subscribeCrosshairMove(param => {
      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.y < 0
      ) {
        setHoverData(null);
      } else {
        const timestamp = typeof param.time === 'number' ? param.time * 1000 : new Date(param.time as string).getTime();
        const fullDate = new Date(timestamp).toLocaleDateString('zh-TW', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });

        const mainData = param.seriesData.get(mainSeriesRef.current!) as any;
        const volData = param.seriesData.get(volumeSeriesRef.current!) as any;
        const smaVal = param.seriesData.get(smaSeriesRef.current!) as any;

        // Calculate MACD/RSI for full context
        const closes = processedData.map(d => d.close);
        const rsiValues = calcRSI(closes, 14);
        const macdData = calcMACD(closes);
        
        // Find index for the current time to get RSI/MACD
        const dataIndex = processedData.findIndex(d => d.time === param.time);
        
        setHoverData({
          time: fullDate,
          open: mainData?.open || mainData?.value || 0,
          high: mainData?.high || mainData?.value || 0,
          low: mainData?.low || mainData?.value || 0,
          close: mainData?.close || mainData?.value || 0,
          volume: volData?.value || 0,
          sma: smaVal?.value || null,
          rsi: dataIndex !== -1 ? rsiValues[dataIndex] : null,
          macd: dataIndex !== -1 ? macdData.histogram[dataIndex] : null,
        });
      }
    });

    // Resize handler using ResizeObserver
    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length > 0 && chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    });

    if (chartContainerRef.current) {
      resizeObserver.observe(chartContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [isDark, focusMode, chartType]);

  // Data update effect
  useEffect(() => {
    if (!mainSeriesRef.current || !volumeSeriesRef.current || !processedData.length) return;

    try {
      const uniqueData = Array.from(new Map(processedData.map(item => [item.time, item])).values());
      
      // Main series
      if (chartType === 'candle') {
        const candleData = uniqueData.map(d => ({
          time: d.time, open: d.open, high: d.high, low: d.low, close: d.close
        }));
        mainSeriesRef.current.setData(candleData);
      } else {
        const lineData = uniqueData.map(d => ({
          time: d.time, value: d.close
        }));
        mainSeriesRef.current.setData(lineData);
      }

      // Volume
      if (showVolume) {
        volumeSeriesRef.current.setData(uniqueData.map(d => ({
          time: d.time, value: d.value, color: d.color
        })));
      } else {
        volumeSeriesRef.current.setData([]);
      }

      // SMA (20)
      if (showSMA) {
        const closes = uniqueData.map(d => d.close);
        const smaValues = calcSMA(closes, 20);
        const smaData = uniqueData
          .map((d, i) => ({ time: d.time, value: smaValues[i] }))
          .filter(v => v.value !== null) as { time: Time, value: number }[];
        smaSeriesRef.current?.setData(smaData);
      } else {
        smaSeriesRef.current?.setData([]);
      }

      chartRef.current?.timeScale().fitContent();
    } catch (err) {
      console.warn("Failed to set chart data", err);
    }
  }, [processedData, chartType, showSMA, showVolume]);

  return (
    <div className={safeCn(
      "w-full h-full flex flex-col overflow-hidden relative",
      focusMode && "bg-[#131722]"
    )}>
      {/* Top Toolbar - Stock Analysis Style */}
      <div className="flex flex-nowrap items-center justify-between px-2 py-1 border-b border-zinc-200/30 dark:border-zinc-800/30 bg-zinc-50/20 dark:bg-zinc-900/20 z-20 overflow-x-auto no-scrollbar gap-2 backdrop-blur-md">
        <div className="flex items-center gap-1.5 min-w-max">
          {/* Chart Types */}
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setChartType('candle')}
              className={safeCn("p-1.5 rounded-md transition-all active:scale-90", chartType === 'candle' ? "bg-indigo-500/10 text-indigo-500" : "text-zinc-500 hover:bg-white/10")}
              title="K線圖"
            >
              <BarChart3 size={15} />
            </button>
            <button 
              onClick={() => setChartType('area')}
              className={safeCn("p-1.5 rounded-md transition-all active:scale-90", chartType === 'area' ? "bg-indigo-500/10 text-indigo-500" : "text-zinc-500 hover:bg-white/10")}
              title="面積圖"
            >
              <TrendingUp size={15} />
            </button>
          </div>

          <div className="h-4 w-px bg-zinc-300/30 dark:bg-zinc-700/30 mx-1" />

          {/* Indicators */}
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setShowSMA(!showSMA)}
              className={safeCn(
                "px-2 py-1 text-[9px] font-black rounded-md transition-all border shrink-0",
                showSMA 
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.1)]" 
                  : "border-zinc-200/30 dark:border-zinc-800/30 text-zinc-500 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50"
              )}
            >
              SMA(20)
            </button>
            <button 
              onClick={() => setShowVolume(!showVolume)}
              className={safeCn(
                "px-2 py-1 text-[9px] font-black rounded-md transition-all border shrink-0",
                showVolume 
                  ? "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.1)]" 
                  : "border-zinc-200/30 dark:border-zinc-800/30 text-zinc-500 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50"
              )}
            >
              VOL
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button className="p-1.5 text-zinc-500 hover:text-indigo-500 hover:bg-white/5 rounded-md transition-all" title="圖表設定">
            <Settings2 size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 relative bg-white/5 dark:bg-black/10">
        {/* Floating Timeframe Group - Integrated into Chart with Zero-Clutter Transparency */}
        <div className="absolute top-1.5 right-1.5 z-30 flex items-center gap-0.5 p-0 overflow-hidden pointer-events-auto">
          {['1D', '5D', '1M', '6M', 'YTD', '1Y'].map((t) => (
            <button
              key={t}
              onClick={() => {
                setTimeframe(t);
                onTimeframeChange?.(t);
              }}
              className={safeCn(
                "px-1 py-0 text-[10px] sm:text-[11px] font-black transition-all text-center leading-none h-4 min-w-[20px] flex items-center justify-center rounded-sm",
                timeframe === t 
                  ? "bg-indigo-500/80 text-white" 
                  : "text-zinc-500/60 hover:text-white hover:bg-white/10"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {(!data || data.length === 0) && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/5 dark:bg-white/5 backdrop-blur-sm">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-2" />
            <span className="text-[10px] font-black text-zinc-500 max-w-[200px] text-center uppercase tracking-[0.2em]">
              正在獲取市場行情...
            </span>
          </div>
        )}
        <div 
          ref={chartContainerRef}
          className="w-full h-full absolute inset-0"
        />
        
        {/* Floating Tooltip - High Interaction */}
        {hoverData && (
          <div className="absolute top-2 left-2 z-40 bg-zinc-950/80 backdrop-blur-md p-2 rounded-lg border border-white/10 shadow-2xl pointer-events-none flex flex-col gap-1 min-w-[140px]">
             <div className="text-[10px] text-zinc-400 font-mono mb-1 border-b border-white/5 pb-1 uppercase tracking-tighter">
               {hoverData.time}
             </div>
             <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
               <div className="flex justify-between items-center">
                 <span className="text-[9px] text-zinc-500 uppercase">O:</span>
                 <span className="text-[10px] font-mono text-zinc-100">{hoverData.open.toFixed(2)}</span>
               </div>
               <div className="flex justify-between items-center">
                 <span className="text-[9px] text-zinc-500 uppercase">H:</span>
                 <span className="text-[10px] font-mono text-emerald-400">{hoverData.high.toFixed(2)}</span>
               </div>
               <div className="flex justify-between items-center">
                 <span className="text-[9px] text-zinc-500 uppercase">L:</span>
                 <span className="text-[10px] font-mono text-red-400">{hoverData.low.toFixed(2)}</span>
               </div>
               <div className="flex justify-between items-center">
                 <span className="text-[9px] text-zinc-500 uppercase">C:</span>
                 <span className="text-[10px] font-mono text-zinc-100">{hoverData.close.toFixed(2)}</span>
               </div>
             </div>
             <div className="flex justify-between items-center mt-1 border-t border-white/5 pt-1">
               <span className="text-[9px] text-zinc-500 uppercase">VOL:</span>
               <span className="text-[10px] font-mono text-zinc-300">{(hoverData.volume / 1000).toFixed(1)}K</span>
             </div>
             {hoverData.sma && (
               <div className="flex justify-between items-center">
                 <span className="text-[9px] text-amber-500/80 uppercase">SMA:</span>
                 <span className="text-[10px] font-mono text-amber-400">{hoverData.sma.toFixed(2)}</span>
               </div>
             )}
             {hoverData.rsi && (
               <div className="flex justify-between items-center">
                 <span className="text-[9px] text-indigo-400/80 uppercase">RSI:</span>
                 <span className="text-[10px] font-mono text-indigo-300">{hoverData.rsi.toFixed(2)}</span>
               </div>
             )}
             {hoverData.macd !== null && (
                <div className="flex justify-between items-center">
                  <span className="text-[9px] text-emerald-400/80 uppercase">MACD:</span>
                  <span className={safeCn("text-[10px] font-mono", hoverData.macd >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {hoverData.macd.toFixed(2)}
                  </span>
                </div>
             )}
          </div>
        )}

        {/* Floating Timeframe Badge (Minimalized) */}
        {!focusMode && data.length > 0 && (
          <div className="absolute top-3 left-3 z-10 pointer-events-none select-none flex items-center gap-2">
            <span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-400 text-[9px] font-black rounded border border-indigo-500/30 uppercase tracking-tighter backdrop-blur-md">
              {timeframe}
            </span>
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-800/30 px-2 py-0.5 rounded-full border border-zinc-700/50 backdrop-blur-md">
              {data.length} PACKETS
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChartWidget;