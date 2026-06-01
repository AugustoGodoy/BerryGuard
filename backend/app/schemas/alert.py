from pydantic import BaseModel
from datetime import datetime


class AlertRead(BaseModel):
    id: int
    timestamp: datetime
    type: str
    severity: str
    temperature: float | None = None
    humidity: float | None = None
    wind_speed: float | None = None
    location: str | None = None
    message: str

    model_config = {"from_attributes": True}


class AlertListMeta(BaseModel):
    total: int
    page: int
    size: int
    pages: int


class AlertListResponse(BaseModel):
    data: list[AlertRead]
    meta: AlertListMeta
