import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  Consultorio,
  ConsultorioDetailResponse,
  ConsultorioFilters,
  ConsultorioPayload,
  ConsultorioResponse
} from '../../shared/models/consultorio.model';

@Injectable({
  providedIn: 'root'
})
export class ConsultorioService {
  private readonly endpoint = 'http://localhost:8000/consultorios/';

  constructor(private readonly http: HttpClient) {}

  getConsultorios(filters: ConsultorioFilters = {}): Observable<Consultorio[]> {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });
    return this.http.get<ConsultorioResponse>(this.endpoint, { params }).pipe(map(response => response.data));
  }

  createConsultorio(payload: ConsultorioPayload): Observable<Consultorio> {
    return this.http.post<ConsultorioDetailResponse>(this.endpoint, payload).pipe(map(response => response.data));
  }

  updateConsultorio(id: number, payload: Partial<ConsultorioPayload>): Observable<Consultorio> {
    return this.http
      .patch<ConsultorioDetailResponse>(`${this.endpoint}${id}/`, payload)
      .pipe(map(response => response.data));
  }
}
