import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';

import { AlertService } from '../../services/alert.service';
import { ConfigService } from '../../services/config.service';
import { Alert, AlertMeta } from '../../models/alert.model';
import { AppConfig } from '../../models/config.model';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatTableModule,
    MatPaginatorModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatButtonModule,
  ],
  templateUrl: './history.component.html',
  styleUrl: './history.component.scss',
})
export class HistoryComponent implements OnInit {
  private alertService  = inject(AlertService);
  private configService = inject(ConfigService);

  alerts  = signal<Alert[]>([]);
  meta    = signal<AlertMeta | null>(null);
  config  = signal<AppConfig | null>(null);
  loading = signal(true);

  displayedColumns = ['severity', 'type', 'timestamp', 'temperature', 'humidity', 'message'];

  currentPage = 0;
  pageSize    = 20;

  ngOnInit(): void {
    // Carrega config (ou reutiliza a do BehaviorSubject se já carregada)
    const cached = this.configService.currentConfig;
    if (cached) {
      this.config.set(cached);
      this.loadAlerts();
    } else {
      this.configService.getConfig().subscribe({
        next: (res) => {
          this.config.set(res.data);
          this.loadAlerts();
        },
        error: () => this.loadAlerts(), // sem filtro em caso de erro
      });
    }
  }

  loadAlerts(page = 0, size = 20): void {
    this.loading.set(true);
    const cfg = this.config();
    this.alertService.getAlerts(page, size, cfg?.latitude, cfg?.longitude).subscribe({
      next: (res) => {
        this.alerts.set(res.data);
        this.meta.set(res.meta);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onPageChange(event: PageEvent): void {
    this.currentPage = event.pageIndex;
    this.pageSize    = event.pageSize;
    this.loadAlerts(event.pageIndex, event.pageSize);
  }

  severityClass(severity: string): string {
    return `chip-${severity.toLowerCase()}`;
  }

  formatDate(iso: string): string {
    const normalized = iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z';
    return new Date(normalized).toLocaleString('pt-BR');
  }
}
