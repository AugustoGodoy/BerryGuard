import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Subscription, catchError, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

import { ConfigService } from '../../services/config.service';
import { GeocodingService, GeoCity } from '../../services/geocoding.service';
import { AppConfig } from '../../models/config.model';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatAutocompleteModule,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit, OnDestroy {
  private configService    = inject(ConfigService);
  private geocodingService = inject(GeocodingService);
  private http             = inject(HttpClient);
  private fb               = inject(FormBuilder);
  private snackBar         = inject(MatSnackBar);

  loading       = signal(true);
  saving        = signal(false);
  currentConfig = signal<AppConfig | null>(null);
  citySuggestions = signal<GeoCity[]>([]);
  searchingCity   = signal(false);

  form: FormGroup = this.fb.group({
    min_temperature: [2.0,            [Validators.required, Validators.min(-20), Validators.max(30)]],
    max_humidity:    [90.0,           [Validators.required, Validators.min(0),   Validators.max(100)]],
    latitude:        [-23.5505,       [Validators.required, Validators.min(-90), Validators.max(90)]],
    longitude:       [-46.6333,       [Validators.required, Validators.min(-180), Validators.max(180)]],
    location_name:   ['São Paulo, SP', [Validators.required, Validators.maxLength(200)]],
  });

  private subs = new Subscription();

  ngOnInit(): void {
    this.configService.getConfig().subscribe({
      next: (res) => {
        this.currentConfig.set(res.data);
        this.form.patchValue(res.data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    this.subs.add(
      this.form.get('location_name')!.valueChanges.pipe(
        debounceTime(350),
        distinctUntilChanged(),
        switchMap((query: string) => {
          if (!query || query.length < 2) {
            this.citySuggestions.set([]);
            return [];
          }
          this.searchingCity.set(true);
          return this.geocodingService.search(query);
        })
      ).subscribe({
        next: (cities) => {
          this.citySuggestions.set(cities);
          this.searchingCity.set(false);
        },
        error: () => this.searchingCity.set(false),
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  onCitySelected(event: MatAutocompleteSelectedEvent): void {
    const city: GeoCity = event.option.value;
    this.form.patchValue({
      location_name: city.display,
      latitude:      city.latitude,
      longitude:     city.longitude,
    });
    this.citySuggestions.set([]);
  }

  displayCity(city: GeoCity | string): string {
    if (typeof city === 'string') return city;
    return city?.display ?? '';
  }

  onSubmit(): void {
    if (this.form.invalid) return;

    const prev = this.currentConfig();
    const newLat = this.form.value.latitude;
    const newLon = this.form.value.longitude;
    const cityChanged = prev
      ? (prev.latitude !== newLat || prev.longitude !== newLon)
      : false;

    this.saving.set(true);

    // Se a cidade mudou, invalida o cache da cidade anterior antes de salvar
    const invalidate$ = (cityChanged && prev)
      ? this.http.delete('/v1/cache', {
          params: new HttpParams()
            .set('lat', prev.latitude.toString())
            .set('lon', prev.longitude.toString()),
        }).pipe(catchError(() => of(null)))
      : of(null);

    invalidate$.subscribe(() => {
      this.configService.updateConfig(this.form.value).subscribe({
        next: (res) => {
          this.currentConfig.set(res.data);
          this.saving.set(false);
          const msg = cityChanged
            ? '✅ Cidade atualizada! Dados recarregando...'
            : '✅ Configurações salvas com sucesso!';
          this.snackBar.open(msg, 'Fechar', { duration: 3500 });
        },
        error: () => {
          this.saving.set(false);
          this.snackBar.open('❌ Erro ao salvar configurações.', 'Fechar', { duration: 4000 });
        },
      });
    });
  }

  onReset(): void {
    if (this.currentConfig()) {
      this.form.patchValue(this.currentConfig()!);
    }
  }
}
