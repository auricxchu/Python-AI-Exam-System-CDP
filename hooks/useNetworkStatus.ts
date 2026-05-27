import { useState, useEffect, useCallback } from 'react';

/**
 * Global network status hook.
 * Monitors navigator.onLine + online/offline events for near-instant detection.
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(() => {
    // Guard: navigator may not exist in SSR/test environments
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Re-sync in case navigator.onLine drifted
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline };
}

/**
 * Detect whether an error was caused by a network failure (as opposed to
 * a server-side / API-level error).
 *
 * Covers:
 * - fetch() throwing TypeError when the browser is offline
 * - Chromium "Failed to fetch"
 * - Firefox "NetworkError when attempting to fetch resource"
 * - Supabase / postgrest-js network errors
 * - Generic "Network Error" strings
 */
export function isNetworkError(error: unknown): boolean {
  if (!error) return false;

  const message = typeof error === 'string'
    ? error
    : (error as { message?: string }).message ?? '';

  const lower = message.toLowerCase();

  // Chromium / WebKit
  if (lower.includes('failed to fetch')) return true;
  // Firefox
  if (lower.includes('networkerror')) return true;
  // Generic network-related phrases
  if (lower.includes('network error')) return true;
  if (lower.includes('network request failed')) return true;
  // Fetch abort (timeout)
  if (error instanceof DOMException && error.name === 'AbortError') return true;

  // Navigator reports offline — treat any error at this moment as network-related
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;

  return false;
}
