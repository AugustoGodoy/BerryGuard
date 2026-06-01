import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { WeatherResponse } from '../models/weather.model';

@Injectable({ providedIn: 'root' })
export class WeatherService {
  private readonly http = inject(HttpClient);

  getWeather(lat: number, lon: number, force = false): Observable<WeatherResponse> {
    let params = new HttpParams()
      .set('lat', lat.toString())
      .set('lon', lon.toString());
    if (force) params = params.set('force', 'true');
    return this.http.get<WeatherResponse>('/v1/weather', { params });
  }
}
