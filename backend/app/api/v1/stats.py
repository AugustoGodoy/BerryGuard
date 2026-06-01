from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.services.alert_service import AlertService
from app.schemas.stats import StatsResponse

router = APIRouter()


@router.get("", response_model=StatsResponse, summary="Estatísticas gerais de alertas")
def get_stats(
    lat: float | None = Query(default=None, description="Filtrar por latitude da cidade"),
    lon: float | None = Query(default=None, description="Filtrar por longitude da cidade"),
    db: Session = Depends(get_db),
):
    """
    Retorna total_alerts, critical_alerts e last_alert.
    Quando lat/lon são informados, filtra pela cidade correspondente.
    """
    return AlertService(db).get_stats(lat=lat, lon=lon)
