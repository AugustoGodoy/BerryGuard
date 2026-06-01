from pydantic import BaseModel, Field


class ConfigRead(BaseModel):
    id: int
    min_temperature: float
    max_humidity: float
    latitude: float
    longitude: float
    location_name: str

    model_config = {"from_attributes": True}


class ConfigUpdate(BaseModel):
    min_temperature: float | None = Field(default=None, ge=-20.0, le=30.0)
    max_humidity: float | None = Field(default=None, ge=0.0, le=100.0)
    latitude: float | None = Field(default=None, ge=-90.0, le=90.0)
    longitude: float | None = Field(default=None, ge=-180.0, le=180.0)
    location_name: str | None = Field(default=None, max_length=200)


class ConfigResponse(BaseModel):
    data: ConfigRead
