import type { FeatureCollection, Geometry } from 'geojson';

export interface CountryProperties {
  NAME_EN: string;
  NAME_PT: string | null;
  ISO_A3: string;
  ADM0_A3: string;
  LABEL_X: number;
  LABEL_Y: number;
}

export interface Country {
  code: string;
  english: string;
  name: string;
  lon: number;
  lat: number;
}

export interface ForecastProperties {
  celula_id: string;
  latitude: number;
  longitude: number;
  status: string;
  motivo: string | null;
  probabilidade_condicional: number | null;
  clima_power: Record<string, number> | null;
}

export type Forecast = FeatureCollection<Geometry, ForecastProperties> & {
  status: string;
  pais: string;
  regiao: string | null;
  inicio_previsto_utc: string;
  fim_previsto_utc: string;
  inicio_clima_utc: string;
  fim_clima_utc: string;
  proximo_cursor: number | null;
  aviso: string;
};

export interface Calendar {
  inicio: string;
  fim: string;
  fim_consultado: string;
  proximo_inicio: string | null;
  resultado_completo: boolean;
  fonte: string;
  camada: string;
  aviso: string;
  registros: { mes: string; sensor_family: string; deteccoes: number }[];
  dias: { data: string; sensor_family: string; deteccoes: number }[];
  disponibilidade: { instrumento: string; produto: string; inicio: string; fim: string; disponivel: boolean }[];
}

export type Points = FeatureCollection<Geometry, Record<string, unknown>> & {
  metadata?: { quantidade: number; proximo_deslocamento?: number | null; truncado?: boolean; aviso: string };
};

export interface Analysis {
  etapas: { agente: string; status: string; erro: string | null }[];
  revisao: string[];
  sintese: { texto: string; fontes: string[]; provedor: string } | null;
  evidencias: Record<string, unknown>;
  fontes: { id: string; nome: string; url: string }[];
  aviso: string;
}

export interface HistoryComparison {
  sensor: string;
  periodos: { inicio: string; fim: string; deteccoes: number | null; erro: string | null }[];
  aviso: string;
}

export interface CommunityReport {
  id: string;
  country: string;
  region: string | null;
  observed_at: string;
  latitude: number;
  longitude: number;
  category: string;
  description: string;
  status: string;
}
