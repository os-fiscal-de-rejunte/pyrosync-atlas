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
    <summary><span className="monitor-symbol"><CalendarDays size={17} /></span><span className="monitor-label"><strong>History on the map</strong><small>{active ? `${active.month} · ${active.scope === 'world' ? 'World' : country}${status === 'loading' ? ' · Loading' : status === 'error' ? ' · Failed to load' : ''}` : 'Choose a month and an area'}</small></span><ChevronDown size={16} /></summary>
    <div className="monthly-content">
      <form onSubmit={submit}>
        <label htmlFor={`${id}-month`}>Month observed</label>
        <input id={`${id}-month`} type="month" min="2000-11" max={dateUtc().slice(0, 7)} value={month} onChange={(event) => setMonth(event.target.value)} required />
        <label htmlFor={`${id}-scope`}>Where to show</label>
        <select id={`${id}-scope`} value={scope} onChange={(event) => setScope(event.target.value as 'world' | 'country')}>
          <option value="world">Whole world</option>
          <option value="country" disabled={!country}>{country ? `Selected country: ${country}` : 'Choose a country on the map'}</option>
        </select>
        <button className="monthly-apply" type="submit">Show on the globe</button>
      </form>
      {active && <div className="monthly-result" role="status">{status === 'loading' ? 'Loading the NASA map. This can take a moment.' : status === 'error' ? 'The whole map could not be loaded. Try showing it again.' : 'History map ready. Zoom in to see the points.'}<button type="button" onClick={onRemove}><X size={14} /> Remove map</button></div>}
      <details className="monitor-help"><summary><CircleHelp size={14} /> What does it show?</summary><p>The red points are MODIS and VIIRS thermal records released by NASA for the month, not confirmed fires. Points can overlap. Coverage varies by sensor and date; an area without points does not prove the absence of fire.</p></details>
      <a href="https://firms.modaps.eosdis.nasa.gov/mapserver/wms-info/" target="_blank" rel="noreferrer">Source: NASA FIRMS · data in UTC</a>
    </div>
  </details>;
}
