import {
  Component,
  AfterViewInit,
  OnDestroy,
  Input,
  Output,
  OnChanges,
  EventEmitter,
  ViewChild,
  ElementRef,
  HostListener,
  SimpleChanges,
  ViewEncapsulation
} from '@angular/core';
import * as maplibregl from 'maplibre-gl';
import type { Feature, Point, FeatureCollection } from 'geojson';
import type { Experience, ExperienceSummary } from '../../shared/models/experience.model';

export interface MapMarker {
  id?: string | number;
  nombre: string;
  lng: number;
  lat: number;
  color?: string;
  data?: any;
}

export interface MapConfig {
  center?: [number, number];
  zoom?: number;
  style?: string;
  minZoom?: number;
  maxZoom?: number;
  useGoogleStyle?: boolean;
}

@Component({
  selector: 'app-map',
  standalone: true,
  template: `<div #mapContainer class="map-container"></div>`,
  styleUrls: ['./map.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class MapComponent implements AfterViewInit, OnDestroy, OnChanges {
  @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef;

  // Inputs configurables
  @Input() markers: MapMarker[] = [];
  @Input() features: Feature<Point | null>[] = [];
  @Input() config: MapConfig = {
    center: [-74.0721, 4.7110],
    zoom: 12,
    style: 'https://demotiles.maplibre.org/style.json',
    minZoom: 1,
    maxZoom: 20
  };
  @Input() height: string = '600px';
  @Input() width: string = '100%';
  @Input() responsiveWidth: boolean = true;
  @Input() useGoogleStyle: boolean = true;
  @Input() showControls: boolean = true;
  @Input() allowPopups: boolean = true;
  @Input() markerColor: string = '#3b82f6';
  @Input() enableClusterToggle: boolean = true;
  @Input() clusteringEnabled: boolean = true;
  @Input() experienceSummaries: Record<string, ExperienceSummary> = {};

  // Outputs
  @Output() mapLoaded = new EventEmitter<maplibregl.Map>();
  @Output() clusteringChange = new EventEmitter<boolean>();
  @Output() markerClick = new EventEmitter<MapMarker>();
  @Output() mapClick = new EventEmitter<{ lng: number; lat: number }>();
  @Output() addExperienceRequested = new EventEmitter<MapMarker>();
  @Output() editConsultorioRequested = new EventEmitter<MapMarker>();

  map!: maplibregl.Map;
  private resizeTimeout: any;
  private readonly sourceId = 'consultorios-source';
  private readonly clusterLayerId = 'consultorios-clusters';
  private readonly clusterCountLayerId = 'consultorios-cluster-count';
  private readonly unclusteredLayerId = 'consultorios-unclustered';
  private clusterHandlersInitialized = false;
  private previewPopup: maplibregl.Popup | null = null;
  private previewMarker: MapMarker | null = null;
  private selectedPopup: maplibregl.Popup | null = null;
  private selectedMarker: MapMarker | null = null;
  private clusterLayerVisible = true;
  private clusterToggleControl?: maplibregl.IControl;
  private clusterToggleButton?: HTMLButtonElement;

  @HostListener('window:resize', ['$event'])
  onWindowResize() {
    if (this.responsiveWidth && this.map) {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = setTimeout(() => {
        this.map.resize();
        this.updateMapWidth();
      }, 200);
    }
  }

  ngAfterViewInit(): void {
    this.initializeMap();
  }

  ngOnDestroy(): void {
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
    this.previewPopup?.remove();
    this.selectedPopup?.remove();
    this.previewPopup = null;
    this.selectedPopup = null;
    this.selectedMarker = null;
    if (this.clusterToggleControl) {
      this.map?.removeControl(this.clusterToggleControl);
      this.clusterToggleControl = undefined;
      this.clusterToggleButton = undefined;
    }
    if (this.map) {
      this.map.remove();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    const markersChanged = Boolean(changes['markers']);
    const featuresChanged = Boolean(changes['features']);
    const clusteringChanged = Boolean(changes['clusteringEnabled']);
    const experiencesChanged = Boolean(changes['experienceSummaries']);

    if (!this.map) {
      return;
    }

    if (clusteringChanged && !changes['clusteringEnabled']?.firstChange) {
      this.setClusteringEnabled(changes['clusteringEnabled'].currentValue, false);
    }

    if (!markersChanged && !featuresChanged && !experiencesChanged) {
      return;
    }

    if (markersChanged || featuresChanged) {
      this.refreshMarkers();
    }

    if (experiencesChanged) {
      if (this.selectedMarker && this.selectedPopup) {
        this.showSelectedPopup(this.selectedMarker);
      }
      if (this.previewMarker && this.previewPopup) {
        this.showPreviewPopup(this.previewMarker);
      }
    }
  }

private initializeMap(): void {
  if (this.mapContainer) {
    // ✅ Garantiza altura visible
    this.mapContainer.nativeElement.style.height = this.height;
    this.updateMapWidth();
  }

  const mapStyle =
    this.useGoogleStyle || this.config.useGoogleStyle
      ? this.getGoogleLikeStyle()
      : this.config.style || 'https://demotiles.maplibre.org/style.json';

  this.map = new maplibregl.Map({
    container: this.mapContainer.nativeElement,
    style: mapStyle,
    center: this.config.center || [-74.0721, 4.7110],
    zoom: this.config.zoom || 12,
    minZoom: this.config.minZoom,
    maxZoom: this.config.maxZoom,
  });

  if (this.showControls) {
    this.map.addControl(new maplibregl.NavigationControl(), 'top-right');
    this.map.addControl(new maplibregl.FullscreenControl(), 'top-right');
    this.map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-left');
  }

  this.map.on('load', () => {
    console.log('🗺️ Mapa cargado correctamente');
    this.setupSource();
    this.setupLayers();
    this.applyClusterVisibility();
    this.setupClusterInteractions();
    this.setupClusterToggleControl();
    this.refreshMarkers();
    this.mapLoaded.emit(this.map);
  });

  // ✅ Captura clics sobre el mapa (para crear consultorios)
  this.map.on('click', (e: maplibregl.MapMouseEvent) => {
    const features = this.map.queryRenderedFeatures(e.point, {
      layers: [this.clusterLayerId, this.unclusteredLayerId],
    });
    if (features.length > 0) return; // clic sobre un punto existente

    const { lng, lat } = e.lngLat;
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      console.log('📍 Clic libre detectado:', lng, lat);
      this.mapClick.emit({ lng, lat });
    } else {
      console.warn('⚠️ Coordenadas no válidas en clic:', e);
    }
  });
}


  private getGoogleLikeStyle(): any {
    return {
      "version": 8,
      "name": "Google-like Style",
      "glyphs": "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      "sources": {
        "osm": {
          "type": "raster",
          "tiles": ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          "tileSize": 256,
          "attribution": "&copy; OpenStreetMap Contributors",
          "maxzoom": 19
        }
      },
      "layers": [
        {
          "id": "osm",
          "type": "raster",
          "source": "osm",
          "minzoom": 0,
          "maxzoom": 22
        }
      ]
    };
  }

  private updateMapWidth(): void {
    if (!this.mapContainer) return;
    this.mapContainer.nativeElement.style.width = this.responsiveWidth ? '100%' : this.width;
  }

  public fitBounds(): void {
    const all = this.collectAllCoordinates();
    if (all.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    all.forEach(coord => bounds.extend(coord as [number, number]));
    this.map.fitBounds(bounds, { padding: 50 });
  }

  private refreshMarkers(): void {
    const source = this.map.getSource(this.sourceId) as maplibregl.GeoJSONSource | undefined;
    if (!source) {
      return;
    }

    this.hidePreviewPopup();
    source.setData(this.buildFeatureCollection());

    if (this.markers.length || this.features.length) {
      this.fitBounds();
    }

    if (!this.allowPopups) {
      this.clearSelectedMarker();
      return;
    }

    if (this.selectedMarker) {
      this.showSelectedPopup(this.selectedMarker);
    }
  }

  private setClusteringEnabled(value: boolean, emit = true): void {
    const normalized = Boolean(value);
    if (this.clusteringEnabled === normalized) {
      return;
    }

    this.clusteringEnabled = normalized;
    this.clusterLayerVisible = normalized;

    if (!this.map) {
      if (emit) {
        this.clusteringChange.emit(this.clusteringEnabled);
      }
      return;
    }

    this.hidePreviewPopup();
    this.clearSelectedMarker();

    this.rebuildSource();
    this.applyClusterVisibility();
    this.refreshMarkers();
    if (emit) {
      this.clusteringChange.emit(this.clusteringEnabled);
    }
    this.updateClusterToggleLabel();
  }

  private rebuildSource(): void {
    if (!this.map) return;

    [this.clusterCountLayerId, this.clusterLayerId, this.unclusteredLayerId].forEach(layerId => {
      if (this.map.getLayer(layerId)) {
        this.map.removeLayer(layerId);
      }
    });

    if (this.map.getSource(this.sourceId)) {
      this.map.removeSource(this.sourceId);
    }

    this.setupSource();
    this.setupLayers();
    this.applyClusterVisibility();
  }

  private applyClusterVisibility(): void {
    if (!this.map) return;
    const clusterVisibility = this.clusteringEnabled ? 'visible' : 'none';
    if (this.map.getLayer(this.clusterLayerId)) {
      this.map.setLayoutProperty(this.clusterLayerId, 'visibility', clusterVisibility);
    }
    if (this.map.getLayer(this.clusterCountLayerId)) {
      this.map.setLayoutProperty(this.clusterCountLayerId, 'visibility', clusterVisibility);
    }
    if (this.map.getLayer(this.unclusteredLayerId)) {
      this.map.setLayoutProperty(this.unclusteredLayerId, 'visibility', 'visible');
    }
  }

  private setupClusterToggleControl(): void {
    if (!this.enableClusterToggle || this.clusterToggleControl) {
      return;
    }

    const container = document.createElement('div');
    container.className = 'maplibregl-ctrl map-toggle-control';

    const button = document.createElement('button');
    button.type = 'button';
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.setClusteringEnabled(!this.clusteringEnabled);
    });

    container.appendChild(button);
    this.clusterToggleButton = button;

    const control: maplibregl.IControl = {
      onAdd: () => {
        this.updateClusterToggleLabel();
        return container;
      },
      onRemove: () => {
        container.remove();
        this.clusterToggleButton = undefined;
      }
    };

    this.clusterToggleControl = control;
    this.map.addControl(control, 'top-left');
    this.updateClusterToggleLabel();
  }

  private updateClusterToggleLabel(): void {
    if (!this.clusterToggleButton) {
      return;
    }
    const isClustered = this.clusteringEnabled;
    this.clusterToggleButton.dataset['active'] = String(isClustered);
    this.clusterToggleButton.ariaPressed = String(isClustered);
    this.clusterToggleButton.className = '';
    this.clusterToggleButton.textContent = isClustered ? 'Ver todas' : 'Agrupar por zonas';
    this.clusterToggleButton.title = isClustered
      ? 'Mostrar todos los puntos en el mapa'
      : 'Agrupar puntos cercanos en clústeres';
  }

  private setupSource(): void {
    if (this.map.getSource(this.sourceId)) {
      return;
    }

    this.map.addSource(this.sourceId, {
      type: 'geojson',
      data: this.buildFeatureCollection(),
      cluster: this.clusteringEnabled,
      clusterRadius: 60,
      clusterMaxZoom: 14
    } as any);
  }

  private setupLayers(): void {
    if (!this.map.getLayer(this.clusterLayerId)) {
      this.map.addLayer({
        id: this.clusterLayerId,
        type: 'circle',
        source: this.sourceId,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#2563eb',
            20,
            '#1d4ed8',
            50,
            '#1e3a8a'
          ],
          'circle-radius': ['step', ['get', 'point_count'], 18, 20, 24, 50, 30],
          'circle-opacity': 0.85
        }
      });
    }

    if (!this.map.getLayer(this.clusterCountLayerId)) {
      this.map.addLayer({
        id: this.clusterCountLayerId,
        type: 'symbol',
        source: this.sourceId,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-size': 12
        },
        paint: {
          'text-color': '#f8fafc'
        }
      });
    }

    if (!this.map.getLayer(this.unclusteredLayerId)) {
      this.map.addLayer({
        id: this.unclusteredLayerId,
        type: 'circle',
        source: this.sourceId,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['coalesce', ['get', 'markerColor'], this.markerColor],
          'circle-radius': 8,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.95
        }
      });
    }
  }

  private setupClusterInteractions(): void {
    if (this.clusterHandlersInitialized) {
      return;
    }

    this.clusterHandlersInitialized = true;

    this.map.on('click', this.clusterLayerId, (event: maplibregl.MapLayerMouseEvent) => {
      event.preventDefault();
      event.originalEvent?.stopPropagation?.();
      const features = this.map.queryRenderedFeatures(event.point, {
        layers: [this.clusterLayerId]
      });
      const clusterFeature = features[0];
      if (!clusterFeature) return;

      const clusterId = clusterFeature.properties?.['cluster_id'];
      if (typeof clusterId !== 'number') {
        return;
      }

      const source = this.map.getSource(this.sourceId) as maplibregl.GeoJSONSource;

      source.getClusterExpansionZoom(clusterId)
        .then((zoom) => {
          if (typeof zoom !== 'number' || Number.isNaN(zoom)) {
            console.warn('Zoom inválido para el clúster', zoom);
            return;
          }

          const geometry = clusterFeature.geometry as Point | undefined;
          const coordinates = geometry?.coordinates;
          if (!Array.isArray(coordinates) || coordinates.length < 2) {
            return;
          }

          const [lng, lat] = coordinates as [number, number];
          if (!this.isLngLatValid(lng, lat)) {
            return;
          }

          this.hidePreviewPopup();
          this.map.easeTo({
            center: [lng, lat],
            zoom
          });
        })
        .catch((error) => {
          console.warn('No se pudo expandir el clúster', error);
        });
    });

    this.map.on('mouseenter', this.clusterLayerId, () => {
      this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', this.clusterLayerId, () => {
      this.map.getCanvas().style.cursor = '';
    });

    this.map.on('click', this.unclusteredLayerId, (event: maplibregl.MapLayerMouseEvent) => {
      event.preventDefault();
      event.originalEvent?.stopPropagation?.();
      const features = this.map.queryRenderedFeatures(event.point, {
        layers: [this.unclusteredLayerId]
      });
      const feature = features[0];
      if (!feature) return;

      const marker = this.mapFeatureToMarker(feature);
      if (!marker) return;

      if (this.allowPopups) {
        this.showSelectedPopup(marker);
      } else {
        this.clearSelectedMarker();
      }
      this.hidePreviewPopup();
      this.markerClick.emit(marker);
    });

    this.map.on('mouseenter', this.unclusteredLayerId, (event: maplibregl.MapLayerMouseEvent) => {
      this.map.getCanvas().style.cursor = 'pointer';
      if (!this.allowPopups) {
        return;
      }
      const feature = event.features?.[0] ?? this.map.queryRenderedFeatures(event.point, {
        layers: [this.unclusteredLayerId]
      })[0];
      const marker = feature ? this.mapFeatureToMarker(feature) : null;
      if (!marker) {
        return;
      }
      this.showPreviewPopup(marker);
    });
    this.map.on('mouseleave', this.unclusteredLayerId, () => {
      this.map.getCanvas().style.cursor = '';
      this.hidePreviewPopup();
    });
  }

  private showPreviewPopup(marker: MapMarker): void {
    if (!this.allowPopups) {
      return;
    }

    if (this.selectedMarker && this.areSameMarker(this.selectedMarker, marker)) {
      return;
    }

    if (this.previewPopup && this.previewPopup.isOpen() && this.previewMarker && this.areSameMarker(this.previewMarker, marker)) {
      return;
    }

    this.hidePreviewPopup();
    this.previewMarker = { ...marker, data: marker.data };
    this.previewPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 16,
      maxWidth: '280px',
      className: 'maplibre-popup--preview'
    })
      .setLngLat([marker.lng, marker.lat])
      .setDOMContent(this.buildPopupContent(marker, 'preview'))
      .addTo(this.map);

    const previewElement = this.previewPopup.getElement();
    ['mousedown', 'mouseup', 'click'].forEach(eventName => {
      previewElement.addEventListener(eventName, (event) => event.stopPropagation());
    });

    this.previewPopup.on('close', () => {
      this.previewPopup = null;
      this.previewMarker = null;
    });
  }

  private hidePreviewPopup(): void {
    if (this.previewPopup) {
      this.previewPopup.remove();
      this.previewPopup = null;
    }
    this.previewMarker = null;
  }

  private showSelectedPopup(marker: MapMarker): void {
    this.hidePreviewPopup();

    if (this.selectedPopup) {
      this.selectedPopup.remove();
      this.selectedPopup = null;
    }

    this.selectedMarker = { ...marker, data: marker.data };
    this.selectedPopup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      offset: 24,
      maxWidth: '320px',
      className: 'maplibre-popup--selected'
    })
      .setLngLat([marker.lng, marker.lat])
      .setDOMContent(this.buildPopupContent(marker, 'selected'))
      .addTo(this.map);

    const popupElement = this.selectedPopup.getElement();
    ['mousedown', 'mouseup', 'click'].forEach(eventName => {
      popupElement.addEventListener(eventName, (event) => event.stopPropagation());
    });

    this.selectedPopup.on('close', () => {
      this.selectedPopup = null;
      this.selectedMarker = null;
    });
  }

  private clearSelectedMarker(): void {
    if (this.selectedPopup) {
      this.selectedPopup.remove();
      this.selectedPopup = null;
    }
    this.selectedMarker = null;
  }

  private areSameMarker(a: MapMarker | null, b: MapMarker | null): boolean {
    if (!a || !b) {
      return false;
    }

    if (a.id !== undefined && b.id !== undefined) {
      return a.id === b.id;
    }

    return a.lng === b.lng && a.lat === b.lat && a.nombre === b.nombre;
  }

  private buildFeatureCollection(): FeatureCollection<Point, Record<string, unknown>> {
    const markerFeatures = this.markers
      .map(marker => this.markerToFeature(marker))
      .filter((feature): feature is Feature<Point, Record<string, unknown>> => feature !== null);

    const featureMarkers = this.features
      .map(feature => this.buildMarkerFromFeature(feature))
      .filter((marker): marker is MapMarker => marker !== null)
      .map(marker => this.markerToFeature(marker))
      .filter((feature): feature is Feature<Point, Record<string, unknown>> => feature !== null);

    return {
      type: 'FeatureCollection',
      features: [...markerFeatures, ...featureMarkers]
    };
  }

  private markerToFeature(marker: MapMarker): Feature<Point, Record<string, unknown>> | null {
    if (!this.isLngLatValid(marker.lng, marker.lat)) {
      return null;
    }

    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [marker.lng, marker.lat]
      },
      properties: this.buildPropertiesFromMarker(marker)
    };
  }

  private buildPropertiesFromMarker(marker: MapMarker): Record<string, unknown> {
    const data = (marker.data ?? {}) as Record<string, unknown>;
    return {
      ...data,
      nombre: marker.nombre,
      markerId: marker.id ?? null,
      markerColor: marker.color || this.markerColor,
      markerNombre: marker.nombre
    };
  }

  private collectAllCoordinates(): [number, number][] {
    const coords: [number, number][] = [];
    coords.push(...this.markers.map(m => [m.lng, m.lat] as [number, number]));
    this.features
      .map(feature => this.getFeatureCoordinates(feature))
      .filter((value): value is [number, number] => value !== null)
      .forEach(coord => coords.push(coord));
    return coords;
  }

  private mapFeatureToMarker(feature: maplibregl.MapGeoJSONFeature): MapMarker | null {
    if (feature.geometry.type !== 'Point') {
      return null;
    }

    const [lng, lat] = feature.geometry.coordinates as [number, number];
    if (!this.isLngLatValid(lng, lat)) {
      return null;
    }

    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const nombre =
      this.coerceToString(props['nombre']) ??
      this.coerceToString(props['markerNombre']) ??
      'Punto';

    return {
      id: (props['markerId'] as string | number | undefined) ?? (feature.id as string | number | undefined),
      nombre,
      lng,
      lat,
      color: this.coerceToString(props['markerColor']) ?? this.markerColor,
      data: props
    };
  }

  private buildPopupContent(marker: MapMarker, variant: 'preview' | 'selected' = 'selected'): HTMLElement {
    const container = document.createElement('div');
    container.className = `map-popup map-popup--${variant}`;

    const data = (marker.data ?? {}) as Record<string, unknown>;
    const summaryData = this.getExperienceSummary(marker);
    const especialidad =
      summaryData?.consultorioNombre ??
      this.coerceToString(data['nombre_del']) ??
      this.coerceToString(data['nombre_de_']) ??
      this.coerceToString(data['tipo_de_Pr']) ??
      null;

    const header = document.createElement('div');
    header.className = 'map-popup__header';

    const title = document.createElement('h3');
    title.className = 'map-popup__title';
    title.textContent = marker.nombre;
    header.appendChild(title);

    if (especialidad) {
      const subtitle = document.createElement('span');
      subtitle.className = 'map-popup__subtitle';
      subtitle.textContent = especialidad;
      header.appendChild(subtitle);
    }

    container.appendChild(header);

    const content = document.createElement('div');
    content.className = 'map-popup__content';
    container.appendChild(content);

    const summarySection = this.buildSummarySection(marker, especialidad, data, summaryData);
    if (summarySection) {
      content.appendChild(summarySection);
    }

    const body = document.createElement('div');
    body.className = 'map-popup__body';
    content.appendChild(body);

    const fields: Array<{
      label: string;
      key: string;
      type: 'address' | 'phone' | 'email' | 'type' | 'entity' | 'default';
    }> = [
        { label: 'Dirección', key: 'dirección', type: 'address' },
        { label: 'Teléfono', key: 'telefono', type: 'phone' },
        { label: 'Correo electrónico', key: 'correo_ele', type: 'email' },
        { label: 'Tipo de prestación', key: 'tipo_de_Pr', type: 'type' },
        { label: 'Entidad', key: 'clase_de_P', type: 'entity' }
      ];

    const fieldsToRender = variant === 'preview' ? fields.slice(0, 2) : fields;

    const services = this.getServiceOptions(data, summaryData);
    let servicesInserted = false;

    fieldsToRender.forEach(({ label, key, type }) => {
      const value = this.coerceToString(data[key]);
      if (value) {
        this.appendPopupRow(body, label, value, type);
        if (!servicesInserted && services.length && label === 'Dirección') {
          body.appendChild(this.createServicesRow(services));
          servicesInserted = true;
        }
      }
    });

    if (!servicesInserted && services.length) {
      body.appendChild(this.createServicesRow(services));
    }

    if (summaryData?.experiences?.length) {
      const limit = variant === 'preview' ? 1 : 3;
      const experiencesContainer = document.createElement('div');
      experiencesContainer.className = 'map-popup__experiences';
      summaryData.experiences.slice(0, limit).forEach((experience) => {
        experiencesContainer.appendChild(this.createExperienceEntry(experience));
      });
      if (summaryData.experiences.length > limit) {
        const remaining = summaryData.experiences.length - limit;
        const more = document.createElement('div');
        more.className = 'map-popup__experiences-more';
        more.textContent = `+${remaining} opiniones más`;
        experiencesContainer.appendChild(more);
      }
      body.appendChild(experiencesContainer);
    }

    if (variant === 'selected') {
      const footer = document.createElement('div');
      footer.className = 'map-popup__footer';
      container.appendChild(footer);

      const actionsWrapper = document.createElement('div');
      actionsWrapper.className = 'map-popup__footer-actions';
      footer.appendChild(actionsWrapper);

      if (marker.data?.id !== undefined && marker.data?.id !== null) {
        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'map-popup__edit';
        editButton.textContent = 'Editar consultorio';
        editButton.addEventListener('click', (event) => {
          event.stopPropagation();
          this.editConsultorioRequested.emit(marker);
        });
        actionsWrapper.appendChild(editButton);
      }

      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'map-popup__action';
      action.textContent = 'Agregar experiencia';
      action.addEventListener('click', (event) => {
        event.stopPropagation();
        this.markerClick.emit(marker);
        this.addExperienceRequested.emit(marker);
      });

      actionsWrapper.appendChild(action);
    } else {
      const hint = document.createElement('div');
      hint.className = 'map-popup__hint';
      hint.textContent = 'Haz clic para ver más información';
      content.appendChild(hint);
    }

    return container;
  }

  private buildSummarySection(
    marker: MapMarker,
    especialidad: string | null,
    data: Record<string, unknown>,
    experiences: ExperienceSummary | null
  ): HTMLElement | null {
    const rating = experiences?.ratingAverage ?? this.toNumber(data['calificacion'] ?? data['rating']);
    const reviews = experiences?.ratingCount ?? this.toInteger(data['numero_resenas'] ?? data['resenas'] ?? data['reviews']);
    const category = this.coerceToString(data['categoria']) ?? especialidad;

    if (rating === null && category === null && reviews === null) {
      return null;
    }

    const summaryEl = document.createElement('div');
    summaryEl.className = 'map-popup__summary';

    const ratingLine = document.createElement('div');
    ratingLine.className = 'map-popup__rating-line';
    summaryEl.appendChild(ratingLine);

    const segments: HTMLElement[] = [];

    if (rating !== null) {
      const ratingSpan = document.createElement('span');
      ratingSpan.className = 'map-popup__rating-value';
      ratingSpan.textContent = this.formatDecimal(rating);

      if (reviews !== null) {
        ratingSpan.textContent += ` (${this.formatInteger(reviews)})`;
      }

      segments.push(ratingSpan);
    }

    if (category) {
      const categorySpan = document.createElement('span');
      categorySpan.className = 'map-popup__category';
      categorySpan.textContent = category;
      segments.push(categorySpan);
    }

    if (!segments.length) {
      return null;
    }

    this.appendDotSeparatedSegments(ratingLine, segments);
    return summaryEl;
  }

  private appendPopupRow(
    container: HTMLElement,
    label: string,
    value: string,
    type: 'address' | 'phone' | 'email' | 'type' | 'entity' | 'default' = 'default'
  ): void {
    const row = document.createElement('div');
    row.className = 'map-popup__row';

    const labelEl = document.createElement('span');
    labelEl.className = 'map-popup__label';
    labelEl.textContent = label;
    row.appendChild(labelEl);

    const isLink = type === 'email' || type === 'phone';
    const valueEl = document.createElement(isLink ? 'a' : 'span');
    valueEl.className = 'map-popup__value';
    if (type === 'email') {
      valueEl.classList.add('map-popup__value--email');
    } else if (type === 'phone') {
      valueEl.classList.add('map-popup__value--phone');
    }

    if (type === 'email') {
      const anchor = valueEl as HTMLAnchorElement;
      anchor.href = `mailto:${value}`;
      anchor.textContent = value;
      anchor.addEventListener('click', (event) => event.stopPropagation());
    } else if (type === 'phone') {
      const anchor = valueEl as HTMLAnchorElement;
      anchor.href = `tel:${value.replace(/\s+/g, '')}`;
      anchor.textContent = value;
      anchor.addEventListener('click', (event) => event.stopPropagation());
    } else {
      valueEl.textContent = value;
    }

    row.appendChild(valueEl);
    container.appendChild(row);
  }

  private appendDotSeparatedSegments(container: HTMLElement, segments: HTMLElement[]): void {
    segments.forEach((segment, index) => {
      if (index > 0) {
        const dot = document.createElement('span');
        dot.className = 'map-popup__dot';
        dot.textContent = '·';
        container.appendChild(dot);
      }
      container.appendChild(segment);
    });
  }

  private getServiceOptions(data: Record<string, unknown>, summary?: ExperienceSummary | null): string[] {
    const options = new Set<string>(summary?.services ?? []);

    const rawOptions = this.coerceToString(data['servicios']) ?? this.coerceToString(data['opciones']);
    if (rawOptions) {
      rawOptions
        .split(/[,;·\n]/)
        .map(part => part.trim())
        .filter(Boolean)
        .forEach(option => options.add(option));
    }

    const booleanOptions: Array<[string, string]> = [
      ['consumo_en_el_lugar', 'Consumo en el lugar'],
      ['para_llevar', 'Para llevar'],
      ['entrega_sin_contacto', 'Entrega sin contacto'],
      ['domicilio', 'Entrega a domicilio'],
      ['servicio_24h', 'Servicio 24 horas']
    ];

    booleanOptions.forEach(([key, label]) => {
      if (this.isTruthy(data[key])) {
        options.add(label);
      }
    });

    return Array.from(options);
  }

  private createServicesRow(options: string[]): HTMLElement {
    const servicesRow = document.createElement('div');
    servicesRow.className = 'map-popup__services';
    servicesRow.textContent = options.join(' · ');
    return servicesRow;
  }

  private getExperienceSummary(marker: MapMarker): ExperienceSummary | null {
    const directKey = this.coerceToString(marker.data?.normalizedKey);
    if (directKey) {
      const summary = this.experienceSummaries[directKey];
      if (summary) {
        return summary;
      }
    }

    const key = this.normalizeConsultorioKey(marker.nombre);
    return key ? this.experienceSummaries[key] ?? null : null;
  }

  private normalizeConsultorioKey(value: string | null | undefined): string {
    return (value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '')
      .trim();
  }

  private createExperienceEntry(experience: Experience): HTMLElement {
    const wrapper = document.createElement('article');
    wrapper.className = 'map-popup__experience';

    const header = document.createElement('header');
    header.className = 'map-popup__experience-header';

    const rating = document.createElement('span');
    rating.className = 'map-popup__experience-rating';
    rating.textContent = `★ ${this.formatDecimal(experience.rating, 1)}`;
    header.appendChild(rating);

    const author = document.createElement('span');
    author.className = 'map-popup__experience-author';
    author.textContent = experience.author;
    header.appendChild(author);

    if (experience.created_at) {
      const date = document.createElement('time');
      date.className = 'map-popup__experience-date';
      date.dateTime = experience.created_at;
      date.textContent = new Date(experience.created_at).toLocaleDateString('es-CO', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      header.appendChild(date);
    }

    const comment = document.createElement('p');
    comment.className = 'map-popup__experience-comment';
    comment.textContent = experience.comment;

    wrapper.appendChild(header);
    wrapper.appendChild(comment);
    return wrapper;
  }

  private toNumber(value: unknown): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.replace(/,/g, '.');
      const parsed = Number.parseFloat(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private toInteger(value: unknown): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.round(value);
    }
    if (typeof value === 'string') {
      const numeric = value.replace(/[^0-9-]/g, '');
      if (!numeric) return null;
      const parsed = Number.parseInt(numeric, 10);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private isTruthy(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return ['1', 'true', 'sí', 'si', 'yes'].includes(normalized);
    }
    return false;
  }

  private formatDecimal(value: number, digits: number = 1): string {
    return value.toLocaleString('es-CO', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  private formatInteger(value: number): string {
    return value.toLocaleString('es-CO');
  }

  private buildMarkerFromFeature(feature: Feature<Point | null>): MapMarker | null {
    const coords = this.getFeatureCoordinates(feature);
    if (!coords) return null;

    const [lng, lat] = coords;
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const nombre =
      this.coerceToString(props['nombre']) ??
      this.coerceToString(props['nombre_de_']) ??
      this.coerceToString(props['nombre_del']) ??
      'Punto';

    return {
      id: (props['id'] as string | number | undefined) ?? (feature.id as string | number | undefined),
      nombre,
      lng,
      lat,
      color: this.markerColor,
      data: props
    };
  }

  private getFeatureCoordinates(feature: Feature<Point | null>): [number, number] | null {
    if (feature.geometry?.type !== 'Point') {
      return null;
    }

    const coordinates = feature.geometry.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return null;
    }

    const [rawLng, rawLat] = coordinates;
    if (typeof rawLng !== 'number' || typeof rawLat !== 'number') {
      return null;
    }

    let lng = rawLng;
    let lat = rawLat;

    // Corrige coordenadas invertidas conocidas
    if (!this.isLngLatValid(lng, lat) && this.isLngLatValid(lat, lng)) {
      [lng, lat] = [lat, lng];
      console.warn('Coordenadas intercambiadas detectadas y corregidas:', feature);
    }

    if (!this.isLngLatValid(lng, lat)) {
      console.warn('Coordenadas inválidas descartadas:', feature);
      return null;
    }

    return [lng, lat];
  }

  private isLngLatValid(lng: number, lat: number): boolean {
    return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90;
  }

  private coerceToString(value: unknown): string | null {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
    return null;
  }

}
