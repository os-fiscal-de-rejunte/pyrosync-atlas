import { useEffect, useRef, useState } from 'react';
import {
  Cartesian2, Cartesian3, Cartographic, Color, ColorMaterialProperty, ConstantPositionProperty, ConstantProperty,
  CustomDataSource, GeoJsonDataSource, ImageryLayer, Math as CesiumMath, PointGraphics,
  SceneMode, ScreenSpaceEventHandler, ScreenSpaceEventType, UrlTemplateImageryProvider,
  Viewer, WebMercatorTilingScheme,
} from 'cesium';
import { Globe2, Minus, Plus } from 'lucide-react';
import type { CommunityReport, Country, Forecast, Points } from './types';

interface Props {
  selected: Country | null;
  focusCell: { lat: number; lon: number; request: number } | null;
  countries: Country[];
  forecast: Forecast | null;
  hotspots: Points | null;
  directHotspots: Points | null;
  reports: CommunityReport[];
  layers: { previsao: boolean; focos: boolean; direto: boolean; relatos: boolean };
  pickingPoint: boolean;
  onCountry: (country: Country) => void;
  onPoint: (lat: number, lon: number) => void;
}

const cameraHome = () => {
  const aspect = window.innerWidth / Math.max(window.innerHeight, 1);
  const altitude = Math.min(30_000_000, 15_500_000 + Math.max(0, aspect - 1) * 8_000_000);
  return Cartesian3.fromDegrees(-48, -14, altitude);
};

function probabilityColor(value: number | null) {
  if (value == null) return Color.fromCssColorString('#8b9691');
  if (value < 0.05) return Color.fromCssColorString('#e3edb1');
  if (value < 0.15) return Color.fromCssColorString('#e8c66b');
  if (value < 0.35) return Color.fromCssColorString('#ed8c56');
  if (value < 0.6) return Color.fromCssColorString('#d95239');
  return Color.fromCssColorString('#ad2924');
}

export default function Globe(props: Props) {
  const element = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const countryLayer = useRef<GeoJsonDataSource | null>(null);
  const forecastLayer = useRef<GeoJsonDataSource | null>(null);
  const hotspotLayer = useRef<GeoJsonDataSource | null>(null);
  const directLayer = useRef<GeoJsonDataSource | null>(null);
  const reportLayer = useRef<CustomDataSource | null>(null);
  const latest = useRef(props);
  const initialSelection = useRef(true);
  const [error, setError] = useState('');
  latest.current = props;

  useEffect(() => {
    if (!element.current) return;
    let disposed = false;
    let globe: Viewer;
    try {
      const imagery = new ImageryLayer(new UrlTemplateImageryProvider({
        url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/2004-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',
        tilingScheme: new WebMercatorTilingScheme(), maximumLevel: 8,
        credit: 'NASA GIBS Blue Marble · Natural Earth',
      }));
      globe = new Viewer(element.current, {
        baseLayer: imagery, baseLayerPicker: false, sceneMode: SceneMode.SCENE3D,
        sceneModePicker: false, animation: false, timeline: false, geocoder: false,
        homeButton: false, navigationHelpButton: false, fullscreenButton: false,
        infoBox: false, selectionIndicator: false, shouldAnimate: false,
        requestRenderMode: true, maximumRenderTimeChange: Infinity,
      });
    } catch {
      setError('O globo 3D precisa de WebGL. Ative a aceleração gráfica ou use um navegador compatível.');
      return;
    }
    viewer.current = globe;
    globe.scene.globe.enableLighting = false;
    globe.scene.globe.depthTestAgainstTerrain = false;
    globe.scene.screenSpaceCameraController.minimumZoomDistance = 3000;
    globe.scene.screenSpaceCameraController.maximumZoomDistance = 40_000_000;
    globe.scene.screenSpaceCameraController.enableRotate = true;
    globe.scene.screenSpaceCameraController.enableTilt = true;
    globe.scene.screenSpaceCameraController.enableLook = true;
    globe.camera.setView({ destination: cameraHome() });
    const reports = new CustomDataSource('observacoes-humanas');
    reportLayer.current = reports;
    void globe.dataSources.add(reports);

    void GeoJsonDataSource.load('/countries.geojson', {
      clampToGround: true, fill: Color.fromCssColorString('#bcead3').withAlpha(0.01),
      stroke: Color.fromCssColorString('#d8ebe0').withAlpha(0.48), strokeWidth: 1,
    }).then(async (layer) => {
      if (disposed || globe.isDestroyed()) return;
      countryLayer.current = layer;
      await globe.dataSources.add(layer);
      highlightCountry(globe, layer, latest.current.selected?.code ?? null);
      globe.scene.requestRender();
    }).catch(() => {
      if (!disposed) setError('Não foi possível carregar os limites dos países. A busca continua disponível.');
    });

    const handler = new ScreenSpaceEventHandler(globe.scene.canvas);
    handler.setInputAction((event: { position: Cartesian2 }) => {
      if (latest.current.pickingPoint) {
        const position = globe.camera.pickEllipsoid(event.position, globe.scene.globe.ellipsoid);
        if (position) {
          const point = Cartographic.fromCartesian(position);
          latest.current.onPoint(CesiumMath.toDegrees(point.latitude), CesiumMath.toDegrees(point.longitude));
        }
        return;
      }
      const picks = globe.scene.drillPick(event.position, 8);
      for (const hit of picks) {
        const code = hit.id?.properties?.ADM0_A3?.getValue(globe.clock.currentTime);
        const match = latest.current.countries.find((country) => country.code === code);
        if (match) { latest.current.onCountry(match); break; }
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      disposed = true;
      handler.destroy();
      if (!globe.isDestroyed()) globe.destroy();
      viewer.current = null;
      countryLayer.current = null;
      forecastLayer.current = null;
      hotspotLayer.current = null;
      directLayer.current = null;
      reportLayer.current = null;
    };
  }, []);

  useEffect(() => {
    const globe = viewer.current;
    if (!globe || !props.selected || globe.isDestroyed()) return;
    if (countryLayer.current) highlightCountry(globe, countryLayer.current, props.selected.code);
    if (initialSelection.current) {
      initialSelection.current = false;
    } else {
      const altitude = props.selected.code === 'GRD' ? 170_000 : 4_000_000;
      globe.camera.flyTo({ destination: Cartesian3.fromDegrees(props.selected.lon, props.selected.lat, altitude),
        duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1.6 });
    }
    globe.scene.requestRender();
  }, [props.selected]);

  useEffect(() => {
    const globe = viewer.current;
    if (!globe || globe.isDestroyed() || !props.focusCell) return;
    globe.camera.flyTo({ destination: Cartesian3.fromDegrees(props.focusCell.lon, props.focusCell.lat, 220_000),
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1.6 });
  }, [props.focusCell]);

  useEffect(() => {
    const globe = viewer.current;
    if (!globe || globe.isDestroyed()) return;
    let cancelled = false;
    if (forecastLayer.current) globe.dataSources.remove(forecastLayer.current, true);
    forecastLayer.current = null;
    if (props.layers.previsao && props.forecast?.features.length) {
      void GeoJsonDataSource.load(props.forecast, { clampToGround: true, stroke: Color.WHITE.withAlpha(0.9), strokeWidth: 1 })
        .then(async (layer) => {
          if (cancelled || globe.isDestroyed()) return;
          layer.entities.values.forEach((entity) => {
            const p = entity.properties?.probabilidade_condicional?.getValue(globe.clock.currentTime) as number | null;
            const lat = entity.properties?.latitude?.getValue(globe.clock.currentTime) as number;
            const lon = entity.properties?.longitude?.getValue(globe.clock.currentTime) as number;
            const color = probabilityColor(p);
            if (entity.polygon) entity.polygon.material = new ColorMaterialProperty(color.withAlpha(0.72));
            if (Number.isFinite(lat) && Number.isFinite(lon)) {
              entity.position = new ConstantPositionProperty(Cartesian3.fromDegrees(lon, lat, 500));
              entity.point = new PointGraphics({ pixelSize: 5, color, outlineColor: Color.WHITE, outlineWidth: 1 });
            }
          });
          forecastLayer.current = layer;
          await globe.dataSources.add(layer);
          globe.scene.requestRender();
        }).catch(() => { if (!cancelled) setError('Não foi possível desenhar as células previstas no globo.'); });
    }
    globe.scene.requestRender();
    return () => { cancelled = true; };
  }, [props.forecast, props.layers.previsao]);

  useEffect(() => {
    const globe = viewer.current;
    if (!globe || globe.isDestroyed()) return;
    let cancelled = false;
    if (hotspotLayer.current) globe.dataSources.remove(hotspotLayer.current, true);
    hotspotLayer.current = null;
    if (props.layers.focos && props.hotspots?.features.length) {
      void GeoJsonDataSource.load(props.hotspots, { clampToGround: true }).then(async (layer) => {
        if (cancelled || globe.isDestroyed()) return;
        layer.entities.values.forEach((entity) => {
          entity.billboard = undefined;
          entity.point = new PointGraphics({ pixelSize: 7, color: Color.fromCssColorString('#ff7b4d'),
            outlineColor: Color.fromCssColorString('#fff0d2'), outlineWidth: 1 });
        });
        hotspotLayer.current = layer;
        await globe.dataSources.add(layer);
        globe.scene.requestRender();
      }).catch(() => { if (!cancelled) setError('Não foi possível desenhar os focos no globo.'); });
    }
    globe.scene.requestRender();
    return () => { cancelled = true; };
  }, [props.hotspots, props.layers.focos]);

  useEffect(() => {
    const globe = viewer.current;
    if (!globe || globe.isDestroyed()) return;
    let cancelled = false;
    if (directLayer.current) globe.dataSources.remove(directLayer.current, true);
    directLayer.current = null;
    if (props.layers.direto && props.directHotspots?.features.length) {
      void GeoJsonDataSource.load(props.directHotspots, { clampToGround: true }).then(async (layer) => {
        if (cancelled || globe.isDestroyed()) return;
        layer.entities.values.forEach((entity) => {
          entity.billboard = undefined;
          entity.point = new PointGraphics({ pixelSize: 6, color: Color.fromCssColorString('#ffc04e'),
            outlineColor: Color.fromCssColorString('#fff4d1'), outlineWidth: 1 });
        });
        directLayer.current = layer;
        await globe.dataSources.add(layer);
        globe.scene.requestRender();
      }).catch(() => { if (!cancelled) setError('Não foi possível desenhar os pontos FIRMS no globo.'); });
    }
    globe.scene.requestRender();
    return () => { cancelled = true; };
  }, [props.directHotspots, props.layers.direto]);

  useEffect(() => {
    const globe = viewer.current;
    const layer = reportLayer.current;
    if (!globe || !layer || globe.isDestroyed()) return;
    layer.entities.removeAll();
    if (props.layers.relatos) props.reports.forEach((report) => layer.entities.add({
      position: Cartesian3.fromDegrees(report.longitude, report.latitude, 500),
      point: { pixelSize: 8, color: Color.fromCssColorString('#9cddbc'),
        outlineColor: Color.fromCssColorString('#102e25'), outlineWidth: 2 },
    }));
    globe.scene.requestRender();
  }, [props.reports, props.layers.relatos]);

  const zoom = (direction: 'in' | 'out') => {
    const globe = viewer.current;
    if (!globe || globe.isDestroyed()) return;
    const distance = Math.max(500, globe.camera.positionCartographic.height * 0.45);
    if (direction === 'in') globe.camera.zoomIn(distance); else globe.camera.zoomOut(distance);
    globe.scene.requestRender();
  };

  const reset = () => {
    const globe = viewer.current;
    if (!globe || globe.isDestroyed()) return;
    globe.camera.flyTo({ destination: cameraHome(), duration: 1.2 });
  };

  return <>
    <div className="globe" ref={element} role="application" aria-label="Globo tridimensional interativo. Arraste para girar, use a roda para aproximar e clique em um país." />
    <div className="globe-controls" aria-label="Controles do globo">
      <button title="Aproximar" aria-label="Aproximar globo" onClick={() => zoom('in')}><Plus size={18} /></button>
      <button title="Afastar" aria-label="Afastar globo" onClick={() => zoom('out')}><Minus size={18} /></button>
      <button title="Visão global" aria-label="Voltar à visão global" onClick={reset}><Globe2 size={17} /></button>
    </div>
    {error && <div className="globe-error" role="alert">{error}</div>}
  </>;
}

function highlightCountry(globe: Viewer, layer: GeoJsonDataSource, code: string | null) {
  layer.entities.values.forEach((entity) => {
    if (!entity.polygon) return;
    const isSelected = code && entity.properties?.ADM0_A3?.getValue(globe.clock.currentTime) === code;
    entity.polygon.material = new ColorMaterialProperty(
      Color.fromCssColorString(isSelected ? '#d9f4b8' : '#bcead3').withAlpha(isSelected ? 0.13 : 0.01),
    );
    entity.polygon.outlineColor = new ConstantProperty(Color.fromCssColorString(isSelected ? '#e2fa9e' : '#d8ebe0').withAlpha(isSelected ? 0.95 : 0.48));
  });
}
