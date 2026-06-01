import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, map, catchError } from 'rxjs/operators';
import { Subject } from 'rxjs';

export interface GeoCity {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1?: string;
  display: string;
}

@Injectable({ providedIn: 'root' })
export class GeocodingService {
  private readonly http = inject(HttpClient);
  private readonly API = 'https://geocoding-api.open-meteo.com/v1/search';

  search(query: string): Observable<GeoCity[]> {
    if (!query || query.trim().length < 2) {
      return of([]);
    }

    const params = new HttpParams()
      .set('name', query.trim())
      .set('count', '6')
      .set('language', 'pt')
      .set('format', 'json');

    return this.http.get<{ results?: any[] }>(this.API, { params }).pipe(
      map((res) =>
        (res.results ?? []).map((r) => ({
          name: r.name,
          latitude: r.latitude,
          longitude: r.longitude,
          country: r.country_code ?? r.country ?? '',
          admin1: r.admin1 ?? '',
          display: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
        }))
      ),
      catchError(() => of([]))
    );
  }
}
