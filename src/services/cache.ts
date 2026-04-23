// Vercel react-best-practices: js-index-maps & server-cache-lru
// True LRU: track lastAccessed per entry so we evict the least-recently-used item,
// not just the oldest-inserted one (Map insertion order ≠ access order).
interface CacheEntry { data: unknown; timestamp: number; lastAccessed: number }

const cache = new Map<string, CacheEntry>();
const DEFAULT_CACHE_DURATION = 60 * 1000; // 1 minute
const MAX_CACHE_SIZE = 200;

/**
 * Checks if current time is within Taiwan or US market hours (Taiwan Time UTC+8).
 * TW Market: 09:00 - 13:30 (Mon-Fri)
 * US Market: 21:30 - 05:00 (Mon-Sat morning in TW time)
 */
export function isMarketHours(): boolean {
  // Get Taiwan Time (UTC+8)
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const twTime = new Date(utc + 3600000 * 8);
  const day = twTime.getDay(); // 0=Sun, 6=Sat
  const hour = twTime.getHours();
  const min = twTime.getMinutes();
  const totalMin = hour * 60 + min;

  const isWeekday = day >= 1 && day <= 5;
  const isSaturdayMorning = day === 6 && hour < 5; // US Market usually closes Sat morning TW time

  // TW Market: 09:00 - 13:30
  const isTWOpen = isWeekday && totalMin >= 9 * 60 && totalMin <= 13 * 60 + 30;
  // US Market: 21:30 - 05:00 (approximate covers most cases)
  const isUSOpen = (isWeekday && totalMin >= 21 * 60 + 30) || isSaturdayMorning || (isWeekday && hour < 5);

  return isTWOpen || isUSOpen;
}

/**
 * Retrieve cached data. Returns null on miss or expiry.
 * If isMarketHours is true, we might want to ignore or shorten cache in the caller.
 */
export function getCachedData<T>(key: string, validator?: (d: unknown) => d is T, customTTL?: number): T | null {
  const cached = cache.get(key);
  const ttl = customTTL ?? DEFAULT_CACHE_DURATION;
  
  if (cached && Date.now() - cached.timestamp < ttl) {
    cached.lastAccessed = Date.now();
    if (validator) {
      return validator(cached.data) ? (cached.data as T) : null;
    }
    return cached.data as T;
  }
  if (cached) cache.delete(key);
  return null;
}

export function setCachedData(key: string, data: unknown) {
  // Evict the least-recently-used entry when cache is full
  if (cache.size >= MAX_CACHE_SIZE) {
    let lruKey: string | undefined;
    let lruTime = Infinity;
    for (const [k, v] of cache) {
      if (v.lastAccessed < lruTime) { lruTime = v.lastAccessed; lruKey = k; }
    }
    if (lruKey !== undefined) cache.delete(lruKey);
  }
  const now = Date.now();
  cache.set(key, { data, timestamp: now, lastAccessed: now });
}
