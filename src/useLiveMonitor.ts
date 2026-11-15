import { useEffect, useState } from 'react';
import { getData } from './api';
import { MONITOR_INTERVAL, newObservations, scheduleAlertExpiry } from './live';
import type { RecentFeature, RecentSnapshot } from './types';

type MonitorStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface MonitorState {
  status: MonitorStatus;
  checkedAt: string | null;
  total: number | null;
  truncated: boolean;
  referenceReset: boolean;
  alerts: RecentFeature[];
  newCount: number;
  error: string;
}

const empty: MonitorState = {
  status: 'idle', checkedAt: null, total: null, truncated: false, referenceReset: false,
  alerts: [], newCount: 0, error: '',
};

export function useLiveMonitor(enabled: boolean) {
  const [monitor, setMonitor] = useState<MonitorState>(empty);

  useEffect(() => {
    setMonitor(empty);
    if (!enabled) return;
    let stopped = false;
    let busy = false;
    let lastAttempt = 0;
    let timer: number | undefined;
    let expiry: number | undefined;
    let controller: AbortController | undefined;
    let version: string | null = null;
    const seen = new Map<string, string>();

    const poll = async () => {
      if (stopped || busy) return;
      if (timer !== undefined) window.clearTimeout(timer);
      busy = true;
      lastAttempt = Date.now();
      controller = new AbortController();
      setMonitor((old) => ({ ...old, status: 'loading', error: '' }));
      try {
        const current = await getData<RecentSnapshot>('/gateway/focos-recentes', {
          depois: version || undefined,
        }, controller.signal);
        if (stopped) return;
        const found = newObservations(version, current, seen);
        version = current.metadata.versao;
        setMonitor({
          status: 'ready', checkedAt: current.metadata.consultado_em_utc,
          total: current.metadata.total_disponibilizado, truncated: current.metadata.novos_truncados,
          referenceReset: current.metadata.referencia_reiniciada,
          alerts: current.metadata.referencia_reiniciada ? [] : found,
          newCount: current.metadata.referencia_reiniciada ? 0 : current.metadata.total_novos,
          error: '',
        });
        if (expiry !== undefined) window.clearTimeout(expiry);
        if (found.length || current.metadata.total_novos) {
          expiry = scheduleAlertExpiry(() => setMonitor((old) => ({ ...old, alerts: [], newCount: 0 })));
        }
      } catch (error) {
        if (!stopped && !controller.signal.aborted) {
          setMonitor((old) => ({ ...old, status: 'error', error: error instanceof Error ? error.message : 'Consulta indisponível.' }));
        }
      } finally {
        busy = false;
        if (!stopped) timer = window.setTimeout(poll, MONITOR_INTERVAL);
      }
    };

    const resume = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastAttempt >= MONITOR_INTERVAL) void poll();
    };
    document.addEventListener('visibilitychange', resume);
    void poll();
    return () => {
      stopped = true;
      controller?.abort();
      if (timer !== undefined) window.clearTimeout(timer);
      if (expiry !== undefined) window.clearTimeout(expiry);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [enabled]);

  const clearAlerts = () => setMonitor((old) => ({ ...old, alerts: [], newCount: 0 }));
  return { monitor, clearAlerts };
}
