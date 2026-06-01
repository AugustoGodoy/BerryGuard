import httpx
from fastapi import APIRouter, Query, HTTPException
from app.schemas.weather import WeatherResponse
from app.services.weather_service import WeatherService
from app.core.logging import setup_logging

router = APIRouter()
_weather_service = WeatherService()
logger = setup_logging("berryguard.api.weather")


@router.get("", response_model=WeatherResponse, summary="Consulta condições climáticas atuais")
async def get_weather(
    lat: float = Query(default=-23.5505, description="Latitude da localização"),
    lon: float = Query(default=-46.6333, description="Longitude da localização"),
    force: bool = Query(default=False, description="Se true, ignora cache e chama Open-Meteo diretamente"),
):
    """
    Retorna dados climáticos atuais via Open-Meteo.
    Utiliza cache Redis com TTL de 15 minutos.
    Em caso de falha da API, serve dados do cache stale (24h).
    Publica os dados na fila RabbitMQ para análise pelo worker.
    """
    try:
        weather = await _weather_service.get_weather(lat, lon, force=force)
        return WeatherResponse(data=weather)
    except (httpx.HTTPStatusError, httpx.RequestError) as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Open-Meteo indisponível e sem cache de fallback: {str(exc)}",
        )
