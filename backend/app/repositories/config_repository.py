from sqlalchemy.orm import Session
from app.models.config_model import AppConfig
from app.core.config import settings


class ConfigRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_or_create_default(self) -> AppConfig:
        config = self.session.query(AppConfig).first()
        if not config:
            config = AppConfig(
                min_temperature=settings.DEFAULT_MIN_TEMPERATURE,
                max_humidity=settings.DEFAULT_MAX_HUMIDITY,
                latitude=settings.DEFAULT_LATITUDE,
                longitude=settings.DEFAULT_LONGITUDE,
                location_name=settings.DEFAULT_LOCATION_NAME,
            )
            self.session.add(config)
            self.session.commit()
            self.session.refresh(config)
        return config

    def update(self, **kwargs) -> AppConfig:
        config = self.get_or_create_default()
        for key, value in kwargs.items():
            if value is not None and hasattr(config, key):
                setattr(config, key, value)
        self.session.commit()
        self.session.refresh(config)
        return config
