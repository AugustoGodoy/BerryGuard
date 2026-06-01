export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AlertType =
  | 'GEADA'
  | 'GEADA_CRITICA'
  | 'CONGELAMENTO'
  | 'TEMPERATURA_BAIXA'
  | 'CALOR_EXCESSIVO'
  | 'OBS_FRIO'
  | 'UMIDADE_EXCESSIVA'
  | 'UMIDADE_ELEVADA'
  | 'UMIDADE_BAIXA'
  | 'VENTO_FORTE'
  | 'EXCESSO_CHUVA'
  | 'BAIXA_LUMINOSIDADE';

export interface Alert {
  id: number;
  timestamp: string;
  type: AlertType;
  severity: AlertSeverity;
  temperature: number | null;
  humidity: number | null;
  wind_speed: number | null;
  location: string | null;
  message: string;
}

export interface AlertMeta {
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface AlertListResponse {
  data: Alert[];
  meta: AlertMeta;
}

export interface StatsResponse {
  total_alerts: number;
  critical_alerts: number;
  last_alert: Alert | null;
}
