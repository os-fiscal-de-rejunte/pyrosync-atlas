import { describe, expect, it } from 'vitest';
import { MONITOR_INTERVAL, newObservations } from './live';
import type { RecentFeature, RecentSnapshot } from './types';

function point(id: string): RecentFeature {
  return {
    type: 'Feature', geometry: { type: 'Point', coordinates: [-44, -7] },
    properties: { id, observado_em_utc: '2025-01-02T12:00:00Z', sensor_family: 'VIIRS',
      produto: 'VIIRS_NOAA20_NRT', satelite: 'N20', confianca: 'n' },
  };
}

function snapshot(features: RecentFeature[], reset = false): RecentSnapshot {
  return {
    type: 'FeatureCollection', features,
    metadata: { consultado_em_utc: '2025-01-02T13:00:00Z', inicio_janela_utc: '2025-01-01T00:00:00Z',
      total_disponibilizado: 10, limite: 500, fontes: ['VIIRS_NOAA20_NRT'], versao: 'nova',
      referencia_reiniciada: reset, total_novos: features.length, novos_truncados: false },
  };
}

describe('monitoramento de observações', () => {
  it('estabelece uma referência sem anunciar dados anteriores', () => {
    const seen = new Map<string, string>();
    expect(newObservations(null, snapshot([point('antigo')]), seen)).toEqual([]);
    expect(MONITOR_INTERVAL).toBe(300_000);
  });

  it('marca apenas registros informados como novos e evita repetir o mesmo ponto', () => {
    const seen = new Map<string, string>();
    expect(newObservations('anterior', snapshot([point('novo')]), seen)).toHaveLength(1);
    expect(newObservations('seguinte', snapshot([point('novo')]), seen)).toEqual([]);
  });

  it('não cria alertas quando a referência do servidor foi reiniciada', () => {
    const seen = new Map([['antes', '2025-01-02T12:00:00Z']]);
    expect(newObservations('anterior', snapshot([point('existente')], true), seen)).toEqual([]);
    expect(seen.size).toBe(0);
  });
});
