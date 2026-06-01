from pydantic import BaseModel
from app.schemas.alert import AlertRead


class StatsResponse(BaseModel):
    total_alerts: int
    critical_alerts: int
    last_alert: AlertRead | None
