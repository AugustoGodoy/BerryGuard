from fastapi import APIRouter, Query
from app.services.cache_service import CacheService
from app.core.logging import setup_logging

router = APIRouter()
logger = setup_logging("berryguard.api.cache")
_cache = CacheService()


@router.delete("", summary="Invalida cache climático de uma localização")
def invalidate_cache(
    lat: float = Query(..., description="Latitude da localização"),
    lon: float = Query(..., description="Longitude da localização"),
):
    """
    Remove as entradas de cache (normal e stale) para as coordenadas informadas.
    Deve ser chamado ao trocar de cidade nas configurações.
    """
    key = CacheService.make_weather_key(lat, lon)
    _cache.delete(key)
    logger.info(f"[CACHE INVALIDATED] lat={lat} lon={lon} key={key}")
    return {"message": f"Cache invalidado para lat={lat} lon={lon}"}
