import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Experience } from '../../shared/models/experience.model';

interface ExperienceResponse {
  data: Experience[];
}

interface CreateExperienceResponse {
  message: string;
  data: Experience;
}

@Injectable({
  providedIn: 'root'
})
export class ExperienceService {
  private readonly endpoint = 'http://localhost:8000/experiencias/';

  constructor(private readonly http: HttpClient) {}

  getExperiences(): Observable<Experience[]> {
    return this.http.get<ExperienceResponse>(this.endpoint).pipe(
      map((mapResponse) => mapResponse.data)
    );
  }

  createExperience(payload: {
    consultorio: number | string;
    author: string;
    comment: string;
    rating: number;
  }): Observable<Experience> {
    return this.http.post<CreateExperienceResponse>(this.endpoint, payload).pipe(
      map((response) => response.data)
    );
  }
}
