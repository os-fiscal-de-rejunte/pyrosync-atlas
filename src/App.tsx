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
  { id: 'panorama', label: 'Explore', icon: Compass },
  { id: 'calendario', label: 'Calendar', icon: CalendarDays },
  { id: 'analise', label: 'Analysis', icon: Sparkles },
  { id: 'cenario', label: 'Sandbox', icon: SlidersHorizontal },
  { id: 'relatos', label: 'Community', icon: UsersRound },
];

const defaultBusy: Busy = { calendar: false, forecast: false, hotspots: false, direct: false, analysis: false, comparison: false, report: false };

function norm(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The data could not be loaded.';
}

function Spinner({ text = 'Fetching data' }: { text?: string }) {
  return <div className="loading"><LoaderCircle size={16} className="spin" /> {text}<span className="loading-dots">...</span></div>;
}

function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <div className={`notice ${error ? 'notice-error' : ''}`} role={error ? 'alert' : undefined}><CircleHelp size={16} /> <span>{children}</span></div>;
}

function Explain({ subject, children }: { subject: string; children: React.ReactNode }) {
  return <details className="explain"><summary aria-label={`What is this? About ${subject}`}><CircleHelp size={15} /> What is this?</summary><p>{children}</p></details>;
}

function IconButton({ title, onClick, children, active = false, expanded, controls }: { title: string; onClick: () => void; children: React.ReactNode; active?: boolean; expanded?: boolean; controls?: string }) {
  return <button type="button" aria-label={title} title={title} onClick={onClick} aria-expanded={expanded} aria-controls={controls} className={`icon-button ${active ? 'active' : ''}`}>{children}</button>;
}

function CalendarBars({ calendar }: { calendar: Calendar }) {
  const dates = Array.from(new Set(calendar.dias.map((d) => d.data))).sort();
  if (!dates.length) return <div className="empty-chart">No records came back for this page. That does not confirm the absence of fire.</div>;
  const peak = Math.max(1, ...calendar.dias.map((d) => d.deteccoes));
  return <div className="bar-chart" role="img" aria-label={`Records per day and sensor. ${calendar.dias.map((item) => `${dateLabel(item.data)}, ${item.sensor_family}: ${numberLabel(item.deteccoes)}`).join('; ')}.`}>
    {dates.map((day) => <div className="bar-day" key={day}>
      <div className="bars">
        {(['MODIS', 'VIIRS'] as const).map((sensor) => {
          const record = calendar.dias.find((item) => item.data === day && item.sensor_family === sensor);
          return <div className={`bar bar-${sensor.toLowerCase()}`} key={sensor} style={{ height: record ? `${Math.max(4, record.deteccoes / peak * 100)}%` : '3px' }} title={`${sensor}: ${record ? numberLabel(record.deteccoes) + ' records' : 'no record returned'}`} />;
        })}
      </div>
      <span>{day.slice(5, 10)}</span>
    </div>)}
  </div>;
}

function CellList({ forecast, selectedCell, onSelect, onNext }: { forecast: Forecast; selectedCell: string | null; onSelect: (cell: ForecastProperties) => void; onNext: () => void }) {
  if (!forecast.features.length) return <Notice>No cells came back for this selection.</Notice>;
  return <>
    <div className="cell-list">
      {forecast.features.map(({ properties: cell }) => <button type="button" key={cell.celula_id} onClick={() => onSelect(cell)} className={`cell-row ${selectedCell === cell.celula_id ? 'cell-active' : ''}`}>
        <span className="cell-mark" />
        <span><strong>{cell.celula_id.replace('global_', 'Cell ')}</strong><small>{cell.latitude.toFixed(3)}°, {cell.longitude.toFixed(3)}°</small></span>
        <span className="cell-value">{percentLabel(cell.probabilidade_condicional)}<small>{cell.probabilidade_condicional == null ? 'no data' : 'conditional'}</small></span>
      </button>)}
    </div>
    <div className="pagination"><span>Up to 8 cells per page</span><button className="text-button" disabled={forecast.proximo_cursor == null} onClick={onNext}>Next page <ArrowRight size={14} /></button></div>
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
  return <div className="history-evidence"><h4>The same period in other years</h4><p>VIIRS records returned by FIRMS for the selected territory.</p><div className="comparison-list">{history.periodos.map((period) => <div key={period.inicio}><span>{dateLabel(period.inicio)} — {dateLabel(period.fim)}</span><strong>{period.deteccoes == null ? 'Unavailable' : numberLabel(period.deteccoes)}</strong></div>)}</div><p>{history.aviso}</p></div>;
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
  const [question, setQuestion] = useState('What do the available data show for this territory?');
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
      if (!response.ok) throw new Error('Geographic boundaries unavailable.');
      return response.json() as Promise<FeatureCollection<GeoJSON.Geometry, CountryProperties>>;
    }).then((collection) => {
      const list = collection.features.map(({ properties: p }) => ({ code: p.ADM0_A3, english: p.NAME_EN, name: p.NAME_EN, lon: p.LABEL_X, lat: p.LABEL_Y }))
        .filter((item) => item.code && item.english && Number.isFinite(item.lon) && Number.isFinite(item.lat))
        .sort((a, b) => a.name.localeCompare(b.name, 'en'));
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
      setError('hotspots', 'The state or province filter is not available for the harmonized layer.');
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
    if (draftStart > draftEnd || draftEnd > dateUtc()) { setError('calendar', 'Choose a valid range with no future dates.'); return; }
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
      setReportResult(`${result.mensagem} Reference: ${result.id}`); setDescription('');
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

  const selectedName = country?.name || 'Choose a territory';
  const viirs = sensorTotal(calendar, 'VIIRS');
  const modis = sensorTotal(calendar, 'MODIS');

  const openPanel = (id: Tab) => {
    setIntro(false); setTab(id); setPanelOpen(true); setMenu(false); setLayersOpen(false);
  };

  return <div className={`app-shell ${intro ? 'is-intro' : 'is-exploring'} ${panelOpen ? 'panel-is-open' : ''}`}>
    <header className="topbar">
      <button className="brand" onClick={() => { setIntro(true); setPanelOpen(false); }} aria-label="PyroSync Atlas, home"><span className="brand-mark"><Flame size={19} strokeWidth={2.1} /></span><span className="brand-name">pyro<span>sync</span><small>ATLAS</small></span></button>
      <nav id="main-navigation" className={`topnav ${menu ? 'mobile-open' : ''}`} aria-label="Main navigation">{nav.map(({ id, label, icon: Icon }) => <button key={id} className={!intro && panelOpen && tab === id ? 'nav-active' : ''} onClick={() => openPanel(id)}><Icon size={16} />{label}</button>)}</nav>
      <div className="header-end"><span className="header-context"><span className="pulse-dot" /> EARTH OBSERVATION</span><button className="about-link" onClick={() => openPanel('metodo')}>About the data <ArrowUpRight size={14} /></button><a className="about-link" href="https://os-fiscal-de-rejunte.github.io/fireseam-modis-viirs-harmonizer/" target="_blank" rel="noreferrer" title="FireSeam: the team's validated MODIS and VIIRS weekly fire calendar">FireSeam <ArrowUpRight size={14} /></a><IconButton title={menu ? 'Close menu' : 'Open menu'} onClick={() => setMenu(!menu)} expanded={menu} controls="main-navigation"><Menu size={20} /></IconButton></div>
    </header>

    <main className="workspace">
      <section className="map-shell" aria-label="Map and layers">
        <Globe selected={country} focusCell={focusCell} countries={countries} forecast={forecast} hotspots={hotspots} directHotspots={directHotspots} recentAlerts={monitor.alerts} monthly={monthly} onMonthlyStatus={setMonthlyStatus} reports={reports} layers={layers} pickingPoint={picking}
          onCountry={chooseCountry} onPoint={(lat, lon) => { setReportLat(lat.toFixed(5)); setReportLon(lon.toFixed(5)); setPicking(false); }} />
        <div className="map-top">
          <div className="search-wrap"><div className="search-field"><Search size={18} /><input value={search} onFocus={() => setShowSearch(true)} onChange={(event) => { setSearch(event.target.value); setShowSearch(true); }} placeholder="Search a country or territory" aria-label="Search a country or territory" />{search && <button onClick={() => setSearch('')} aria-label="Clear search"><X size={16} /></button>}<span className="search-shortcut">⌕</span></div>
            {showSearch && <div className="search-results">{matches.length ? matches.map((item) => <button key={`${item.code}-${item.english}`} onClick={() => chooseCountry(item)}><MapPin size={15} /><span>{item.name}<small>{item.english !== item.name ? item.english : item.code}</small></span><ArrowUpRight size={15} /></button>) : <p>No country found.</p>}<button className="close-search" onClick={() => setShowSearch(false)}>Close search</button></div>}
          </div>
          {errors.countries && <Notice error>{errors.countries}</Notice>}
        </div>
        <div className="map-actions"><div className="map-action-row"><button className={`map-action ${layersOpen ? 'active' : ''}`} onClick={() => setLayersOpen(!layersOpen)} aria-expanded={layersOpen}><Layers3 size={17} /> Layers <ChevronDown size={14} /></button>
          {country && <button className="selected-country" onClick={() => openPanel('panorama')} aria-label={`Selected: ${region ? `${region}, ` : ''}${country.name}. Open overview`}><MapPin size={16} /><span><small>SELECTED</small><strong>{region ? `${region}, ${country.name}` : country.name}</strong></span><ArrowUpRight size={15} /></button>}</div>
          {layersOpen && <div className="layer-menu"><strong>What the map shows</strong><label><input type="checkbox" checked={layers.previsao} onChange={(event) => setLayers({ ...layers, previsao: event.target.checked })} /><span>Forecast cells<small>Experimental model</small></span></label><label><input type="checkbox" checked={layers.focos} onChange={(event) => setLayers({ ...layers, focos: event.target.checked })} /><span>Harmonized hotspots<small>Limited database coverage</small></span></label><label><input type="checkbox" checked={layers.direto} onChange={(event) => setLayers({ ...layers, direto: event.target.checked })} /><span>FIRMS direct<small>{busy.direct ? 'Fetching...' : directHotspots ? `${directHotspots.features.length} points · sample, not harmonized` : 'Sample of up to 350 points'}</small></span></label>{errors.direct && <p className="layer-error">{errors.direct}</p>}<label><input type="checkbox" checked={layers.relatos} onChange={(event) => setLayers({ ...layers, relatos: event.target.checked })} /><span>Approved reports<small>Human observations</small></span></label></div>}
          <MonthlyHistory country={country?.name ?? null} active={monthly} status={monthlyStatus} onApply={(layer) => { setMonthlyStatus('loading'); setMonthly(layer); setLayers((old) => ({ ...old, previsao: false, focos: false, direto: false })); }} onRemove={() => setMonthly(null)} />
          <LiveMonitor monitor={monitor} onClear={clearAlerts} onFocus={(lat, lon) => setFocusCell({ lat, lon, request: Date.now() })} />
        </div>
        <span className="visually-hidden" role="status" aria-live="polite">{monitor.newCount > 0 ? `${numberLabel(monitor.newCount)} new thermal records highlighted.` : monitor.status === 'error' ? 'Monitoring is temporarily unavailable.' : monitor.referenceReset ? 'The monitoring reference was reset.' : ''}</span>
        {picking && <div className="map-pick"><Crosshair size={16} /> Click the map to mark where the report happened <button onClick={() => setPicking(false)}>Cancel</button></div>}
        <div className="map-bottom"><div className="map-caption"><Navigation size={15} /><span>Drag to rotate <i /> Click a country <i /> Base image NASA Blue Marble (2004)</span></div><div className="map-legend">{layers.previsao && <><span>Experimental cells</span><div className="legend-ramp" /><span>lower</span><span>higher</span></>}{monthly && <span className="new-legend"><i /> Records of the month · {monthly.scope === 'world' ? 'world' : country?.name}</span>}{monitor.alerts.length > 0 && <span className="new-legend"><i /> New record · 10 seconds</span>}</div></div>
      </section>

      {panelOpen && <aside className="detail-panel" aria-label={`Information about ${selectedName}`}>
        <div className="panel-scroll">
          <div className="panel-heading"><div><div className="location-line"><MapPin size={14} /> SELECTED TERRITORY</div><h2>{selectedName}</h2><p>{region || 'Country view'} <span>·</span> Approximate Natural Earth boundaries</p></div><button className="close-panel" onClick={() => setPanelOpen(false)} aria-label="Close panel"><X size={18} /></button></div>
          <form className="region-select" onSubmit={(event) => { event.preventDefault(); setRegion(regionInput.trim()); setAnalysis(null); }}><MapPin size={15} /><input value={regionInput} onChange={(event) => setRegionInput(event.target.value)} placeholder="Filter by state or province" aria-label="Filter by state or province" /><button type="submit">Apply</button></form>
          <div className="panel-monitor"><MonthlyHistory country={country?.name ?? null} active={monthly} status={monthlyStatus} onApply={(layer) => { setMonthlyStatus('loading'); setMonthly(layer); setLayers((old) => ({ ...old, previsao: false, focos: false, direto: false })); setPanelOpen(false); }} onRemove={() => setMonthly(null)} /><LiveMonitor monitor={monitor} onClear={clearAlerts} onFocus={(lat, lon) => { setPanelOpen(false); setFocusCell({ lat, lon, request: Date.now() }); }} /></div>
          <nav className="panel-tabs" aria-label="Territory information"><button aria-pressed={tab === 'panorama'} onClick={() => setTab('panorama')}>Overview</button><button aria-pressed={tab === 'calendario'} onClick={() => setTab('calendario')}>Calendar</button><button aria-pressed={tab === 'analise'} onClick={() => setTab('analise')}>Analysis</button><button aria-pressed={tab === 'relatos'} onClick={() => setTab('relatos')}>Reports</button></nav>

          {tab === 'panorama' && <div className="panel-content"><div className="section-title"><div><h3>Observed activity</h3><p>Satellite records in the period queried</p></div><button className="round-link" onClick={() => setTab('calendario')} aria-label="Open calendar"><ArrowUpRight size={18} /></button></div><Explain subject="observed activity">Satellites detect spots hotter than their surroundings. MODIS and VIIRS have different resolutions; one thermal record is not necessarily one distinct fire.</Explain>
            {busy.calendar ? <Spinner text="Querying NASA FIRMS" /> : errors.calendar ? <><Notice error>{errors.calendar}</Notice><button className="inline-action" onClick={() => setRetry((value) => value + 1)}>Try again <ArrowRight size={15} /></button></> : calendar ? <><div className="metric-row"><div className="metric"><span className="sensor-dot viirs" /> VIIRS<strong>{viirs == null ? '—' : numberLabel(viirs)}</strong><small>records returned</small></div><div className="metric"><span className="sensor-dot modis" /> MODIS<strong>{modis == null ? '—' : numberLabel(modis)}</strong><small>records returned</small></div></div><CalendarBars calendar={calendar} /><div className="chart-footer"><span><i className="sensor-dot viirs" /> VIIRS</span><span><i className="sensor-dot modis" /> MODIS</span><span>{dateLabel(calendar.inicio)} — {dateLabel(calendar.fim_consultado)}</span></div><p className="footnote">Direct FIRMS query, not harmonized. The sensors differ in sensitivity; do not add the records up as fires.</p></> : <Notice>Choose a territory to see its history.</Notice>}
            <div className="section-divider" /><div className="section-title"><div><h3>Next day</h3><p>Model output per cell</p></div><span className="status-pill"><span /> EXPERIMENTAL</span></div><Explain subject="the forecast per cell">Each cell is a patch of the land surface. The percentage is a conditional estimate of a satellite detection, not the chance of fire in the whole country and not an operational alert.</Explain>
            {busy.forecast ? <Spinner text="Computing cells and weather" /> : errors.forecast ? <><Notice error>{errors.forecast}</Notice><button className="inline-action" onClick={() => setRetry((value) => value + 1)}>Try again <ArrowRight size={15} /></button></> : forecast ? <><p className="period-line"><CalendarDays size={15} /> {dateLabel(forecast.inicio_previsto_utc)} UTC <span>·</span> 0.25° grid</p><CellList forecast={forecast} selectedCell={selectedCell?.celula_id ?? null} onSelect={(cell) => { setSelectedCell(cell); setScenario(null); setFocusCell({ lat: cell.latitude, lon: cell.longitude, request: Date.now() }); }} onNext={nextForecast} /><Notice>The values are conditional, not calibrated globally, and do not represent the country's risk. Do not use them for alerts.</Notice><button className="inline-action" onClick={() => setTab('cenario')}>Explore a scenario <ArrowRight size={15} /></button></> : <Notice>Choose a territory to see the forecast.</Notice>}
            <div className="section-divider" /><div className="section-title"><div><h3>Harmonized hotspots</h3><p>Records held in the team's database</p></div><Database size={18} className="muted-icon" /></div><Explain subject="harmonized hotspots">These are satellite records organised and processed by the project so they can be compared. Availability depends on the regions and dates already loaded into the database.</Explain>{busy.hotspots ? <Spinner /> : errors.hotspots ? <Notice error>{errors.hotspots}</Notice> : <p className="body-copy">{hotspots?.features.length ? `${numberLabel(hotspots.features.length)} records on this page.` : 'No records came back for the selection.'} Database coverage is limited to the areas and dates loaded.</p>}
          </div>}

          {tab === 'calendario' && <div className="panel-content"><div className="section-title"><div><h3>Activity calendar</h3><p>Travel through the records available in FIRMS</p></div><CalendarDays size={19} className="muted-icon" /></div><Explain subject="the activity calendar">The calendar groups thermal records by day and sensor. Each page covers up to five days; use Next days to continue when there is more data.</Explain><form className="filter-form" onSubmit={submitFilters}><label>From<input type="date" value={draftStart} max={dateUtc()} onChange={(e) => setDraftStart(e.target.value)} required /></label><label>To<input type="date" value={draftEnd} max={dateUtc()} onChange={(e) => setDraftEnd(e.target.value)} required /></label><label className="wide">Sensor<select value={draftSensor} onChange={(e) => setDraftSensor(e.target.value as Sensor)}><option value="">MODIS and VIIRS</option><option value="MODIS">MODIS</option><option value="VIIRS">VIIRS</option></select></label><button className="primary-button wide" type="submit">Query period <ArrowRight size={16} /></button></form>
            {busy.calendar ? <Spinner text="Fetching the page" /> : errors.calendar ? <Notice error>{errors.calendar}</Notice> : calendar && <><div className="section-divider" /><div className="section-title compact"><div><h3>Records per day</h3><p>{dateLabel(calendar.inicio)} to {dateLabel(calendar.fim_consultado)}</p></div></div><CalendarBars calendar={calendar} /><div className="chart-footer"><span><i className="sensor-dot viirs" /> VIIRS</span><span><i className="sensor-dot modis" /> MODIS</span></div><div className="sensor-summary"><div><span>VIIRS</span><strong>{viirs == null ? 'No record' : numberLabel(viirs)}</strong></div><div><span>MODIS</span><strong>{modis == null ? 'No record' : numberLabel(modis)}</strong></div></div><div className="pagination"><span>{calendar.resultado_completo ? 'End of the period' : 'Paged query, up to 5 days'}</span><button className="text-button" disabled={!calendar.proximo_inicio} onClick={nextCalendar}>Next days <ArrowRight size={14} /></button></div><Notice>These are direct FIRMS data, not harmonized. No record does not prove no fire.</Notice><details className="details"><summary>See source availability <ChevronDown size={15} /></summary>{calendar.disponibilidade.map((item, index) => <div className="availability" key={`${item.produto}-${index}`}><span>{item.produto}</span><strong>{item.disponivel ? 'Product available' : 'Unavailable'}</strong></div>)}</details>
            <div className="section-divider" /><div className="section-title compact"><div><h3>Compare other years</h3><p>Same days, one sensor at a time</p></div></div><Explain subject="the comparison between years">Compares the same days in different years, one sensor at a time. Changes in coverage, clouds and processing can affect the numbers.</Explain><div className="compare-controls"><select aria-label="Sensor for the comparison" value={compareSensor} onChange={(e) => setCompareSensor(e.target.value as 'MODIS' | 'VIIRS')}><option value="VIIRS">VIIRS</option><option value="MODIS">MODIS</option></select><button className="secondary-button" onClick={runComparison} disabled={busy.comparison}>{busy.comparison ? 'Fetching...' : 'Compare years'}</button></div>{errors.comparison && <Notice error>{errors.comparison}</Notice>}{comparison && <><div className="comparison-list">{comparison.periodos.map((item) => <div key={item.inicio}><span>{dateLabel(item.inicio)} — {dateLabel(item.fim)}</span><strong>{item.deteccoes == null ? 'Unavailable' : numberLabel(item.deteccoes)}</strong></div>)}</div><Notice>{comparison.aviso}</Notice></>}</>}
          </div>}

          {tab === 'analise' && <div className="panel-content"><div className="section-title"><div><h3>Scientific analysis</h3><p>An analysis guided by the sources queried</p></div><span className="spark-badge"><Sparkles size={18} /></span></div><Explain subject="the scientific analysis">The agents gather the available sources and give an explanation in plain language. The answer can contain errors and should be checked against the evidence and the limitations.</Explain><p className="body-copy">Agents query the calendar, the forecast and the harmonized database; a review records the limitations before the summary.</p><label className="field-label">Your question<textarea value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500} rows={3} /></label><button className="primary-button full" disabled={busy.analysis || !country || question.trim().length < 3} onClick={runAnalysis}>{busy.analysis ? <><LoaderCircle size={16} className="spin" /> Analysing sources...</> : <>Analyse territory <Sparkles size={16} /></>}</button><p className="footnote">The analysis uses the first page of the period. Your question and the territory are sent to the AI provider; do not include personal data.</p>{errors.analysis && <Notice error>{errors.analysis}</Notice>}
            {analysis && <><div className="section-divider" /><h3 className="minor-title">Analysis result</h3>{analysis.sintese ? <div className="analysis-answer"><Sparkles size={17} /><div><p>{analysis.sintese.texto}</p><small>Summary: {analysis.sintese.provedor} · sources {analysis.sintese.fontes.join(', ')}</small></div></div> : <Notice>The AI summary is unavailable or did not pass review. See the evidence and the steps below.</Notice>}<div className="agent-list">{analysis.etapas.map((step) => <div key={step.agente}><span className={step.status === 'concluído' ? 'agent-ok' : 'agent-warn'}>{step.status === 'concluído' ? <Check size={13} /> : '!'}</span><span>{step.agente}</span><small>{step.status === 'concluído' ? 'done' : step.status}</small></div>)}</div><HistoricalEvidence analysis={analysis} /><button className="secondary-button report-export" onClick={() => window.print()}><Printer size={15} /> Export report / PDF</button><details className="details"><summary>About the sensors <ChevronDown size={15} /></summary><p className="body-copy">The VIIRS active fire product uses pixels of about 375 metres; MODIS uses pixels of about 1 kilometre. They do not see exactly the same fires.</p><a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noreferrer">About NASA FIRMS <ArrowUpRight size={14} /></a></details><details className="details"><summary>Limitations and scientific review <ChevronDown size={15} /></summary><ul>{analysis.revisao.map((note) => <li key={note}>{note}</li>)}</ul></details><details className="details"><summary>Sources and evidence <ChevronDown size={15} /></summary>{analysis.fontes.filter((source) => source.id in analysis.evidencias).map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.nome} <ArrowUpRight size={14} /></a>)}<pre>{JSON.stringify(analysis.evidencias, null, 2)}</pre></details><p className="footnote">{analysis.aviso}</p></>}
          </div>}

          {tab === 'cenario' && <div className="panel-content"><div className="section-title"><div><h3>Scenario sandbox</h3><p>What if the weather changed?</p></div><SlidersHorizontal size={19} className="muted-icon" /></div><Explain subject="the scenario sandbox">Change temperature, humidity or wind to compare the model output with the reference for the selected cell. It is a hypothesis, not a forecast of fire spread.</Explain><Notice>Experimental simulation on the same model. It does not estimate spread and should not guide decisions.</Notice>{selectedCell?.clima_power ? <><div className="scenario-location"><MapPin size={16} /><div><strong>{selectedCell.celula_id.replace('global_', 'Cell ')}</strong><small>{selectedCell.latitude.toFixed(3)}°, {selectedCell.longitude.toFixed(3)}° · choose another cell in Overview</small></div></div><label className="range-label"><span>Temperature <strong>{deltaTemp > 0 ? '+' : ''}{deltaTemp} °C</strong></span><input type="range" min="-5" max="5" step="0.5" value={deltaTemp} onChange={(e) => { setDeltaTemp(Number(e.target.value)); setScenario(null); }} /><small>Reference: {selectedCell.clima_power.clima_T2M?.toFixed(1)} °C</small></label><label className="range-label"><span>Relative humidity <strong>{deltaHumidity > 0 ? '+' : ''}{deltaHumidity} pts</strong></span><input type="range" min="-20" max="20" step="1" value={deltaHumidity} onChange={(e) => { setDeltaHumidity(Number(e.target.value)); setScenario(null); }} /><small>Reference: {selectedCell.clima_power.clima_RH2M?.toFixed(1)}%</small></label><label className="range-label"><span>Wind <strong>{deltaWind > 0 ? '+' : ''}{deltaWind} m/s</strong></span><input type="range" min="-3" max="3" step="0.5" value={deltaWind} onChange={(e) => { setDeltaWind(Number(e.target.value)); setScenario(null); }} /><small>Reference: {selectedCell.clima_power.clima_WS10M?.toFixed(1)} m/s</small></label><button className="primary-button full" disabled={scenarioBusy} onClick={runScenario}>{scenarioBusy ? 'Computing scenario...' : 'Compare with reference'} <ArrowRight size={16} /></button>{scenarioError && <Notice error>{scenarioError}</Notice>}{scenario && <><div className="scenario-results"><div><span>Reference</span><strong>{percentLabel(scenario.baseline)}</strong></div><ArrowDownRight size={19} /><div><span>Hypothetical scenario</span><strong>{percentLabel(scenario.scenario)}</strong></div></div><Notice>{scenario.aviso}</Notice></>}</> : <Notice>Wait for the forecast and choose a cell with weather data.</Notice>}</div>}

          {tab === 'relatos' && <div className="panel-content"><div className="section-title"><div><h3>Community reports</h3><p>A human observation can complement the map</p></div><UsersRound size={20} className="muted-icon" /></div><Notice>Reports are not satellite detections. They are sent for review before they appear on the map. Do not give names, phone numbers or personal data.</Notice><form onSubmit={submitReport} className="report-form"><label className="field-label">What did you see?<select value={reportCategory} onChange={(e) => setReportCategory(e.target.value)}><option value="fumaca">Smoke</option><option value="fogo">Fire</option><option value="area_queimada">Burned area</option><option value="outro">Other</option></select></label><label className="field-label">When did it happen?<input type="datetime-local" value={reportDate} onChange={(e) => setReportDate(e.target.value)} required /></label><div className="coordinate-head"><strong>Approximate location</strong><button type="button" className="text-button" onClick={() => setPicking(!picking)}><Crosshair size={15} /> {picking ? 'Click the map' : 'Mark on the map'}</button></div><div className="coordinate-fields"><label>Latitude<input type="number" step="any" min="-90" max="90" value={reportLat} onChange={(e) => setReportLat(e.target.value)} placeholder="-15.000" required /></label><label>Longitude<input type="number" step="any" min="-180" max="180" value={reportLon} onChange={(e) => setReportLon(e.target.value)} placeholder="-47.000" required /></label></div><label className="field-label">Describe what you saw<textarea value={description} onChange={(e) => setDescription(e.target.value)} minLength={10} maxLength={600} rows={4} placeholder="Describe only the event you observed..." required /></label><button className="primary-button full" disabled={busy.report || !country} type="submit">{busy.report ? 'Sending...' : 'Send report for review'} <Send size={16} /></button></form>{errors.report && <Notice error>{errors.report}</Notice>}{reportResult && <div className="success-message"><Check size={16} /> {reportResult}</div>}<div className="section-divider" /><p className="body-copy">{reports.length ? `${reports.length} approved report(s) for this country.` : 'There are no approved reports for this country yet.'}</p></div>}

          {tab === 'metodo' && <div className="panel-content"><div className="section-title"><div><h3>About the data</h3><p>Understanding the sources is part of exploring</p></div><Microscope size={20} className="muted-icon" /></div><div className="method-item"><span>01</span><div><h4>A detection is not a fire</h4><p>MODIS and VIIRS detect thermal anomalies. Clouds, resolution and overpass times affect what each sensor can observe.</p></div></div><div className="method-item"><span>02</span><div><h4>Two origins, two readings</h4><p>The calendar queries FIRMS directly. The harmonized hotspots come from the project database and are limited to what has been loaded.</p></div></div><div className="method-item"><span>03</span><div><h4>Experimental forecast</h4><p>The model was trained on part of MATOPIBA, in Brazil, and has no approved global calibration. Each value is a conditional output for one cell, not for the country.</p></div></div><div className="method-item"><span>04</span><div><h4>Collective knowledge</h4><p>Human reports are kept apart from the scientific sources and appear only after review. They are not independent confirmation of a fire.</p></div></div><a className="source-link" href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noreferrer">NASA FIRMS <ArrowUpRight size={15} /></a><a className="source-link" href="https://power.larc.nasa.gov/" target="_blank" rel="noreferrer">NASA POWER <ArrowUpRight size={15} /></a><a className="source-link" href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">Natural Earth <ArrowUpRight size={15} /></a></div>}
        </div>
        <div className="panel-footer"><span><span className="pulse-dot" /> PYROSYNC ATLAS</span><button onClick={() => setTab('metodo')}>Sources and method <ArrowUpRight size={13} /></button></div>
      </aside>}
    </main>
    <section className="print-report" aria-label="Report for printing"><h1>PyroSync: observation report</h1><p><strong>Territory:</strong> {selectedName}{region ? ` · ${region}` : ''}</p><p><strong>Selected period:</strong> {dateLabel(filters.inicio)} to {dateLabel(filters.fim)} UTC</p>{calendar && <><h2>Observed calendar</h2><p>Page actually queried: {dateLabel(calendar.inicio)} to {dateLabel(calendar.fim_consultado)}. {calendar.proximo_inicio ? 'There are more pages for the selected period.' : 'End of the requested period.'}</p><p>VIIRS: {viirs == null ? 'no record returned' : numberLabel(viirs)} · MODIS: {modis == null ? 'no record returned' : numberLabel(modis)}.</p><p>Source: direct NASA FIRMS query, not harmonized. The sensors should not be added up as fires.</p></>}{analysis && <><h2>Summary and review</h2><p>{analysis.sintese?.texto || 'Automatic summary unavailable; see the sources and the evidence.'}</p><HistoricalEvidence analysis={analysis} /><ul>{analysis.revisao.map((note) => <li key={note}>{note}</li>)}</ul><h2>Sources queried</h2><ul>{analysis.fontes.filter((source) => source.id in analysis.evidencias).map((source) => <li key={source.id}>{source.nome}: {source.url}</li>)}</ul></>}<p>The forecast and the scenarios are experimental, not calibrated globally, and not fit for alerts.</p></section>
    {intro && <section className="welcome-screen" aria-label="PyroSync introduction">
      <div className="welcome-copy"><div className="welcome-tag"><span /> NASA SPACE APPS · EARTH OBSERVATION</div>
        <h1>Watching the Earth<br /><em>changes everything.</em></h1>
        <p>Explore fire hotspots, find patterns over time and understand what the satellites can observe.</p>
        <div className="welcome-actions"><button className="welcome-primary" onClick={() => { setIntro(false); setPanelOpen(false); }}>Explore the globe <ArrowRight size={17} /></button><button className="welcome-secondary" onClick={() => openPanel('metodo')}>About the data <ArrowUpRight size={15} /></button></div>
        <div className="welcome-sources"><span><strong>MODIS + VIIRS</strong><small>Satellite observation</small></span><span><strong>NASA POWER</strong><small>Weather context</small></span><span><strong>EXPERIMENTAL</strong><small>Research, not an alert</small></span></div>
      </div>
      <div className="welcome-foot">AN OBSERVATORY FOR A CHANGING PLANET <span>BUILT FOR NASA SPACE APPS</span></div>
    </section>}
  </div>;
}

export default App;
