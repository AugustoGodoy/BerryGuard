import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AlertListResponse, StatsResponse } from '../models/alert.model';

@Injectable({ providedIn: 'root' })
export class AlertService {
  private readonly http = inject(HttpClient);

  getAlerts(page = 0, size = 20, lat?: number, lon?: number): Observable<AlertListResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());
    if (lat !== undefined) params = params.set('lat', lat.toString());
    if (lon !== undefined) params = params.set('lon', lon.toString());
    return this.http.get<AlertListResponse>('/v1/alerts', { params });
  }

  getStats(lat?: number, lon?: number): Observable<StatsResponse> {
    let params = new HttpParams();
    if (lat !== undefined) params = params.set('lat', lat.toString());
    if (lon !== undefined) params = params.set('lon', lon.toString());
    return this.http.get<StatsResponse>('/v1/stats', { params });
  }
}
