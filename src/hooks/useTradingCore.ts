import { useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';
import { STORAGE_KEYS } from '../utils/storage';
import { Order, WatchlistItem, SearchResult } from '../types';

export function useTradeExecution(
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void,
  setPortfolio: React.Dispatch<React.SetStateAction<Order[]>>
) {
  const [orderStatus, setOrderStatus] = useState<'idle' | 'busy'>('idle');

  const executeOrder = useCallback(
    async (symbol: string, side: 'buy' | 'sell', qty: number, price: number) => {
      setOrderStatus('busy');
      try {
        const res = await api.executeTrade({
          symbol,
          side: side.toUpperCase(),
          qty,
          price,
          mode: 'paper',
        });

        // Fix: Server returns { ok: true, trade: ... }
        if (res.ok) {
          const trade = res.trade;
          const newOrder: Order = {
            id: trade.id || Date.now(),
            symbol: symbol,
            side: side.toUpperCase() as 'buy' | 'sell',
            qty,
            price,
            date: new Date().toISOString(),
          };
          setPortfolio((prev) => [...prev, newOrder]);
          showToast(`成功${side === 'buy' ? '買進' : '賣出'} ${qty} 股 ${symbol}`, 'success');
        } else {
          throw new Error('交易失敗');
        }
      } catch (e: unknown) {
        console.error('[TradingCore] Order execution failed:', e);
        showToast('交易處理失敗，請稍後再試。', 'error');
      } finally {
        setOrderStatus('idle');
      }
    },
    [setPortfolio, showToast]
  );

  return { executeOrder, orderStatus };
}

export function useWatchlistManagement(
  watchlist: unknown[],
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void
) {
  const queryClient = useQueryClient();
  const [wlSearch, setWlSearch] = useState('');
  const [wlAdding, setWlAdding] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (wlSearch.length < 2) {
      setSearchResults([]);
      return;
    }

    const handler = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await api.searchStocks(wlSearch);
        setSearchResults(res.quotes || []);
      } catch (e) {
        console.warn('[useWatchlistManagement] Search failed:', e);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [wlSearch]);

  const addToWatchlist = useCallback(
    async (sym: string) => {
      const typedWatchlist = watchlist as WatchlistItem[];
      if (!sym || typedWatchlist.find((w: WatchlistItem) => w.symbol === sym)) return;
      try {
        await api.addWatchlistItem(sym);
        queryClient.invalidateQueries({ queryKey: [STORAGE_KEYS.WATCHLIST] });
        setWlSearch('');
        setWlAdding(false);
        showToast(`已新增 ${sym} 至自選股`, 'success');
      } catch (e: unknown) {
        console.error('[TradingCore] Failed to add watchlist item:', e);
        showToast('新增自選股失敗，請稍後再試。', 'error');
      }
    },
    [watchlist, queryClient, showToast]
  );

  return { addToWatchlist, wlSearch, setWlSearch, wlAdding, setWlAdding, searchResults, isSearching };
}
