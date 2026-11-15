import { useId, useRef, useState, type FormEvent } from 'react';
import { CalendarDays, ChevronDown, CircleHelp, X } from 'lucide-react';
import { dateUtc } from './api';

export type MonthlyLayer = { month: string; scope: 'world' | 'country' };
export type MonthlyStatus = 'loading' | 'ready' | 'error';

interface Props {
  country: string | null;
  active: MonthlyLayer | null;
  status: MonthlyStatus;
  onApply: (layer: MonthlyLayer) => void;
  onRemove: () => void;
}

export default function MonthlyHistory({ country, active, status, onApply, onRemove }: Props) {
  const id = useId();
  const details = useRef<HTMLDetailsElement>(null);
  const [month, setMonth] = useState(dateUtc().slice(0, 7));
  const [scope, setScope] = useState<'world' | 'country'>('world');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (scope === 'country' && !country) return;
    onApply({ month, scope });
    if (details.current) details.current.open = false;
  };
  return <details ref={details} className="monthly-history">
    <summary><span className="monitor-symbol"><CalendarDays size={17} /></span><span className="monitor-label"><strong>Histórico no mapa</strong><small>{active ? `${active.month} · ${active.scope === 'world' ? 'Mundo' : country}${status === 'loading' ? ' · Carregando' : status === 'error' ? ' · Erro ao carregar' : ''}` : 'Escolha um mês e uma área'}</small></span><ChevronDown size={16} /></summary>
    <div className="monthly-content">
      <form onSubmit={submit}>
        <label htmlFor={`${id}-month`}>Mês da observação</label>
        <input id={`${id}-month`} type="month" min="2000-11" max={dateUtc().slice(0, 7)} value={month} onChange={(event) => setMonth(event.target.value)} required />
        <label htmlFor={`${id}-scope`}>Onde mostrar</label>
        <select id={`${id}-scope`} value={scope} onChange={(event) => setScope(event.target.value as 'world' | 'country')}>
          <option value="world">Mundo inteiro</option>
          <option value="country" disabled={!country}>{country ? `País selecionado: ${country}` : 'Selecione um país no mapa'}</option>
        </select>
        <button className="monthly-apply" type="submit">Mostrar no globo</button>
      </form>
      {active && <div className="monthly-result" role="status">{status === 'loading' ? 'Carregando o mapa da NASA. Isso pode levar alguns instantes.' : status === 'error' ? 'Não foi possível carregar todo o mapa. Tente mostrar novamente.' : 'Mapa histórico disponível. Aproxime para ver os pontos.'}<button type="button" onClick={onRemove}><X size={14} /> Remover mapa</button></div>}
      <details className="monitor-help"><summary><CircleHelp size={14} /> O que aparece?</summary><p>Os pontos vermelhos representam registros térmicos MODIS e VIIRS disponibilizados pela NASA para o mês, não incêndios confirmados. Pontos podem se sobrepor. A cobertura varia por sensor e data; áreas sem pontos não comprovam ausência de fogo.</p></details>
      <a href="https://firms.modaps.eosdis.nasa.gov/mapserver/wms-info/" target="_blank" rel="noreferrer">Fonte: NASA FIRMS · dados em UTC</a>
    </div>
  </details>;
}
