import { Bell, ChevronDown, CircleHelp, MapPin, Radio, X } from 'lucide-react';
import { dateLabel, numberLabel } from './api';
import type { MonitorState } from './useLiveMonitor';

interface Props {
  country: string;
  region: string;
  monitor: MonitorState;
  onClear: () => void;
  onFocus: (lat: number, lon: number) => void;
}

function timeUtc(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'horário indisponível' :
    `${dateLabel(value)} às ${new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
    }).format(date)} UTC`;
}

export default function LiveMonitor({ country, region, monitor, onClear, onFocus }: Props) {
  const status = monitor.status === 'loading' ? 'Verificando observações...' :
    monitor.status === 'error' ? 'Verificação indisponível' :
      monitor.checkedAt ? `Verificado ${timeUtc(monitor.checkedAt)}` : 'Preparando monitoramento';
  return <details className="live-monitor">
    <summary>
      <span className={`monitor-symbol ${monitor.status === 'error' ? 'monitor-error' : ''}`}><Radio size={17} /></span>
      <span className="monitor-label"><strong>Monitoramento</strong><small>{status}</small></span>
      {monitor.newCount > 0 ? <span className="monitor-count"><Bell size={13} /> {numberLabel(monitor.newCount)} novos</span> : <ChevronDown size={16} />}
    </summary>
    <div className="monitor-content">
      <p>Acompanhando <strong>{region ? `${region}, ` : ''}{country}</strong> a cada 5 minutos enquanto esta página estiver aberta.</p>
      {monitor.error ? <p className="monitor-problem" role="status">{monitor.error} A próxima tentativa será automática.</p> :
        monitor.referenceReset ? <p role="status">A referência foi reiniciada. Novidades serão destacadas a partir desta consulta.</p> :
          monitor.total !== null ? <p role="status">{numberLabel(monitor.total)} registros retornados para ontem e hoje, em UTC. A primeira consulta cria a referência.</p> : null}
      {monitor.newCount > 0 && <>
        <div className="monitor-new-title"><strong>Novos registros</strong><button type="button" onClick={onClear}><X size={14} /> Limpar destaques</button></div>
        <ul className="monitor-list">{monitor.alerts.map((point) => {
          const [lon, lat] = point.geometry.coordinates;
          return <li key={point.properties.id}><button type="button" onClick={() => onFocus(lat, lon)}><MapPin size={14} /><span>{point.properties.sensor_family} · {timeUtc(point.properties.observado_em_utc)}<small>{lat.toFixed(3)}°, {lon.toFixed(3)}°</small></span></button></li>;
        })}</ul>
        {(monitor.truncated || monitor.newCount > monitor.alerts.length) && <p>A lista e o mapa exibem uma quantidade limitada dos registros mais recentes.</p>}
      </>}
      <details className="monitor-help"><summary><CircleHelp size={14} /> O que significa um ponto vermelho?</summary><p>É um registro térmico recente disponibilizado pelo FIRMS depois da referência inicial. Ele pode levar horas para aparecer e não confirma, sozinho, um incêndio. Os pontos piscam lentamente; o movimento respeita a preferência do dispositivo.</p></details>
      <a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noreferrer">Fonte: NASA FIRMS · MODIS e VIIRS</a>
    </div>
  </details>;
}
