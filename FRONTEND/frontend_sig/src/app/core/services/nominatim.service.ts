import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface NominatimResponse {
  lat: string;
  lon: string;
  display_name: string;
}

@Injectable({
  providedIn: 'root'
})

// Permite convertir direcciones en coordenadas (geocodificación directa) y coordenadas en direcciones (geocodificación inversa).
// es un servicio libre y robusto basado en OpenStreetMap
export class NominatimService {
  private baseUrl = 'https://nominatim.openstreetmap.org';

  constructor(private http: HttpClient) {}

  searchAddress(query: string): Observable<NominatimResponse[]> {
    const params = new HttpParams()
      .set('q', query)
      .set('format', 'json')
      .set('addressdetails', '1')
      .set('limit', '5');
    return this.http.get<NominatimResponse[]>(`${this.baseUrl}/search`, { params });
  }

  reverseGeocode(lat: number, lon: number): Observable<NominatimResponse> {
    const params = new HttpParams()
      .set('lat', lat.toString())
      .set('lon', lon.toString())
      .set('format', 'json');
    return this.http.get<NominatimResponse>(`${this.baseUrl}/reverse`, { params });
  }
}