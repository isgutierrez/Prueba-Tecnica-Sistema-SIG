import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private apiUrl = 'http://localhost:8000/geojson/';

  constructor(private http: HttpClient) {}

  getGeoData(): Observable<any> {
    return this.http.get(this.apiUrl);
  }
}
