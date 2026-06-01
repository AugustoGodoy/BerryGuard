import httpx
from app.core.config import settings
from app.core.logging import setup_logging
from app.schemas.weather import WeatherData
from app.services.cache_service import CacheService
from app.services.queue_service import QueueService

logger = setup_logging("berryguard.weather")

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# Limiares para precipitação e luz — Open-Meteo
PRECIP_MAX_MM      = 10.0   # mm — acima: excesso de chuva
SUNSHINE_MIN_HOURS = 4.0    # h  — abaixo: baixa luminosidade


class WeatherService:
    def __init__(self):
        self.cache = CacheService()
        self.queue = QueueService()

    async def get_weather(self, lat: float, lon: float, force: bool = False) -> WeatherData:
        cache_key = CacheService.make_weather_key(lat, lon)
        logger.info(f"[QUERY INITIATED] lat={lat} lon={lon} force={force}")

        # 1. Cache normal (15 min TTL) — ignorado se force=True
        if not force:
            cached = self.cache.get(cache_key)
            if cached:
                cached["from_cache"] = True
                cached["fallback"] = False
                logger.info(f"[QUERY COMPLETED] source=cache lat={lat} lon={lon}")
                return WeatherData(**cached)
        else:
            logger.info(f"[CACHE BYPASS] force=True, ignorando cache lat={lat} lon={lon}")

        # 2. Tentar Open-Meteo
        try:
            data = await self._fetch_from_open_meteo(lat, lon)
            self.cache.set(cache_key, data.model_dump(mode="json"))
            self.cache.set_stale(cache_key, data.model_dump(mode="json"))
            self.queue.publish_climate_event(data.model_dump(mode="json"))
            logger.info(f"[QUERY COMPLETED] source=api lat={lat} lon={lon}")
            return data

        except (httpx.RequestError, httpx.HTTPStatusError) as exc:
            logger.warning(f"[API FAILURE] Open-Meteo indisponível: {exc}")

            # 3. Fallback: cache stale (24h)
            stale = self.cache.get_stale(cache_key)
            if stale:
                stale["from_cache"] = True
                stale["fallback"] = True
                logger.warning(
                    f"[FALLBACK USED] Servindo dados stale do Redis lat={lat} lon={lon}"
                )
                return WeatherData(**stale)

            logger.error(f"[QUERY FAILED] Sem cache disponível para lat={lat} lon={lon}")
            raise

    async def _fetch_from_open_meteo(self, lat: float, lon: float) -> WeatherData:
        params = {
            "latitude": lat,
            "longitude": lon,
            # current: temperatura, umidade, vento, precipitação instantânea
            "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation",
            # daily: duração do sol em segundos no dia (dividir por 3600 para horas)
            "daily": "sunshine_duration",
            "forecast_days": 1,
            "timezone": "auto",
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(OPEN_METEO_URL, params=params)
            response.raise_for_status()
            raw = response.json()

        current = raw["current"]

        # sunshine_duration vem em segundos → converter para horas
        sunshine_seconds = raw.get("daily", {}).get("sunshine_duration", [0])
        sunshine_hours = round(
            (sunshine_seconds[0] if sunshine_seconds else 0) / 3600, 1
        )

        weather = WeatherData(
            temperature=current["temperature_2m"],
            humidity=float(current["relative_humidity_2m"]),
            wind_speed=current["wind_speed_10m"],
            precipitation=float(current.get("precipitation", 0.0)),
            sunshine_hours=sunshine_hours,
            latitude=lat,
            longitude=lon,
            from_cache=False,
            fallback=False,
        )
        logger.info(
            f"[API FETCHED] lat={lat} lon={lon} "
            f"temp={weather.temperature}°C hum={weather.humidity}% "
            f"precip={weather.precipitation}mm sun={weather.sunshine_hours}h"
        )
        return weather
