import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronDown, CircleHelp, Compass, Crosshair, Database, Flame, Layers3, LoaderCircle, MapPin, Menu, Microscope, Navigation, Printer, Search, Send, SlidersHorizontal, Sparkles, UsersRound, X } from 'lucide-react';
import type { FeatureCollection } from 'geojson';
import Globe from './Globe';
import LiveMonitor from './LiveMonitor';
import MonthlyHistory from './MonthlyHistory';
import type { MonthlyLayer, MonthlyStatus } from './MonthlyHistory';
import { dateLabel, dateUtc, getData, numberLabel, percentLabel, postData } from './api';
import type { Analysis, Calendar, CommunityReport, Country, CountryProperties, Forecast, ForecastProperties, HistoryComparison, Points } from './types';
import { useLiveMonitor } from './useLiveMonitor';

type Tab = 'panorama' | 'calendario' | 'analise' | 'relatos' | 'cenario' | 'metodo';
type Sensor = '' | 'MODIS' | 'VIIRS';
type Layers = { previsao: boolean; focos: boolean; direto: boolean; relatos: boolean };
type Busy = { calendar: boolean; forecast: boolean; hotspots: boolean; direct: boolean; analysis: boolean; comparison: boolean; report: boolean };

const nav: { id: Tab; label: string; icon: typeof Compass }[] = [
  { id: 'panorama', label: 'Explorar', icon: Compass },
  { id: 'calendario', label: 'Calendário', icon: CalendarDays },
  { id: 'analise', label: 'Análise', icon: Sparkles },
  { id: 'cenario', label: 'Sandbox', icon: SlidersHorizontal },
  { id: 'relatos', label: 'Comunidade', icon: UsersRound },
];

const defaultBusy: Busy = { calendar: false, forecast: false, hotspots: false, direct: false, analysis: false, comparison: false, report: false };

function norm(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Não foi possível carregar os dados.';
}

function Spinner({ text = 'Consultando dados' }: { text?: string }) {
  return <div className="loading"><LoaderCircle size={16} className="spin" /> {text}<span className="loading-dots">...</span></div>;
}

function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <div className={`notice ${error ? 'notice-error' : ''}`} role={error ? 'alert' : undefined}><CircleHelp size={16} /> <span>{children}</span></div>;
}

function Explain({ subject, children }: { subject: string; children: React.ReactNode }) {
  return <details className="explain"><summary aria-label={`O que é? Entenda ${subject}`}><CircleHelp size={15} /> O que é?</summary><p>{children}</p></details>;
}

function IconButton({ title, onClick, children, active = false, expanded, controls }: { title: string; onClick: () => void; children: React.ReactNode; active?: boolean; expanded?: boolean; controls?: string }) {
  return <button type="button" aria-label={title} title={title} onClick={onClick} aria-expanded={expanded} aria-controls={controls} className={`icon-button ${active ? 'active' : ''}`}>{children}</button>;
}

function CalendarBars({ calendar }: { calendar: Calendar }) {
  const dates = Array.from(new Set(calendar.dias.map((d) => d.data))).sort();
  if (!dates.length) return <div className="empty-chart">Nenhum registro retornado para esta página. Isso não confirma ausência de fogo.</div>;
  const peak = Math.max(1, ...calendar.dias.map((d) => d.deteccoes));
  return <div className="bar-chart" role="img" aria-label={`Contagem de registros por dia e sensor. ${calendar.dias.map((item) => `${dateLabel(item.data)}, ${item.sensor_family}: ${numberLabel(item.deteccoes)}`).join('; ')}.`}>
    {dates.map((day) => <div className="bar-day" key={day}>
      <div className="bars">
        {(['MODIS', 'VIIRS'] as const).map((sensor) => {
          const record = calendar.dias.find((item) => item.data === day && item.sensor_family === sensor);
          return <div className={`bar bar-${sensor.toLowerCase()}`} key={sensor} style={{ height: record ? `${Math.max(4, record.deteccoes / peak * 100)}%` : '3px' }} title={`${sensor}: ${record ? numberLabel(record.deteccoes) + ' registros' : 'sem registro retornado'}`} />;
        })}
      </div>
      <span>{dateLabel(day).slice(0, 5)}</span>
    </div>)}
  </div>;
}

function CellList({ forecast, selectedCell, onSelect, onNext }: { forecast: Forecast; selectedCell: string | null; onSelect: (cell: ForecastProperties) => void; onNext: () => void }) {
  if (!forecast.features.length) return <Notice>Nenhuma célula foi retornada para esta seleção.</Notice>;
  return <>
    <div className="cell-list">
      {forecast.features.map(({ properties: cell }) => <button type="button" key={cell.celula_id} onClick={() => onSelect(cell)} className={`cell-row ${selectedCell === cell.celula_id ? 'cell-active' : ''}`}>
        <span className="cell-mark" />
        <span><strong>{cell.celula_id.replace('global_', 'Célula ')}</strong><small>{cell.latitude.toFixed(3)}°, {cell.longitude.toFixed(3)}°</small></span>
        <span className="cell-value">{percentLabel(cell.probabilidade_condicional)}<small>{cell.probabilidade_condicional == null ? 'sem dados' : 'condicional'}</small></span>
      </button>)}
    </div>
    <div className="pagination"><span>Até 8 células por página</span><button className="text-button" disabled={forecast.proximo_cursor == null} onClick={onNext}>Próxima página <ArrowRight size={14} /></button></div>
  </>;
}

function sensorTotal(calendar: Calendar | null, sensor: string) {
  if (!calendar) return null;
  const records = calendar.registros.filter((row) => row.sensor_family === sensor);
  return records.length ? records.reduce((sum, row) => sum + row.deteccoes, 0) : null;
}

function HistoricalEvidence({ analysis }: { analysis: Analysis }) {
  const history = analysis.evidencias.B as HistoryComparison | undefined;
  if (!history?.periodos?.length) return null;
  return <div className="history-evidence"><h4>O mesmo período em outros anos</h4><p>Registros VIIRS retornados pelo FIRMS para o território selecionado.</p><div className="comparison-list">{history.periodos.map((period) => <div key={period.inicio}><span>{dateLabel(period.inicio)} — {dateLabel(period.fim)}</span><strong>{period.deteccoes == null ? 'Indisponível' : numberLabel(period.deteccoes)}</strong></div>)}</div><p>{history.aviso}</p></div>;
}

function App() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [country, setCountry] = useState<Country | null>(null);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [tab, setTab] = useState<Tab>('panorama');
  const [intro, setIntro] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [focusCell, setFocusCell] = useState<{ lat: number; lon: number; request: number } | null>(null);
  const [menu, setMenu] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [layers, setLayers] = useState<Layers>({ previsao: true, focos: true, direto: false, relatos: true });
  const [monthly, setMonthly] = useState<MonthlyLayer | null>(null);
  const [monthlyStatus, setMonthlyStatus] = useState<MonthlyStatus>('loading');
  const [regionInput, setRegionInput] = useState('');
  const [region, setRegion] = useState('');
  const [draftStart, setDraftStart] = useState(dateUtc(5));
  const [draftEnd, setDraftEnd] = useState(dateUtc(1));
  const [draftSensor, setDraftSensor] = useState<Sensor>('');
  const [filters, setFilters] = useState<{ inicio: string; fim: string; sensor: Sensor }>({ inicio: dateUtc(5), fim: dateUtc(1), sensor: '' });
  const [retry, setRetry] = useState(0);
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [hotspots, setHotspots] = useState<Points | null>(null);
  const [directHotspots, setDirectHotspots] = useState<Points | null>(null);
  const [selectedCell, setSelectedCell] = useState<ForecastProperties | null>(null);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [busy, setBusy] = useState<Busy>(defaultBusy);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [question, setQuestion] = useState('O que os dados disponíveis mostram para este território?');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [comparison, setComparison] = useState<HistoryComparison | null>(null);
  const [compareSensor, setCompareSensor] = useState<'MODIS' | 'VIIRS'>('VIIRS');
  const [picking, setPicking] = useState(false);
  const [reportLat, setReportLat] = useState('');
  const [reportLon, setReportLon] = useState('');
  const [reportDate, setReportDate] = useState('');
  const [reportCategory, setReportCategory] = useState('fumaca');
  const [description, setDescription] = useState('');
  const [reportResult, setReportResult] = useState('');
  const [deltaTemp, setDeltaTemp] = useState(0);
  const [deltaHumidity, setDeltaHumidity] = useState(0);
  const [deltaWind, setDeltaWind] = useState(0);
  const [scenario, setScenario] = useState<{ baseline: number; scenario: number; aviso: string } | null>(null);
  const [scenarioBusy, setScenarioBusy] = useState(false);
  const [scenarioError, setScenarioError] = useState('');
  const { monitor, clearAlerts } = useLiveMonitor(true);
  const selectionRef = useRef({ country, region, filters });
  selectionRef.current = { country, region, filters };

  const setWorking = (key: keyof Busy, value: boolean) => setBusy((old) => ({ ...old, [key]: value }));
  const setError = (key: string, value: string) => setErrors((old) => ({ ...old, [key]: value }));

  useEffect(() => {
    fetch('/countries.geojson').then((response) => {
      if (!response.ok) throw new Error('Limites geográficos indisponíveis.');
      return response.json() as Promise<FeatureCollection<GeoJSON.Geometry, CountryProperties>>;
    }).then((collection) => {
      const list = collection.features.map(({ properties: p }) => ({ code: p.ADM0_A3, english: p.NAME_EN, name: p.NAME_PT || p.NAME_EN, lon: p.LABEL_X, lat: p.LABEL_Y }))
        .filter((item) => item.code && item.english && Number.isFinite(item.lon) && Number.isFinite(item.lat))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      setCountries(list);
      setCountry(list.find((item) => item.code === 'BRA') || list[0] || null);
    }).catch((error: unknown) => setError('countries', errorMessage(error)));
  }, []);

  const chooseCountry = useCallback((item: Country) => {
    setCountry({ ...item }); setRegion(''); setRegionInput(''); setSearch(''); setShowSearch(false);
    setIntro(false); setPanelOpen(true); setTab('panorama'); setFocusCell(null);
    setAnalysis(null); setComparison(null); setScenario(null); setPicking(false); setReportResult('');
  }, []);

  const matches = useMemo(() => {
    const term = norm(search.trim());
    return countries.filter((item) => !term || norm(`${item.name} ${item.english} ${item.code}`).includes(term)).slice(0, 8);
  }, [countries, search]);

  useEffect(() => {
    if (!country) return;
    const controller = new AbortController();
    setWorking('forecast', true); setError('forecast', ''); setForecast(null); setSelectedCell(null); setScenario(null);
    getData<Forecast>('/gateway/previsao', { pais: country.english, regiao: region || undefined, limite: 8 }, controller.signal)
      .then((data) => { setForecast(data); setSelectedCell(data.features[0]?.properties ?? null); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setError('forecast', errorMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setWorking('forecast', false); });
    return () => controller.abort();
  }, [country, region, retry]);

  useEffect(() => {
    if (!country) return;
    const controller = new AbortController();
    setWorking('calendar', true); setError('calendar', ''); setCalendar(null); setComparison(null);
    getData<Calendar>('/gateway/calendario', { pais: country.english, regiao: region || undefined, ...filters, max_dias: 5 }, controller.signal)
      .then(setCalendar).catch((error: unknown) => { if (!controller.signal.aborted) setError('calendar', errorMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setWorking('calendar', false); });
    return () => controller.abort();
  }, [country, region, filters, retry]);

  useEffect(() => {
    const controller = new AbortController();
    setDirectHotspots(null); setError('direct', '');
    if (!country || !layers.direto) { setWorking('direct', false); return () => controller.abort(); }
    const last = new Date(`${filters.inicio}T00:00:00Z`);
    last.setUTCDate(last.getUTCDate() + 4);
    const lastDay = last.toISOString().slice(0, 10);
    setWorking('direct', true);
    getData<Points>('/gateway/focos-firms', { pais: country.english, regiao: region || undefined,
      inicio: filters.inicio, fim: filters.fim < lastDay ? filters.fim : lastDay,
      sensor: filters.sensor || 'VIIRS', limite: 350 }, controller.signal)
      .then(setDirectHotspots).catch((error: unknown) => { if (!controller.signal.aborted) setError('direct', errorMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setWorking('direct', false); });
    return () => controller.abort();
  }, [country, region, filters, layers.direto]);

  useEffect(() => {
    if (!country) return;
    const controller = new AbortController();
    setHotspots(null); setError('hotspots', '');
    if (region) {
      setWorking('hotspots', false);
      setError('hotspots', 'O filtro de estado ou província não está disponível para a camada harmonizada.');
    } else {
      setWorking('hotspots', true);
      getData<Points>('/gateway/focos', { pais: country.english, inicio: filters.inicio, fim: filters.fim, limite: 300 }, controller.signal)
        .then(setHotspots).catch((error: unknown) => { if (!controller.signal.aborted) setError('hotspots', errorMessage(error)); })
        .finally(() => { if (!controller.signal.aborted) setWorking('hotspots', false); });
    }
    getData<{ relatos: CommunityReport[] }>('/local/relatos', { pais: country.english }, controller.signal).then((data) => setReports(region ? data.relatos.filter((report) => norm(report.region || '') === norm(region)) : data.relatos))
      .catch(() => { if (!controller.signal.aborted) setReports([]); });
    return () => controller.abort();
  }, [country, region, filters]);

  const nextForecast = async () => {
    if (!country || forecast?.proximo_cursor == null) return;
    setWorking('forecast', true); setError('forecast', '');
    try {
      const data = await getData<Forecast>('/gateway/previsao', { pais: country.english, regiao: region || undefined, limite: 8, cursor: forecast.proximo_cursor });
      if (selectionRef.current.country?.code !== country.code || selectionRef.current.region !== region) return;
      setForecast(data); setSelectedCell(data.features[0]?.properties ?? null); setScenario(null);
    } catch (error) { setError('forecast', errorMessage(error)); } finally { setWorking('forecast', false); }
  };

  const nextCalendar = () => {
    if (calendar?.proximo_inicio) {
      setAnalysis(null);
      setFilters((old) => ({ ...old, inicio: calendar.proximo_inicio! }));
      setDraftStart(calendar.proximo_inicio);
    }
  };

  const submitFilters = (event: FormEvent) => {
    event.preventDefault();
    if (draftStart > draftEnd || draftEnd > dateUtc()) { setError('calendar', 'Selecione um intervalo válido sem datas futuras.'); return; }
    setAnalysis(null); setFilters({ inicio: draftStart, fim: draftEnd, sensor: draftSensor });
  };

  const runAnalysis = async () => {
    if (!country) return;
    setWorking('analysis', true); setError('analysis', ''); setAnalysis(null);
    try {
      const result = await postData<Analysis>('/local/analise', { pais: country.english, regiao: region || null, inicio: filters.inicio, fim: filters.fim, pergunta: question });
      if (selectionRef.current.country?.code !== country.code || selectionRef.current.region !== region || selectionRef.current.filters !== filters) return;
      setAnalysis(result);
    } catch (error) { setError('analysis', errorMessage(error)); } finally { setWorking('analysis', false); }
  };

  const runComparison = async () => {
    if (!country || !calendar) return;
    setWorking('comparison', true); setError('comparison', ''); setComparison(null);
    try {
      setComparison(await postData<HistoryComparison>('/local/comparacao', { pais: country.english, regiao: region || null, inicio: calendar.inicio, fim: calendar.fim_consultado, sensor: compareSensor }));
    } catch (error) { setError('comparison', errorMessage(error)); } finally { setWorking('comparison', false); }
  };

  const submitReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!country) return;
    setWorking('report', true); setError('report', ''); setReportResult('');
    try {
      const result = await postData<{ id: string; mensagem: string }>('/local/relatos', {
        country: country.english, region: region || null, observed_at: new Date(reportDate).toISOString(),
        latitude: Number(reportLat), longitude: Number(reportLon), category: reportCategory, description,
      });
      setReportResult(`${result.mensagem} Protocolo: ${result.id}`); setDescription('');
    } catch (error) { setError('report', errorMessage(error)); } finally { setWorking('report', false); }
  };

  const runScenario = async () => {
    if (!country || !selectedCell) return;
    setScenarioBusy(true); setScenarioError(''); setScenario(null);
    try {
      const result = await postData<{ baseline: number; scenario: number; aviso: string }>('/local/cenario', { pais: country.english, regiao: region || null, celula_id: selectedCell.celula_id, delta_temperatura: deltaTemp, delta_umidade: deltaHumidity, delta_vento: deltaWind });
      setScenario(result);
    } catch (error) { setScenarioError(errorMessage(error)); } finally { setScenarioBusy(false); }
  };

  const selectedName = country?.name || 'Escolha um território';
  const viirs = sensorTotal(calendar, 'VIIRS');
  const modis = sensorTotal(calendar, 'MODIS');

  const openPanel = (id: Tab) => {
    setIntro(false); setTab(id); setPanelOpen(true); setMenu(false); setLayersOpen(false);
  };

  return <div className={`app-shell ${intro ? 'is-intro' : 'is-exploring'} ${panelOpen ? 'panel-is-open' : ''}`}>
    <header className="topbar">
      <button className="brand" onClick={() => { setIntro(true); setPanelOpen(false); }} aria-label="PyroSync Atlas — início"><span className="brand-mark"><Flame size={19} strokeWidth={2.1} /></span><span className="brand-name">pyro<span>sync</span><small>ATLAS</small></span></button>
      <nav id="main-navigation" className={`topnav ${menu ? 'mobile-open' : ''}`} aria-label="Navegação principal">{nav.map(({ id, label, icon: Icon }) => <button key={id} className={!intro && panelOpen && tab === id ? 'nav-active' : ''} onClick={() => openPanel(id)}><Icon size={16} />{label}</button>)}</nav>
      <div className="header-end"><span className="header-context"><span className="pulse-dot" /> OBSERVAÇÃO DA TERRA</span><button className="about-link" onClick={() => openPanel('metodo')}>Sobre os dados <ArrowUpRight size={14} /></button><IconButton title={menu ? 'Fechar menu' : 'Abrir menu'} onClick={() => setMenu(!menu)} expanded={menu} controls="main-navigation"><Menu size={20} /></IconButton></div>
    </header>

    <main className="workspace">
      <section className="map-shell" aria-label="Mapa e camadas">
        <Globe selected={country} focusCell={focusCell} countries={countries} forecast={forecast} hotspots={hotspots} directHotspots={directHotspots} recentAlerts={monitor.alerts} monthly={monthly} onMonthlyStatus={setMonthlyStatus} reports={reports} layers={layers} pickingPoint={picking}
          onCountry={chooseCountry} onPoint={(lat, lon) => { setReportLat(lat.toFixed(5)); setReportLon(lon.toFixed(5)); setPicking(false); }} />
        <div className="map-top">
          <div className="search-wrap"><div className="search-field"><Search size={18} /><input value={search} onFocus={() => setShowSearch(true)} onChange={(event) => { setSearch(event.target.value); setShowSearch(true); }} placeholder="Buscar um país ou território" aria-label="Buscar país ou território" />{search && <button onClick={() => setSearch('')} aria-label="Limpar busca"><X size={16} /></button>}<span className="search-shortcut">⌕</span></div>
            {showSearch && <div className="search-results">{matches.length ? matches.map((item) => <button key={`${item.code}-${item.english}`} onClick={() => chooseCountry(item)}><MapPin size={15} /><span>{item.name}<small>{item.english !== item.name ? item.english : item.code}</small></span><ArrowUpRight size={15} /></button>) : <p>Nenhum país encontrado.</p>}<button className="close-search" onClick={() => setShowSearch(false)}>Fechar busca</button></div>}
          </div>
          {errors.countries && <Notice error>{errors.countries}</Notice>}
        </div>
        <div className="map-actions"><div className="map-action-row"><button className={`map-action ${layersOpen ? 'active' : ''}`} onClick={() => setLayersOpen(!layersOpen)} aria-expanded={layersOpen}><Layers3 size={17} /> Camadas <ChevronDown size={14} /></button>
          {country && <button className="selected-country" onClick={() => openPanel('panorama')} aria-label={`Em análise: ${region ? `${region}, ` : ''}${country.name}. Ver panorama`}><MapPin size={16} /><span><small>EM ANÁLISE</small><strong>{region ? `${region}, ${country.name}` : country.name}</strong></span><ArrowUpRight size={15} /></button>}</div>
          {layersOpen && <div className="layer-menu"><strong>O que aparece no mapa</strong><label><input type="checkbox" checked={layers.previsao} onChange={(event) => setLayers({ ...layers, previsao: event.target.checked })} /><span>Células previstas<small>Modelo experimental</small></span></label><label><input type="checkbox" checked={layers.focos} onChange={(event) => setLayers({ ...layers, focos: event.target.checked })} /><span>Focos harmonizados<small>Cobertura limitada do banco</small></span></label><label><input type="checkbox" checked={layers.direto} onChange={(event) => setLayers({ ...layers, direto: event.target.checked })} /><span>FIRMS direto<small>{busy.direct ? 'Consultando...' : directHotspots ? `${directHotspots.features.length} pontos · amostra não harmonizada` : 'Amostra de até 350 pontos'}</small></span></label>{errors.direct && <p className="layer-error">{errors.direct}</p>}<label><input type="checkbox" checked={layers.relatos} onChange={(event) => setLayers({ ...layers, relatos: event.target.checked })} /><span>Relatos aprovados<small>Observações humanas</small></span></label></div>}
          <MonthlyHistory country={country?.name ?? null} active={monthly} status={monthlyStatus} onApply={(layer) => { setMonthlyStatus('loading'); setMonthly(layer); setLayers((old) => ({ ...old, previsao: false, focos: false, direto: false })); }} onRemove={() => setMonthly(null)} />
          <LiveMonitor monitor={monitor} onClear={clearAlerts} onFocus={(lat, lon) => setFocusCell({ lat, lon, request: Date.now() })} />
        </div>
        <span className="visually-hidden" role="status" aria-live="polite">{monitor.newCount > 0 ? `${numberLabel(monitor.newCount)} novos registros térmicos em destaque.` : monitor.status === 'error' ? 'Monitoramento temporariamente indisponível.' : monitor.referenceReset ? 'Referência do monitoramento reiniciada.' : ''}</span>
        {picking && <div className="map-pick"><Crosshair size={16} /> Clique no mapa para marcar o local do relato <button onClick={() => setPicking(false)}>Cancelar</button></div>}
        <div className="map-bottom"><div className="map-caption"><Navigation size={15} /><span>Arraste para girar <i /> Clique em um país <i /> Imagem base NASA Blue Marble (2004)</span></div><div className="map-legend">{layers.previsao && <><span>Células experimentais</span><div className="legend-ramp" /><span>menor</span><span>maior</span></>}{monthly && <span className="new-legend"><i /> Registros do mês · {monthly.scope === 'world' ? 'mundo' : country?.name}</span>}{monitor.alerts.length > 0 && <span className="new-legend"><i /> Novo registro · 10 segundos</span>}</div></div>
      </section>

      {panelOpen && <aside className="detail-panel" aria-label={`Informações de ${selectedName}`}>
        <div className="panel-scroll">
          <div className="panel-heading"><div><div className="location-line"><MapPin size={14} /> TERRITÓRIO SELECIONADO</div><h2>{selectedName}</h2><p>{region || 'Visão do país'} <span>·</span> Limites aproximados do Natural Earth</p></div><button className="close-panel" onClick={() => setPanelOpen(false)} aria-label="Fechar painel"><X size={18} /></button></div>
          <form className="region-select" onSubmit={(event) => { event.preventDefault(); setRegion(regionInput.trim()); setAnalysis(null); }}><MapPin size={15} /><input value={regionInput} onChange={(event) => setRegionInput(event.target.value)} placeholder="Filtrar estado ou província" aria-label="Filtrar estado ou província" /><button type="submit">Aplicar</button></form>
          <div className="panel-monitor"><MonthlyHistory country={country?.name ?? null} active={monthly} status={monthlyStatus} onApply={(layer) => { setMonthlyStatus('loading'); setMonthly(layer); setLayers((old) => ({ ...old, previsao: false, focos: false, direto: false })); setPanelOpen(false); }} onRemove={() => setMonthly(null)} /><LiveMonitor monitor={monitor} onClear={clearAlerts} onFocus={(lat, lon) => { setPanelOpen(false); setFocusCell({ lat, lon, request: Date.now() }); }} /></div>
          <nav className="panel-tabs" aria-label="Informações do território"><button aria-pressed={tab === 'panorama'} onClick={() => setTab('panorama')}>Panorama</button><button aria-pressed={tab === 'calendario'} onClick={() => setTab('calendario')}>Calendário</button><button aria-pressed={tab === 'analise'} onClick={() => setTab('analise')}>Análise</button><button aria-pressed={tab === 'relatos'} onClick={() => setTab('relatos')}>Relatos</button></nav>

          {tab === 'panorama' && <div className="panel-content"><div className="section-title"><div><h3>Atividade observada</h3><p>Registros de satélite no período consultado</p></div><button className="round-link" onClick={() => setTab('calendario')} aria-label="Abrir calendário"><ArrowUpRight size={18} /></button></div><Explain subject="atividade observada">Os satélites identificam pontos mais quentes que o entorno. MODIS e VIIRS têm resoluções diferentes; um registro térmico não é necessariamente um incêndio distinto.</Explain>
            {busy.calendar ? <Spinner text="Consultando NASA FIRMS" /> : errors.calendar ? <><Notice error>{errors.calendar}</Notice><button className="inline-action" onClick={() => setRetry((value) => value + 1)}>Tentar novamente <ArrowRight size={15} /></button></> : calendar ? <><div className="metric-row"><div className="metric"><span className="sensor-dot viirs" /> VIIRS<strong>{viirs == null ? '—' : numberLabel(viirs)}</strong><small>registros retornados</small></div><div className="metric"><span className="sensor-dot modis" /> MODIS<strong>{modis == null ? '—' : numberLabel(modis)}</strong><small>registros retornados</small></div></div><CalendarBars calendar={calendar} /><div className="chart-footer"><span><i className="sensor-dot viirs" /> VIIRS</span><span><i className="sensor-dot modis" /> MODIS</span><span>{dateLabel(calendar.inicio)} — {dateLabel(calendar.fim_consultado)}</span></div><p className="footnote">Consulta direta ao FIRMS, sem harmonização. Sensores têm sensibilidades diferentes; não some os registros como incêndios.</p></> : <Notice>Selecione um território para consultar o histórico.</Notice>}
            <div className="section-divider" /><div className="section-title"><div><h3>Próximo dia</h3><p>Saída do modelo por célula</p></div><span className="status-pill"><span /> EXPERIMENTAL</span></div><Explain subject="previsão por célula">Cada célula é uma parte da superfície terrestre. O percentual é uma estimativa condicional de detecção pelo satélite, não a chance de incêndio no país inteiro nem um alerta operacional.</Explain>
            {busy.forecast ? <Spinner text="Calculando células e clima" /> : errors.forecast ? <><Notice error>{errors.forecast}</Notice><button className="inline-action" onClick={() => setRetry((value) => value + 1)}>Tentar novamente <ArrowRight size={15} /></button></> : forecast ? <><p className="period-line"><CalendarDays size={15} /> {dateLabel(forecast.inicio_previsto_utc)} UTC <span>·</span> grade de 0,25°</p><CellList forecast={forecast} selectedCell={selectedCell?.celula_id ?? null} onSelect={(cell) => { setSelectedCell(cell); setScenario(null); setFocusCell({ lat: cell.latitude, lon: cell.longitude, request: Date.now() }); }} onNext={nextForecast} /><Notice>Os valores são condicionais, não calibrados globalmente e não representam o risco do país. Não use para alertas.</Notice><button className="inline-action" onClick={() => setTab('cenario')}>Explorar um cenário <ArrowRight size={15} /></button></> : <Notice>Selecione um território para consultar a previsão.</Notice>}
            <div className="section-divider" /><div className="section-title"><div><h3>Focos harmonizados</h3><p>Registros presentes no banco da equipe</p></div><Database size={18} className="muted-icon" /></div><Explain subject="focos harmonizados">São registros de satélite organizados e tratados pelo projeto para facilitar a comparação. A disponibilidade depende das regiões e datas que já foram carregadas no banco.</Explain>{busy.hotspots ? <Spinner /> : errors.hotspots ? <Notice error>{errors.hotspots}</Notice> : <p className="body-copy">{hotspots?.features.length ? `${numberLabel(hotspots.features.length)} registros nesta página.` : 'Nenhum registro retornado para a seleção.'} A cobertura do banco é limitada às áreas e datas carregadas.</p>}
          </div>}

          {tab === 'calendario' && <div className="panel-content"><div className="section-title"><div><h3>Calendário de atividade</h3><p>Viaje pelos registros disponíveis no FIRMS</p></div><CalendarDays size={19} className="muted-icon" /></div><Explain subject="calendário de atividade">O calendário agrupa registros térmicos por dia e sensor. Consulte até cinco dias por página; use Próximos dias para continuar quando houver mais dados.</Explain><form className="filter-form" onSubmit={submitFilters}><label>De<input type="date" value={draftStart} max={dateUtc()} onChange={(e) => setDraftStart(e.target.value)} required /></label><label>Até<input type="date" value={draftEnd} max={dateUtc()} onChange={(e) => setDraftEnd(e.target.value)} required /></label><label className="wide">Sensor<select value={draftSensor} onChange={(e) => setDraftSensor(e.target.value as Sensor)}><option value="">MODIS e VIIRS</option><option value="MODIS">MODIS</option><option value="VIIRS">VIIRS</option></select></label><button className="primary-button wide" type="submit">Consultar período <ArrowRight size={16} /></button></form>
            {busy.calendar ? <Spinner text="Consultando a página" /> : errors.calendar ? <Notice error>{errors.calendar}</Notice> : calendar && <><div className="section-divider" /><div className="section-title compact"><div><h3>Registros por dia</h3><p>{dateLabel(calendar.inicio)} a {dateLabel(calendar.fim_consultado)}</p></div></div><CalendarBars calendar={calendar} /><div className="chart-footer"><span><i className="sensor-dot viirs" /> VIIRS</span><span><i className="sensor-dot modis" /> MODIS</span></div><div className="sensor-summary"><div><span>VIIRS</span><strong>{viirs == null ? 'Sem registro' : numberLabel(viirs)}</strong></div><div><span>MODIS</span><strong>{modis == null ? 'Sem registro' : numberLabel(modis)}</strong></div></div><div className="pagination"><span>{calendar.resultado_completo ? 'Fim do período' : 'Consulta paginada em até 5 dias'}</span><button className="text-button" disabled={!calendar.proximo_inicio} onClick={nextCalendar}>Próximos dias <ArrowRight size={14} /></button></div><Notice>São dados FIRMS diretos, não harmonizados. Ausência de registro não comprova ausência de fogo.</Notice><details className="details"><summary>Ver disponibilidade das fontes <ChevronDown size={15} /></summary>{calendar.disponibilidade.map((item, index) => <div className="availability" key={`${item.produto}-${index}`}><span>{item.produto}</span><strong>{item.disponivel ? 'Produto disponível' : 'Indisponível'}</strong></div>)}</details>
            <div className="section-divider" /><div className="section-title compact"><div><h3>Compare outros anos</h3><p>Mesmos dias, um sensor por vez</p></div></div><Explain subject="comparação entre anos">Compara os mesmos dias em anos diferentes, usando um sensor por vez. Mudanças de cobertura, nuvens e processamento podem afetar os números.</Explain><div className="compare-controls"><select aria-label="Sensor da comparação" value={compareSensor} onChange={(e) => setCompareSensor(e.target.value as 'MODIS' | 'VIIRS')}><option value="VIIRS">VIIRS</option><option value="MODIS">MODIS</option></select><button className="secondary-button" onClick={runComparison} disabled={busy.comparison}>{busy.comparison ? 'Consultando...' : 'Comparar anos'}</button></div>{errors.comparison && <Notice error>{errors.comparison}</Notice>}{comparison && <><div className="comparison-list">{comparison.periodos.map((item) => <div key={item.inicio}><span>{dateLabel(item.inicio)} — {dateLabel(item.fim)}</span><strong>{item.deteccoes == null ? 'Indisponível' : numberLabel(item.deteccoes)}</strong></div>)}</div><Notice>{comparison.aviso}</Notice></>}</>}
          </div>}

          {tab === 'analise' && <div className="panel-content"><div className="section-title"><div><h3>Inteligência científica</h3><p>Uma análise guiada pelas fontes consultadas</p></div><span className="spark-badge"><Sparkles size={18} /></span></div><Explain subject="análise científica">Os agentes reúnem fontes disponíveis e apresentam uma explicação em linguagem simples. A resposta pode conter erros e deve ser conferida nas evidências e limitações.</Explain><p className="body-copy">Agentes consultam o calendário, a previsão e o banco harmonizado; uma revisão registra as limitações antes da síntese.</p><label className="field-label">Sua pergunta<textarea value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500} rows={3} /></label><button className="primary-button full" disabled={busy.analysis || !country || question.trim().length < 3} onClick={runAnalysis}>{busy.analysis ? <><LoaderCircle size={16} className="spin" /> Analisando fontes...</> : <>Analisar território <Sparkles size={16} /></>}</button><p className="footnote">A análise usa a primeira página do período. Sua pergunta e o território são enviados ao provedor de IA; não inclua dados pessoais.</p>{errors.analysis && <Notice error>{errors.analysis}</Notice>}
            {analysis && <><div className="section-divider" /><h3 className="minor-title">Resultado da análise</h3>{analysis.sintese ? <div className="analysis-answer"><Sparkles size={17} /><div><p>{analysis.sintese.texto}</p><small>Síntese: {analysis.sintese.provedor} · fontes {analysis.sintese.fontes.join(', ')}</small></div></div> : <Notice>A síntese de IA está indisponível ou não passou na revisão. Consulte as evidências e as etapas abaixo.</Notice>}<div className="agent-list">{analysis.etapas.map((step) => <div key={step.agente}><span className={step.status === 'concluído' ? 'agent-ok' : 'agent-warn'}>{step.status === 'concluído' ? <Check size={13} /> : '!'}</span><span>{step.agente}</span><small>{step.status}</small></div>)}</div><HistoricalEvidence analysis={analysis} /><button className="secondary-button report-export" onClick={() => window.print()}><Printer size={15} /> Exportar relatório / PDF</button><details className="details"><summary>Entenda os sensores <ChevronDown size={15} /></summary><p className="body-copy">O produto de focos VIIRS usa pixels de aproximadamente 375 metros; o MODIS usa pixels de aproximadamente 1 quilômetro. Eles não enxergam exatamente os mesmos focos.</p><a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noreferrer">Conheça o NASA FIRMS <ArrowUpRight size={14} /></a></details><details className="details"><summary>Limitações e revisão científica <ChevronDown size={15} /></summary><ul>{analysis.revisao.map((note) => <li key={note}>{note}</li>)}</ul></details><details className="details"><summary>Fontes e evidências <ChevronDown size={15} /></summary>{analysis.fontes.filter((source) => source.id in analysis.evidencias).map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.nome} <ArrowUpRight size={14} /></a>)}<pre>{JSON.stringify(analysis.evidencias, null, 2)}</pre></details><p className="footnote">{analysis.aviso}</p></>}
          </div>}

          {tab === 'cenario' && <div className="panel-content"><div className="section-title"><div><h3>Sandbox de cenários</h3><p>E se as condições climáticas mudassem?</p></div><SlidersHorizontal size={19} className="muted-icon" /></div><Explain subject="simulador de cenários">Altere temperatura, umidade ou vento para comparar a saída do modelo com a referência da célula selecionada. É uma hipótese, não uma previsão de propagação.</Explain><Notice>Simulação experimental sobre o mesmo modelo. Não estima propagação nem deve orientar decisões.</Notice>{selectedCell?.clima_power ? <><div className="scenario-location"><MapPin size={16} /><div><strong>{selectedCell.celula_id.replace('global_', 'Célula ')}</strong><small>{selectedCell.latitude.toFixed(3)}°, {selectedCell.longitude.toFixed(3)}° · escolha outra célula em Panorama</small></div></div><label className="range-label"><span>Temperatura <strong>{deltaTemp > 0 ? '+' : ''}{deltaTemp} °C</strong></span><input type="range" min="-5" max="5" step="0.5" value={deltaTemp} onChange={(e) => { setDeltaTemp(Number(e.target.value)); setScenario(null); }} /><small>Referência: {selectedCell.clima_power.clima_T2M?.toFixed(1)} °C</small></label><label className="range-label"><span>Umidade relativa <strong>{deltaHumidity > 0 ? '+' : ''}{deltaHumidity} p.p.</strong></span><input type="range" min="-20" max="20" step="1" value={deltaHumidity} onChange={(e) => { setDeltaHumidity(Number(e.target.value)); setScenario(null); }} /><small>Referência: {selectedCell.clima_power.clima_RH2M?.toFixed(1)}%</small></label><label className="range-label"><span>Vento <strong>{deltaWind > 0 ? '+' : ''}{deltaWind} m/s</strong></span><input type="range" min="-3" max="3" step="0.5" value={deltaWind} onChange={(e) => { setDeltaWind(Number(e.target.value)); setScenario(null); }} /><small>Referência: {selectedCell.clima_power.clima_WS10M?.toFixed(1)} m/s</small></label><button className="primary-button full" disabled={scenarioBusy} onClick={runScenario}>{scenarioBusy ? 'Calculando cenário...' : 'Comparar com referência'} <ArrowRight size={16} /></button>{scenarioError && <Notice error>{scenarioError}</Notice>}{scenario && <><div className="scenario-results"><div><span>Referência</span><strong>{percentLabel(scenario.baseline)}</strong></div><ArrowDownRight size={19} /><div><span>Cenário hipotético</span><strong>{percentLabel(scenario.scenario)}</strong></div></div><Notice>{scenario.aviso}</Notice></>}</> : <Notice>Aguarde a previsão e selecione uma célula com dados climáticos.</Notice>}</div>}

          {tab === 'relatos' && <div className="panel-content"><div className="section-title"><div><h3>Relatos da comunidade</h3><p>Uma observação humana pode complementar o mapa</p></div><UsersRound size={20} className="muted-icon" /></div><Notice>Relatos não são detecções de satélite. São enviados para revisão antes de aparecer no mapa. Não informe nomes, telefones ou dados pessoais.</Notice><form onSubmit={submitReport} className="report-form"><label className="field-label">O que você observou?<select value={reportCategory} onChange={(e) => setReportCategory(e.target.value)}><option value="fumaca">Fumaça</option><option value="fogo">Fogo</option><option value="area_queimada">Área queimada</option><option value="outro">Outro</option></select></label><label className="field-label">Quando aconteceu?<input type="datetime-local" value={reportDate} onChange={(e) => setReportDate(e.target.value)} required /></label><div className="coordinate-head"><strong>Local aproximado</strong><button type="button" className="text-button" onClick={() => setPicking(!picking)}><Crosshair size={15} /> {picking ? 'Clique no mapa' : 'Marcar no mapa'}</button></div><div className="coordinate-fields"><label>Latitude<input type="number" step="any" min="-90" max="90" value={reportLat} onChange={(e) => setReportLat(e.target.value)} placeholder="-15.000" required /></label><label>Longitude<input type="number" step="any" min="-180" max="180" value={reportLon} onChange={(e) => setReportLon(e.target.value)} placeholder="-47.000" required /></label></div><label className="field-label">Conte o que viu<textarea value={description} onChange={(e) => setDescription(e.target.value)} minLength={10} maxLength={600} rows={4} placeholder="Descreva apenas o evento observado..." required /></label><button className="primary-button full" disabled={busy.report || !country} type="submit">{busy.report ? 'Enviando...' : 'Enviar relato para revisão'} <Send size={16} /></button></form>{errors.report && <Notice error>{errors.report}</Notice>}{reportResult && <div className="success-message"><Check size={16} /> {reportResult}</div>}<div className="section-divider" /><p className="body-copy">{reports.length ? `${reports.length} relato(s) aprovado(s) para este país.` : 'Ainda não há relatos aprovados disponíveis para este país.'}</p></div>}

          {tab === 'metodo' && <div className="panel-content"><div className="section-title"><div><h3>Sobre os dados</h3><p>Entender as fontes faz parte da exploração</p></div><Microscope size={20} className="muted-icon" /></div><div className="method-item"><span>01</span><div><h4>Observação não é incêndio</h4><p>MODIS e VIIRS identificam anomalias térmicas. Nuvens, resolução e horários afetam o que cada sensor consegue observar.</p></div></div><div className="method-item"><span>02</span><div><h4>Duas origens, duas leituras</h4><p>O calendário consulta o FIRMS diretamente. Os focos harmonizados vêm do banco do projeto e estão limitados às cargas existentes.</p></div></div><div className="method-item"><span>03</span><div><h4>Previsão experimental</h4><p>O modelo foi treinado em parte do MATOPIBA e não teve calibração global aprovada. Cada valor é uma saída condicional para uma célula, não para o país.</p></div></div><div className="method-item"><span>04</span><div><h4>Conhecimento coletivo</h4><p>Relatos humanos são separados das fontes científicas e só aparecem após revisão. Não são confirmação independente de incêndio.</p></div></div><a className="source-link" href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noreferrer">NASA FIRMS <ArrowUpRight size={15} /></a><a className="source-link" href="https://power.larc.nasa.gov/" target="_blank" rel="noreferrer">NASA POWER <ArrowUpRight size={15} /></a><a className="source-link" href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">Natural Earth <ArrowUpRight size={15} /></a></div>}
        </div>
        <div className="panel-footer"><span><span className="pulse-dot" /> PYROSYNC ATLAS</span><button onClick={() => setTab('metodo')}>Fontes e metodologia <ArrowUpRight size={13} /></button></div>
      </aside>}
    </main>
    <section className="print-report" aria-label="Relatório para impressão"><h1>PyroSync — relatório de observação</h1><p><strong>Território:</strong> {selectedName}{region ? ` · ${region}` : ''}</p><p><strong>Período selecionado:</strong> {dateLabel(filters.inicio)} a {dateLabel(filters.fim)} UTC</p>{calendar && <><h2>Calendário observado</h2><p>Página efetivamente consultada: {dateLabel(calendar.inicio)} a {dateLabel(calendar.fim_consultado)}. {calendar.proximo_inicio ? 'Há outras páginas para o período selecionado.' : 'Fim do período solicitado.'}</p><p>VIIRS: {viirs == null ? 'nenhum registro retornado' : numberLabel(viirs)} · MODIS: {modis == null ? 'nenhum registro retornado' : numberLabel(modis)}.</p><p>Fonte: consulta direta NASA FIRMS, sem harmonização. Sensores não devem ser somados como incêndios.</p></>}{analysis && <><h2>Síntese e revisão</h2><p>{analysis.sintese?.texto || 'Síntese automática indisponível; consulte as fontes e evidências.'}</p><HistoricalEvidence analysis={analysis} /><ul>{analysis.revisao.map((note) => <li key={note}>{note}</li>)}</ul><h2>Fontes consultadas</h2><ul>{analysis.fontes.filter((source) => source.id in analysis.evidencias).map((source) => <li key={source.id}>{source.nome}: {source.url}</li>)}</ul></>}<p>Previsão e cenários são experimentais, não calibrados globalmente e não servem para alertas.</p></section>
    {intro && <section className="welcome-screen" aria-label="Apresentação do PyroSync">
      <div className="welcome-copy"><div className="welcome-tag"><span /> NASA SPACE APPS · OBSERVAÇÃO DA TERRA</div>
        <h1>Olhar a Terra<br /><em>muda tudo.</em></h1>
        <p>Explore focos de calor, descubra padrões ao longo do tempo e entenda o que os satélites conseguem observar.</p>
        <div className="welcome-actions"><button className="welcome-primary" onClick={() => { setIntro(false); setPanelOpen(false); }}>Explorar o globo <ArrowRight size={17} /></button><button className="welcome-secondary" onClick={() => openPanel('metodo')}>Conheça os dados <ArrowUpRight size={15} /></button></div>
        <div className="welcome-sources"><span><strong>MODIS + VIIRS</strong><small>Observação por satélite</small></span><span><strong>NASA POWER</strong><small>Contexto climático</small></span><span><strong>EXPERIMENTAL</strong><small>Pesquisa, não alerta</small></span></div>
      </div>
      <div className="welcome-foot">UM OBSERVATÓRIO PARA UM PLANETA EM MUDANÇA <span>DESENVOLVIDO PARA NASA SPACE APPS</span></div>
    </section>}
  </div>;
}

export default App;
