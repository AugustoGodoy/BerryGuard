import math
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from app.models.alert import Alert


class AlertRepository:
    def __init__(self, session: Session):
        self.session = session

    def create(self, alert: Alert) -> Alert:
        self.session.add(alert)
        self.session.commit()
        self.session.refresh(alert)
        return alert

    def _base_query(self, location: str | None = None):
        q = self.session.query(Alert)
        if location:
            q = q.filter(Alert.location == location)
        return q

    def get_paginated(
        self, page: int = 0, size: int = 20, location: str | None = None
    ) -> tuple[list[Alert], int]:
        q = self._base_query(location)
        total = q.with_entities(func.count(Alert.id)).scalar() or 0
        items = q.order_by(desc(Alert.timestamp)).offset(page * size).limit(size).all()
        return items, total

    def count_total(self, location: str | None = None) -> int:
        return self._base_query(location).with_entities(func.count(Alert.id)).scalar() or 0

    def count_critical(self, location: str | None = None) -> int:
        return (
            self._base_query(location)
            .filter(Alert.severity == "CRITICAL")
            .with_entities(func.count(Alert.id))
            .scalar()
            or 0
        )

    def get_last(self, location: str | None = None) -> Alert | None:
        return self._base_query(location).order_by(desc(Alert.timestamp)).first()
