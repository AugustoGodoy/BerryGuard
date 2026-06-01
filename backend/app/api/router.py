from fastapi import APIRouter
from app.api.v1 import weather, alerts, config, stats, cache

api_router = APIRouter(prefix="/v1")

api_router.include_router(weather.router, prefix="/weather", tags=["Weather"])
api_router.include_router(alerts.router, prefix="/alerts", tags=["Alerts"])
api_router.include_router(config.router, prefix="/config", tags=["Config"])
api_router.include_router(stats.router, prefix="/stats", tags=["Stats"])
api_router.include_router(cache.router, prefix="/cache", tags=["Cache"])
