from pydantic import BaseModel, Field
from datetime import datetime, timezone


class WeatherData(BaseModel):
    temperature: float
    humidity: float
    wind_speed: float
    precipitation: float = 0.0
    sunshine_hours: float = 0.0
    latitude: float
    longitude: float
    from_cache: bool = False
    fallback: bool = False
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WeatherResponse(BaseModel):
    data: WeatherData
