import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, tap } from 'rxjs';
import { AppConfig, ConfigResponse, ConfigUpdate } from '../models/config.model';

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly http = inject(HttpClient);

  private _config$ = new BehaviorSubject<AppConfig | null>(null);
  /** Stream reativo da configuração atual. Emite sempre que config é carregada ou atualizada. */
  readonly config$ = this._config$.asObservable();

  getConfig(): Observable<ConfigResponse> {
    return this.http.get<ConfigResponse>('/v1/config').pipe(
      tap((res) => this._config$.next(res.data))
    );
  }

  updateConfig(body: ConfigUpdate): Observable<ConfigResponse> {
    return this.http.put<ConfigResponse>('/v1/config', body).pipe(
      tap((res) => this._config$.next(res.data))
    );
  }

  /** Valor síncrono atual da config (pode ser null se ainda não carregada). */
  get currentConfig(): AppConfig | null {
    return this._config$.getValue();
  }
}
