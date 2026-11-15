import type { RecentFeature, RecentSnapshot } from './types';

export const MONITOR_INTERVAL = 5 * 60 * 1000;

export function newObservations(
  previousVersion: string | null,
  current: RecentSnapshot,
  seen: Map<string, string>,
): RecentFeature[] {
  if (!previousVersion || current.metadata.referencia_reiniciada) {
    seen.clear();
    return [];
  }
  const found = current.features.filter((item) => !seen.has(item.properties.id));
  found.forEach((item) => seen.set(item.properties.id, item.properties.observado_em_utc));
  for (const [id, observed] of seen) {
    if (observed < current.metadata.inicio_janela_utc) seen.delete(id);
  }
  return found;
}
