from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.services.alert_service import AlertService
from app.schemas.alert import AlertListResponse

router = APIRouter()


@router.get("", response_model=AlertListResponse, summary="Lista histórico de alertas paginado")
def list_alerts(
    page: int = Query(default=0, ge=0, description="Número da página (base 0)"),
    size: int = Query(default=20, ge=1, le=100, description="Itens por página"),
    lat: float | None = Query(default=None, description="Filtrar por latitude da cidade"),
    lon: float | None = Query(default=None, description="Filtrar por longitude da cidade"),
    db: Session = Depends(get_db),
):
    """
    Retorna alertas paginados. Quando lat/lon são informados, filtra pela cidade correspondente.
    """
    service = AlertService(db)
    return service.list_alerts(page=page, size=size, lat=lat, lon=lon)
