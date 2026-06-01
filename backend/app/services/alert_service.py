import math
from sqlalchemy.orm import Session
from app.repositories.alert_repository import AlertRepository
from app.schemas.alert import AlertRead, AlertListResponse, AlertListMeta
from app.schemas.stats import StatsResponse


def _make_location(lat: float | None, lon: float | None) -> str | None:
    """Formata lat/lon no mesmo padrão que o worker usa ao salvar: 'Lat:X, Lon:Y'"""
    if lat is None or lon is None:
        return None
    return f"Lat:{lat}, Lon:{lon}"


class AlertService:
    def __init__(self, session: Session):
        self.repo = AlertRepository(session)

    def list_alerts(
        self, page: int, size: int, lat: float | None = None, lon: float | None = None
    ) -> AlertListResponse:
        location = _make_location(lat, lon)
        items, total = self.repo.get_paginated(page=page, size=size, location=location)
        pages = math.ceil(total / size) if size > 0 else 0
        return AlertListResponse(
            data=[AlertRead.model_validate(a) for a in items],
            meta=AlertListMeta(total=total, page=page, size=size, pages=pages),
        )

    def get_stats(self, lat: float | None = None, lon: float | None = None) -> StatsResponse:
        location = _make_location(lat, lon)
        last = self.repo.get_last(location=location)
        return StatsResponse(
            total_alerts=self.repo.count_total(location=location),
            critical_alerts=self.repo.count_critical(location=location),
            last_alert=AlertRead.model_validate(last) if last else None,
        )
