export interface AppConfig {
  id: number;
  min_temperature: number;
  max_humidity: number;
  latitude: number;
  longitude: number;
  location_name: string;
}

export interface ConfigResponse {
  data: AppConfig;
}

export interface ConfigUpdate {
  min_temperature?: number;
  max_humidity?: number;
  latitude?: number;
  longitude?: number;
  location_name?: string;
}
