from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    DATABASE_URL: str = "sqlite:////app/data/berryguard.db"

    # Redis
    REDIS_URL: str = "redis://redis:6379/0"
    CACHE_TTL_SECONDS: int = 900  # 15 minutos

    # RabbitMQ
    RABBITMQ_URL: str = "amqp://guest:guest@rabbitmq:5672/"
    RABBITMQ_EXCHANGE: str = "berryguard"
    RABBITMQ_QUEUE: str = "climate_events"
    RABBITMQ_ROUTING_KEY: str = "climate.data"

    # Localização padrão (São Paulo, SP)
    DEFAULT_LATITUDE: float = -23.5505
    DEFAULT_LONGITUDE: float = -46.6333
    DEFAULT_LOCATION_NAME: str = "São Paulo, SP"

    # Thresholds padrão
    DEFAULT_MIN_TEMPERATURE: float = 2.0
    DEFAULT_MAX_HUMIDITY: float = 90.0

    # Aplicação
    APP_TITLE: str = "BerryGuard API"
    APP_VERSION: str = "1.0.0"


settings = Settings()
