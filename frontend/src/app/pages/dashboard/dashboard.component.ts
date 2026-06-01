import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ViewChild,
  ElementRef,
  signal,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { filter, distinctUntilChanged } from 'rxjs/operators';
import { Chart, registerables } from 'chart.js';

import { WeatherService } from '../../services/weather.service';
import { AlertService } from '../../services/alert.service';
import { ConfigService } from '../../services/config.service';
import { RecommendationService, Recommendation } from '../../services/recommendation.service';
import { WeatherData } from '../../models/weather.model';
import { Alert, StatsResponse } from '../../models/alert.model';
import { AppConfig } from '../../models/config.model';

Chart.register(...registerables);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  // Canvas SEMPRE no DOM — nunca dentro de @if/@else
  @ViewChild('tempChart')     tempChartRef!:     ElementRef<HTMLCanvasElement>;
  @ViewChild('humChart')      humChartRef!:      ElementRef<HTMLCanvasElement>;
  @ViewChild('distChart')     distChartRef!:     ElementRef<HTMLCanvasElement>;
  @ViewChild('timelineChart') timelineChartRef!: ElementRef<HTMLCanvasElement>;

  private weatherService        = inject(WeatherService);
  private alertService          = inject(AlertService);
  private configService         = inject(ConfigService);
  private recommendationService = inject(RecommendationService);
  private snackBar              = inject(MatSnackBar);

  weather         = signal<WeatherData | null>(null);
  stats           = signal<StatsResponse | null>(null);
  recentAlerts    = signal<Alert[]>([]);
  config          = signal<AppConfig | null>(null);
  loading         = signal(true);
  error           = signal<string | null>(null);
  hasChartData    = signal(false);
  recommendations = signal<Recommendation[]>([]);
  riskScore       = signal<number>(0);

  private tempHistory: number[] = [];
  private humHistory:  number[] = [];
  private timeLabels:  string[] = [];
  private tempChart:     Chart | null = null;
  private humChart:      Chart | null = null;
  private distChart:     Chart | null = null;
  private timelineChart: Chart | null = null;
  private subs        = new Subscription();
  private refreshSub: Subscription | null = null;
  private weatherSub: Subscription | null = null;
  private chartsReady = false;

  // ── Limiares agronômicos (morango) ─────────────────────────────────────────
  private readonly TEMP_IDEAL_MIN = 15;
  private readonly TEMP_IDEAL_MAX = 28;
  private readonly TEMP_GEADA_MIN = 10;
  private readonly TEMP_CONGEL    = 0;
  private readonly TEMP_CALOR_MAX = 30;
  private readonly HUM_IDEAL_MIN  = 60;
  private readonly HUM_IDEAL_MAX  = 80;
  private readonly WIND_MAX       = 25;

  riskLevel = computed(() => {
    const w = this.weather();
    if (!w) return 'safe';
    const t = w.temperature;
    const h = w.humidity;
    if (t <= this.TEMP_CONGEL)         return 'critical';
    if (t < this.TEMP_GEADA_MIN)       return 'danger';
    if (t > this.TEMP_CALOR_MAX)       return 'danger';
    if (t < this.TEMP_IDEAL_MIN)       return 'warning';
    if (h > this.HUM_IDEAL_MAX)        return h >= 95 ? 'critical' : 'warning';
    if (h < this.HUM_IDEAL_MIN)        return 'warning';
    if (w.wind_speed > this.WIND_MAX)  return 'warning';
    if ((w.precipitation ?? 0) > 10)   return 'warning';
    return 'safe';
  });

  riskLabel = computed(() =>
    ({
      safe:     { text: 'SEGURO',  icon: 'check_circle', css: 'risk-safe'     },
      warning:  { text: 'ATENÇÃO', icon: 'warning',      css: 'risk-warning'  },
      danger:   { text: 'PERIGO',  icon: 'dangerous',    css: 'risk-danger'   },
      critical: { text: 'CRÍTICO', icon: 'crisis_alert', css: 'risk-critical' },
    })[this.riskLevel()]
  );

  riskScoreInfo = computed(() =>
    this.recommendationService.riskScoreLabel(this.riskScore())
  );

  riskReason = computed(() => {
    const w = this.weather();
    if (!w || this.riskLevel() === 'safe') return null;
    const t = w.temperature;
    const h = w.humidity;
    const wind = w.wind_speed;
    if (t <= this.TEMP_CONGEL)
      return `Temperatura ${t.toFixed(1)}°C — congelamento crítico (≤ 0°C)`;
    if (t < this.TEMP_GEADA_MIN)
      return `Temperatura ${t.toFixed(1)}°C — faixa de risco de geada (0°C a 10°C)`;
    if (t > this.TEMP_CALOR_MAX)
      return `Temperatura ${t.toFixed(1)}°C acima do limite (30°C)`;
    if (t < this.TEMP_IDEAL_MIN)
      return `Temperatura ${t.toFixed(1)}°C abaixo do ideal (15°C)`;
    if (h > this.HUM_IDEAL_MAX)
      return `Umidade ${h.toFixed(0)}% acima do limite ideal (80%)`;
    if (h < this.HUM_IDEAL_MIN)
      return `Umidade ${h.toFixed(0)}% abaixo do limite ideal (60%)`;
    if (wind > this.WIND_MAX)
      return `Vento ${wind.toFixed(1)} km/h acima do limite seguro (25 km/h)`;
    return null;
  });

  /** Retorna true se a condição que disparou o alerta já está normalizada no clima atual */
  isAlertResolved(alert: Alert): boolean {
    const w = this.weather();
    if (!w) return false;
    switch (alert.type) {
      case 'GEADA_CRITICA':
      case 'GEADA':
        return w.temperature >= this.TEMP_GEADA_MIN;
      case 'TEMPERATURA_BAIXA':
        return w.temperature >= this.TEMP_IDEAL_MIN;
      case 'CALOR_EXCESSIVO':
        return w.temperature <= this.TEMP_CALOR_MAX;
      case 'UMIDADE_ELEVADA':
        return w.humidity <= this.HUM_IDEAL_MAX;
      case 'UMIDADE_BAIXA':
        return w.humidity >= this.HUM_IDEAL_MIN;
      case 'VENTO_FORTE':
        return w.wind_speed <= this.WIND_MAX;
      default:
        return false;
    }
  }

  ngOnInit(): void {
    this.subs.add(this.configService.getConfig().subscribe());

    // Reage à troca de cidade: reset completo + recarrega com force=true
    this.subs.add(
      this.configService.config$.pipe(
        filter(Boolean),
        distinctUntilChanged(
          (a, b) => a.latitude === b.latitude && a.longitude === b.longitude
        )
      ).subscribe((cfg) => {
        this.config.set(cfg);
        this.resetDashboardState();
        this.doLoadWeather(true);
        this.loadAllAlerts();
      })
    );

    // Auto-refresh a cada 60s via cache Redis (sem forçar API)
    this.refreshSub = interval(60_000).subscribe(() => this.doLoadWeather(false));
  }

  ngAfterViewInit(): void {
    this.initCharts();
    this.chartsReady = true;
    this.loadAllAlerts();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.refreshSub?.unsubscribe();
    this.weatherSub?.unsubscribe();
    [this.tempChart, this.humChart, this.distChart, this.timelineChart]
      .forEach((c) => c?.destroy());
  }

  // ─── Botão "Atualizar Dados" ──────────────────────────────────────────────
  // Sempre força a chamada ao Open-Meteo.
  // Se a API responder → atualiza com dados em tempo real.
  // Se não responder → backend usa cache stale e retorna fallback=true → snackbar de aviso.
  // Botão fica desabilitado apenas enquanto a requisição está em andamento.
  onManualRefresh(): void {
    if (this.loading()) return;
    this.doLoadWeather(true);
  }

  // ─── Reset ao trocar de cidade ────────────────────────────────────────────
  private resetDashboardState(): void {
    this.weather.set(null);
    this.stats.set(null);
    this.recentAlerts.set([]);
    this.recommendations.set([]);
    this.hasChartData.set(false);
    this.error.set(null);
    this.riskScore.set(0);

    this.tempHistory = [];
    this.humHistory  = [];
    this.timeLabels  = [];

    if (this.chartsReady) {
      [this.tempChart, this.humChart, this.distChart, this.timelineChart].forEach((c) => {
        if (c) {
          c.data.labels = [];
          c.data.datasets.forEach((d) => (d.data = []));
          c.update('none');
        }
      });
    }
  }

  // ─── Carga de clima ───────────────────────────────────────────────────────
  private doLoadWeather(force: boolean): void {
    const cfg = this.config();
    const lat  = cfg?.latitude  ?? -23.5505;
    const lon  = cfg?.longitude ?? -46.6333;

    this.loading.set(true);
    this.error.set(null);

    // Cancela chamada anterior para evitar race condition e duplicação de pontos no gráfico
    this.weatherSub?.unsubscribe();
    this.weatherSub = this.weatherService.getWeather(lat, lon, force).subscribe({
      next: (res) => {
        const w = res.data;
        this.weather.set(w);
        this.loading.set(false);
        this.appendLiveData(w);
        this.updateRecommendations(w);

        if (w.fallback) {
          this.snackBar.open(
            '⚠️ Open-Meteo não está respondendo. Exibindo dados armazenados em cache.',
            'Fechar',
            { duration: 6000 }
          );
        }
      },
      error: () => {
        this.error.set('Não foi possível obter dados climáticos. Tente novamente mais tarde.');
        this.loading.set(false);
      },
    });

    this.loadStats();
    this.loadRecentAlerts();
  }

  private loadRecentAlerts(): void {
    const cfg = this.config();
    this.subs.add(
      this.alertService.getAlerts(0, 5, cfg?.latitude, cfg?.longitude).subscribe({
        next: (res) => this.recentAlerts.set(res.data),
      })
    );
  }

  private loadAllAlerts(): void {
    const cfg = this.config();
    this.subs.add(
      this.alertService.getAlerts(0, 100, cfg?.latitude, cfg?.longitude).subscribe({
        next: (res) => {
          if (this.chartsReady) {
            this.updateDistributionChart(res.data);
            this.updateTimelineChart(res.data);
          }
        },
      })
    );
  }

  private loadStats(): void {
    const cfg = this.config();
    this.subs.add(
      this.alertService.getStats(cfg?.latitude, cfg?.longitude).subscribe({
        next: (res) => this.stats.set(res),
      })
    );
  }

  private updateRecommendations(w: WeatherData): void {
    const cfg = this.config();
    if (cfg) this.recommendations.set(this.recommendationService.generate(w, cfg));
    this.riskScore.set(this.recommendationService.calcRiskScore(w));
  }

  // ─── Charts ───────────────────────────────────────────────────────────────
  private initCharts(): void {
    const axisOpts = {
      x: { ticks: { color: '#aaa', maxTicksLimit: 6 }, grid: { color: 'rgba(255,255,255,0.05)' } },
      y: { ticks: { color: '#aaa' },                   grid: { color: 'rgba(255,255,255,0.05)' } },
    };
    const lineOpts = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: axisOpts,
    };

    this.tempChart = new Chart(this.tempChartRef.nativeElement, {
      type: 'line',
      data: { labels: [], datasets: [{ label: 'Temp (°C)', data: [], borderColor: '#ef5350', backgroundColor: 'rgba(239,83,80,0.15)', fill: true, tension: 0.4, pointRadius: 3 }] },
      options: lineOpts as any,
    });

    this.humChart = new Chart(this.humChartRef.nativeElement, {
      type: 'line',
      data: { labels: [], datasets: [{ label: 'Umidade (%)', data: [], borderColor: '#42a5f5', backgroundColor: 'rgba(66,165,245,0.15)', fill: true, tension: 0.4, pointRadius: 3 }] },
      options: lineOpts as any,
    });

    this.distChart = new Chart(this.distChartRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels: [
          'Geada Crítica', 'Geada', 'Temp. Baixa',
          'Calor Excessivo', 'Umidade Elevada', 'Umidade Baixa',
          'Vento Forte', 'Excesso de Chuva', 'Baixa Luminosidade', 'Obs. Frio',
        ],
        datasets: [{
          data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          backgroundColor: [
            '#ef5350', '#ff7043', '#ffa726',
            '#ffca28', '#ab47bc', '#42a5f5',
            '#26c6da', '#66bb6a', '#8d6e63', '#78909c',
          ],
          borderColor: 'rgba(255,255,255,0.08)',
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'bottom', labels: { color: '#ccc', padding: 10, font: { size: 10 } } } },
      } as any,
    });

    this.timelineChart = new Chart(this.timelineChartRef.nativeElement, {
      type: 'bar',
      data: { labels: [], datasets: [{ label: 'Alertas', data: [], backgroundColor: 'rgba(171,71,188,0.6)', borderColor: '#ab47bc', borderWidth: 1, borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: axisOpts } as any,
    });
  }

  private appendLiveData(w: WeatherData): void {
    const label = this.formatTimeLabel(new Date().toISOString());
    const MAX = 15;
    this.tempHistory.push(w.temperature);
    this.humHistory.push(w.humidity);
    this.timeLabels.push(label);
    if (this.tempHistory.length > MAX) this.tempHistory.shift();
    if (this.humHistory.length > MAX)  this.humHistory.shift();
    if (this.timeLabels.length > MAX)  this.timeLabels.shift();
    this.refreshLineCharts();
    this.hasChartData.set(true);
  }

  private refreshLineCharts(): void {
    if (!this.chartsReady) return;
    if (this.tempChart) {
      this.tempChart.data.labels             = [...this.timeLabels];
      this.tempChart.data.datasets[0].data   = [...this.tempHistory];
      this.tempChart.update(); // com recálculo de escala
    }
    if (this.humChart) {
      this.humChart.data.labels            = [...this.timeLabels];
      this.humChart.data.datasets[0].data  = [...this.humHistory];
      this.humChart.update();
    }
  }

  private updateDistributionChart(alerts: Alert[]): void {
    if (!this.distChart) return;
    const counts: Record<string, number> = {
      GEADA_CRITICA:       0,
      GEADA:               0,
      TEMPERATURA_BAIXA:   0,
      CALOR_EXCESSIVO:     0,
      UMIDADE_ELEVADA:     0,
      UMIDADE_BAIXA:       0,
      VENTO_FORTE:         0,
      EXCESSO_CHUVA:       0,
      BAIXA_LUMINOSIDADE:  0,
      OBS_FRIO:            0,
    };
    alerts.forEach((a) => { if (a.type in counts) counts[a.type]++; });
    this.distChart.data.datasets[0].data = [
      counts['GEADA_CRITICA'],
      counts['GEADA'],
      counts['TEMPERATURA_BAIXA'],
      counts['CALOR_EXCESSIVO'],
      counts['UMIDADE_ELEVADA'],
      counts['UMIDADE_BAIXA'],
      counts['VENTO_FORTE'],
      counts['EXCESSO_CHUVA'],
      counts['BAIXA_LUMINOSIDADE'],
      counts['OBS_FRIO'],
    ];
    this.distChart.update();
  }

  private updateTimelineChart(alerts: Alert[]): void {
    if (!this.timelineChart) return;
    const last7: Record<string, number> = {};
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      last7[d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })] = 0;
    }
    alerts.forEach((a) => {
      const key = new Date(a.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      if (key in last7) last7[key]++;
    });
    this.timelineChart.data.labels = Object.keys(last7);
    this.timelineChart.data.datasets[0].data = Object.values(last7);
    this.timelineChart.update();
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  private formatTimeLabel(iso: string): string {
    const normalized = iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z';
    return new Date(normalized).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  severityClass(severity: string): string { return `chip-${severity.toLowerCase()}`; }

  /**
   * Converte timestamp UTC (com ou sem sufixo Z) para horário local.
   * O backend serializa datetime.utcnow() sem 'Z', então adicionamos para
   * que o JS saiba que é UTC e converta corretamente para o fuso local.
   */
  formatDate(iso: string): string {
    const normalized = iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z';
    return new Date(normalized).toLocaleString('pt-BR');
  }

  recClass(priority: string): string { return `rec-${priority}`; }
}
