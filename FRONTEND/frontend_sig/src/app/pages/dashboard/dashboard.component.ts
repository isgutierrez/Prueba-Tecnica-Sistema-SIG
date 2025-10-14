import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { MapComponent, MapMarker } from '../../components/map/map.component';
import { ExperienceService } from '../../core/services/experience.service';
import { ConsultorioService } from '../../core/services/consultorio.service';
import { Experience, ExperienceSummary } from '../../shared/models/experience.model';
import { Consultorio, ConsultorioFilters } from '../../shared/models/consultorio.model';
import { ExperienceFormComponent, ExperienceFormValue } from '../experience/experience-form.component';
import { ConsultorioFormComponent, ConsultorioFormValue } from '../consultorios/consultorio-form.component';
import { AuthService } from '../../core/services/auth.service';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MapComponent, ExperienceFormComponent, ConsultorioFormComponent],
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit, OnDestroy {
  markers: MapMarker[] = [];
  consultorios: Consultorio[] = [];
  experienceSummaries: Record<string, ExperienceSummary> = {};

  loadingConsultorios = false;
  loadingExperiences = false;
  submittingExperience = false;
  submittingConsultorio = false;

  showExperienceModal = false;
  showConsultorioModal = false;
  isCreateMode = false;

  selectedMarker: MapMarker | null = null;
  experienceSubmissionError: string | null = null;
  consultorioSubmissionError: string | null = null;
  successMessage: string | null = null;

  consultorioFormTitle = 'Nuevo consultorio';
  consultorioInitialValue: Partial<ConsultorioFormValue> | null = null;
  currentConsultorioId: number | null = null;
  pendingCoordinates: { lng: number; lat: number } | null = null;
  tipoPrestadorOptions = [
    { label: 'Privada', value: 'Privada' },
    { label: 'Pública', value: 'Pública' }
  ];

  // ✅ Antes causaba TS2729 — ahora solo se declara
  searchForm!: FormGroup;

  private experiences: Experience[] = [];
  private successTimeoutHandle: any;

  constructor(
    private readonly consultorioService: ConsultorioService,
    private readonly experienceService: ExperienceService,
    private readonly fb: FormBuilder,
    private readonly authService: AuthService
  ) { }

  ngOnInit(): void {
    // ✅ Inicializar el formulario aquí
    this.searchForm = this.fb.group({
      q: [''],
      tipo_prestador: [''],
      localidad: [null],
      upz: [null]
    });

    this.loadConsultorios();
    this.loadExperiences();
  }

  ngOnDestroy(): void {
    if (this.successTimeoutHandle) {
      clearTimeout(this.successTimeoutHandle);
    }
  }

  onSearch(): void {
    const raw = this.searchForm.getRawValue();
    const filters: ConsultorioFilters = {
      q: raw.q ?? '',
      tipo_prestador: raw.tipo_prestador ?? '',
      localidad: this.toFilterNumber(raw.localidad),
      upz: this.toFilterNumber(raw.upz)
    };
    this.loadConsultorios(filters);
  }

  onResetFilters(): void {
    this.searchForm.reset({ q: '', tipo_prestador: '', localidad: null, upz: null });
    this.loadConsultorios();
  }

  toggleCreateMode(): void {
    this.isCreateMode = !this.isCreateMode;
    this.pendingCoordinates = null;
    this.showConsultorioModal = false;
    this.consultorioSubmissionError = null;
    this.consultorioInitialValue = null;
    this.currentConsultorioId = null;
  }

  handleMapClick(coordinates: { lng: number; lat: number } | null): void {
    if (!this.isCreateMode || this.showConsultorioModal) return;

    const lng = coordinates?.lng;
    const lat = coordinates?.lat;
    if (typeof lng !== 'number' || typeof lat !== 'number') return;
    if (!this.isLngLatValid(lng, lat)) return;

    const nearest = this.findNearestConsultorios(lat, lng, 3);
    const suggestedLoc = this.getMostCommonValue(nearest.map(c => c.codigo_loc));
    const suggestedUpz = this.getMostCommonValue(nearest.map(c => c.codigo_upz));

    this.pendingCoordinates = { lng, lat };
    this.openConsultorioModal(
      {
        identifica: '',
        codigo_de: '',
        nombre_de: '',
        direccion: '',
        telefono: '',
        tipo_de_pr: '',
        clase_de_p: '',
        codigo_loc: suggestedLoc ?? null,
        codigo_upz: suggestedUpz ?? null,
        latitud: lat,
        longitud: lng
      },
      'Nuevo consultorio'
    );
  }

  openConsultorioModal(initial: Partial<ConsultorioFormValue>, title: string): void {
    this.consultorioFormTitle = title;
    this.consultorioInitialValue = initial;
    this.consultorioSubmissionError = null;
    this.showConsultorioModal = true;
  }

  openEditConsultorio(marker: MapMarker): void {
    const consultorio = this.consultorios.find((item) => item.id === marker.id);
    if (!consultorio) return;

    const [lng, lat] = consultorio.coordenadas;
    this.pendingCoordinates = null;
    this.currentConsultorioId = consultorio.id;
    this.isCreateMode = false;
    this.openConsultorioModal(
      {
        identifica: consultorio.identifica,
        codigo_de: consultorio.codigo_de,
        nombre_de: consultorio.nombre_de,
        direccion: consultorio.direccion,
        telefono: consultorio.telefono ?? '',
        tipo_de_pr: consultorio.tipo_de_pr ?? '',
        clase_de_p: consultorio.clase_de_p ?? '',
        codigo_loc: consultorio.codigo_loc ?? null,
        codigo_upz: consultorio.codigo_upz ?? null,
        latitud: lat,
        longitud: lng
      },
      'Editar consultorio'
    );
  }

  cancelConsultorioModal(): void {
    this.showConsultorioModal = false;
    this.consultorioInitialValue = null;
    this.consultorioSubmissionError = null;
    this.currentConsultorioId = null;
    if (this.isCreateMode) this.pendingCoordinates = null;
  }

  submitConsultorio(formValue: ConsultorioFormValue): void {
    this.submittingConsultorio = true;
    this.consultorioSubmissionError = null;

    const longitud = this.pendingCoordinates?.lng ?? Number(formValue.longitud ?? NaN);
    const latitud = this.pendingCoordinates?.lat ?? Number(formValue.latitud ?? NaN);

    if (!this.isLngLatValid(longitud, latitud)) {
      this.consultorioSubmissionError =
        'Selecciona una ubicación válida en el mapa antes de guardar.';
      this.submittingConsultorio = false;
      return;
    }

    const payload = {
      identifica: formValue.identifica ?? '',
      codigo_de: formValue.codigo_de ?? '',
      nombre_de: formValue.nombre_de ?? '',
      direccion: formValue.direccion ?? '',
      telefono: formValue.telefono ?? '',
      tipo_de_pr: formValue.tipo_de_pr ?? '',
      clase_de_p: formValue.clase_de_p ?? '',
      codigo_loc: formValue.codigo_loc ?? undefined,
      codigo_upz: formValue.codigo_upz ?? undefined,
      coordenadas: [longitud, latitud] as [number, number],
      longitud,
      latitud
    };

    const request$ = this.currentConsultorioId
      ? this.consultorioService.updateConsultorio(this.currentConsultorioId, payload)
      : this.consultorioService.createConsultorio(payload); // 👈 El backend asigna el ID

    request$.subscribe({
      next: () => {
        this.submittingConsultorio = false;
        this.cancelConsultorioModal();
        this.isCreateMode = false;
        this.showSuccess('¡Consultorio guardado!', 'Los datos se registraron correctamente.');
        this.onSearch();
      },
      error: (err) => {
        console.error('❌ Error al guardar consultorio:', err);
        this.consultorioSubmissionError = this.formatConsultorioError(err);
        this.submittingConsultorio = false;
      }
    });
  }


  openExperienceModal(marker: MapMarker): void {
    this.selectedMarker = marker;
    this.showExperienceModal = true;
    this.experienceSubmissionError = null;
  }

  closeExperienceModal(): void {
    this.showExperienceModal = false;
    this.selectedMarker = null;
    this.experienceSubmissionError = null;
  }

  submitExperience(form: ExperienceFormValue): void {
    if (!this.selectedMarker) return;

    const consultorioId =
      (this.selectedMarker.data?.id as number | string | undefined) ?? this.selectedMarker.id;
    if (consultorioId == null) {
      this.experienceSubmissionError = 'No fue posible identificar el consultorio.';
      return;
    }

    this.submittingExperience = true;
    this.experienceSubmissionError = null;

    this.experienceService
      .createExperience({
        consultorio: consultorioId,
        author: form.author.trim(),
        comment: form.comment.trim(),
        rating: form.rating
      })
      .subscribe({
        next: (experience) => {
          const enriched: Experience = {
            ...experience,
            consultorio_nombre:
              experience.consultorio_nombre ??
              this.selectedMarker?.nombre ??
              experience.consultorio_nombre
          };
          this.experiences = [enriched, ...this.experiences];
          this.updateExperienceSummaries();
          this.submittingExperience = false;
          this.closeExperienceModal();
          this.showSuccess('¡Experiencia enviada!', 'Gracias por compartir tu opinión.');
        },
        error: (err) => {
          console.error('❌ Error al guardar experiencia:', err);
          this.experienceSubmissionError =
            'No se pudo guardar tu experiencia. Inténtalo nuevamente.';
          this.submittingExperience = false;
        }
      });
  }

  private loadConsultorios(filters: ConsultorioFilters = {}): void {
    console.log('🧩 Filtros recibidos:', filters);
    this.loadingConsultorios = true;

    forkJoin({
      consultorios: this.consultorioService.getConsultorios(filters),
      geojson: this.authService.getGeoData()
    }).subscribe({
      next: ({ consultorios, geojson }) => {
        console.log('✅ Consultorios cargados:', consultorios.length);
        console.log('✅ GeoJSON features:', geojson.features?.length ?? geojson.length);

        // Crear un mapa rápido de geometrías por id
        const geoMap = new Map<number, any>();
        const features = geojson.features ?? geojson;
        for (const feature of features) {
          const id = feature.properties?.id ?? feature.id;
          if (id != null) geoMap.set(Number(id), feature.geometry);
        }

        // Combinar consultorios con sus geometrías
        this.consultorios = consultorios.map((c) => ({
          ...c,
          geometry: geoMap.get(c.id) ?? null
        }));

        // Generar marcadores
        this.markers = this.mapConsultoriosToMarkers(this.consultorios);

        console.log('📍 Markers generados:', this.markers.length);
        this.loadingConsultorios = false;
      },
      error: (err) => {
        console.error('❌ Error al cargar consultorios o geojson:', err);
        this.loadingConsultorios = false;
      }
    });
  }

  private loadExperiences(): void {
    this.loadingExperiences = true;
    this.experienceService.getExperiences().subscribe({
      next: (experiences) => {
        this.experiences = experiences.map((exp) => ({
          ...exp,
          consultorio_nombre:
            exp.consultorio_nombre ??
            this.coerceToString(exp.consultorio_nombre) ??
            undefined
        }));
        this.updateExperienceSummaries();
        this.loadingExperiences = false;
      },
      error: (err) => {
        console.error('❌ Error al cargar experiencias:', err);
        this.loadingExperiences = false;
      }
    });
  }

  private mapConsultoriosToMarkers(consultorios: Consultorio[]): MapMarker[] {
    return consultorios
      .map((item) => {
        let lng: number | undefined;
        let lat: number | undefined;

        const geo = (item as any).geometry;
        if (geo && Array.isArray(geo.coordinates)) {
          const [lon, la] = geo.coordinates.map(Number);
          if (this.isLngLatValid(lon, la)) {
            lng = lon;
            lat = la;
          } else if (this.isLngLatValid(la, lon)) {
            // Corrige coordenadas invertidas
            lng = la;
            lat = lon;
            console.warn('⚠️ Coordenadas invertidas detectadas y corregidas', item);
          }
        }

        else if (Array.isArray((item as any).coordenadas)) {
          const [lon, la] = (item as any).coordenadas.map(Number);
          if (this.isLngLatValid(lon, la)) {
            lng = lon;
            lat = la;
          } else if (this.isLngLatValid(la, lon)) {
            lng = la;
            lat = lon;
          }
        }

        else if ('latitud' in item && 'longitud' in item) {
          lng = Number((item as any).longitud);
          lat = Number((item as any).latitud);
        }

        if (lng === undefined || lat === undefined || !this.isLngLatValid(lng, lat)) {
          console.warn('❌ Coordenadas inválidas descartadas:', item);
          return null;
        }

        const nombre = this.coerceToString(item.nombre_de) ?? 'Consultorio';

        return {
          id: item.id,
          nombre,
          lng,
          lat,
          color: '#e11d48',
          data: {
            id: item.id,
            identifica: item.identifica,
            codigo_de: item.codigo_de,
            nombre,
            direccion: item.direccion,
            telefono: item.telefono,
            tipo_de_Pr: item.tipo_de_pr,
            clase_de_P: item.clase_de_p,
            codigo_loc: item.codigo_loc,
            codigo_upz: item.codigo_upz,
            normalizedKey: this.normalizeConsultorioKey(nombre)
          }
        } as MapMarker;
      })
      .filter((marker): marker is MapMarker => marker !== null);
  }

  private updateExperienceSummaries(): void {
    const grouped = new Map<string, ExperienceSummary>();
    this.experiences.forEach((experience) => {
      const consultorioNombre = this.coerceToString(experience.consultorio_nombre) ?? 'Consultorio';
      const key = this.normalizeConsultorioKey(consultorioNombre);
      if (!key) return;

      const entry = grouped.get(key) ?? {
        consultorioNombre,
        ratingAverage: null,
        ratingCount: 0,
        experiences: [],
        services: []
      };

      entry.experiences.push(experience);
      entry.ratingCount += 1;
      grouped.set(key, entry);
    });

    grouped.forEach((summary) => {
      const total = summary.experiences.reduce((acc, exp) => acc + (exp.rating ?? 0), 0);
      summary.ratingAverage = summary.ratingCount ? total / summary.ratingCount : null;
      summary.experiences.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });
    });

    this.experienceSummaries = Object.fromEntries(grouped.entries());
  }

  private showSuccess(title: string, message: string): void {
    if (this.successTimeoutHandle) clearTimeout(this.successTimeoutHandle);
    this.successMessage = `${title}\n${message}`;
    this.successTimeoutHandle = setTimeout(() => (this.successMessage = null), 4000);
  }

  private normalizeConsultorioKey(value: string | null | undefined): string {
    return (value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '')
      .trim();
  }

  private isLngLatValid(lng: number, lat: number): boolean {
    return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90;
  }

  private coerceToString(value: unknown): string | null {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    return null;
  }

  private findNearestConsultorios(lat: number, lng: number, limit = 3): Consultorio[] {
    if (!this.consultorios.length) return [];
    const withDistances = this.consultorios.map((c) => {
      const [clng, clat] = c.coordenadas ?? [0, 0];
      const distance = this.haversine(lat, lng, clat, clng);
      return { ...c, distance };
    });
    return withDistances.sort((a, b) => a.distance - b.distance).slice(0, limit);
  }

  private getMostCommonValue(values: Array<number | null | undefined>): number | null {
    const counts: Record<number, number> = {};
    values.forEach((v) => {
      if (v != null) counts[v] = (counts[v] || 0) + 1;
    });
    const entries = Object.entries(counts);
    if (!entries.length) return null;
    return Number(entries.sort((a, b) => b[1] - a[1])[0][0]);
  }

  // Fórmula de Haversine para calcular distancia entre coordenadas
  private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // radio terrestre en km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
      Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  private toFilterNumber(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') return undefined;
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  }

  private formatConsultorioError(err: unknown): string {
    const fallback =
      'No fue posible guardar el consultorio. Revisa los datos e inténtalo nuevamente.';
    if (!err || typeof err !== 'object') return fallback;
    const httpError = err as { status?: number; error?: any; message?: string };
    const { status, error } = httpError;

    const errorMessages: string[] = [];
    if (error) {
      if (typeof error === 'string') {
        errorMessages.push(error);
      } else if (typeof error === 'object') {
        if (typeof error.detail === 'string') {
          errorMessages.push(error.detail);
        }
        if (Array.isArray(error.errors)) {
          error.errors.forEach((e: any) => {
            if (typeof e === 'string') errorMessages.push(e);
            else if (e && typeof e.message === 'string') errorMessages.push(e.message);
          });
        }
        Object.entries(error).forEach(([key, value]) => {
          if (key === 'detail' || key === 'errors') return;
          if (typeof value === 'string') {
            errorMessages.push(`${key}: ${value}`);
          } else if (Array.isArray(value)) {
            value.forEach((item) => {
              if (typeof item === 'string') {
                errorMessages.push(`${key}: ${item}`);
              } else if (item && typeof item.message === 'string') {
                errorMessages.push(`${key}: ${item.message}`);
              }
            });
          }
        });
      }
    }

    if (!errorMessages.length && typeof httpError.message === 'string') {
      errorMessages.push(httpError.message);
    }

    if (!errorMessages.length && typeof status === 'number') {
      if (status >= 500)
        errorMessages.push('El servidor encontró un problema. Intenta nuevamente más tarde.');
      else if (status === 0)
        errorMessages.push('No se pudo contactar el servidor. Verifica tu conexión o CORS.');
    }

    return errorMessages.length ? errorMessages.join('\n') : fallback;
  }

}
