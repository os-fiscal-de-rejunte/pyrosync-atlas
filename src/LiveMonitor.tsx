import { Bell, ChevronDown, CircleHelp, MapPin, Radio, X } from 'lucide-react';
import { dateLabel, numberLabel } from './api';
import type { MonitorState } from './useLiveMonitor';

interface Props {
  monitor: MonitorState;
  onClear: () => void;
  onFocus: (lat: number, lon: number) => void;
}

function timeUtc(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'time unavailable' :
    `${dateLabel(value)} at ${new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
    }).format(date)} UTC`;
}

export default function LiveMonitor({ monitor, onClear, onFocus }: Props) {
  const status = monitor.status === 'loading' ? 'Checking observations...' :
    monitor.status === 'error' ? 'Check unavailable' :
      monitor.checkedAt ? `Checked ${timeUtc(monitor.checkedAt)}` : 'Preparing the monitor';
  return <details className="live-monitor">
    <summary>
      <span className={`monitor-symbol ${monitor.status === 'error' ? 'monitor-error' : ''}`}><Radio size={17} /></span>
      <span className="monitor-label"><strong>Worldwide monitor</strong><small>{status}</small></span>
      {monitor.newCount > 0 ? <span className="monitor-count"><Bell size={13} /> {numberLabel(monitor.newCount)} new</span> : <ChevronDown size={16} />}
    </summary>
    <div className="monitor-content">
      <p>Watching <strong>the whole world</strong> every 5 minutes while this page is open. Each new point blinks for 10 seconds.</p>
      {monitor.error ? <p className="monitor-problem" role="status">{monitor.error} The next attempt is automatic.</p> :
        monitor.referenceReset ? <p role="status">The reference was reset. New records are highlighted from this query on.</p> :
          monitor.total !== null ? <p role="status">{numberLabel(monitor.total)} records returned for yesterday and today, in UTC. The first query sets the reference.</p> : null}
      {monitor.newCount > 0 && <>
        <div className="monitor-new-title"><strong>New records</strong><button type="button" onClick={onClear}><X size={14} /> Clear highlights</button></div>
        <ul className="monitor-list">{monitor.alerts.slice(0, 30).map((point) => {
          const [lon, lat] = point.geometry.coordinates;
          return <li key={point.properties.id}><button type="button" onClick={() => onFocus(lat, lon)}><MapPin size={14} /><span>{point.properties.sensor_family} · {timeUtc(point.properties.observado_em_utc)}<small>{lat.toFixed(3)}°, {lon.toFixed(3)}°</small></span></button></li>;
        })}</ul>
        {monitor.alerts.length > 30 && <p>The list shows the first 30 points. The map shows the rest available in this query.</p>}
        {monitor.truncated && <p>There were more records than this query's limit; the map shows the most recent.</p>}
      </>}
      <details className="monitor-help"><summary><CircleHelp size={14} /> What does a red point mean?</summary><p>It is a thermal record released by FIRMS after the first reference. It can take hours to appear and does not, on its own, confirm a fire. The highlight lasts 10 seconds; the motion follows the device preference.</p></details>
      <a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noreferrer">Source: NASA FIRMS · MODIS and VIIRS</a>
    </div>
  </details>;
}
