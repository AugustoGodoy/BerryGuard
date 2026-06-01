export interface WeatherData {
  temperature: number;
  humidity: number;
  wind_speed: number;
  precipitation: number;    // mm
  sunshine_hours: number;   // h
  latitude: number;
  longitude: number;
  from_cache: boolean;
  fallback: boolean;
  timestamp: string;
}

export interface WeatherResponse {
  data: WeatherData;
}
