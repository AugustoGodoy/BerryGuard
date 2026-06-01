from sqlalchemy import String, Float
from sqlalchemy.orm import Mapped, mapped_column
from app.database.connection import Base


class AppConfig(Base):
    __tablename__ = "app_config"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    min_temperature: Mapped[float] = mapped_column(Float, default=2.0, nullable=False)
    max_humidity: Mapped[float] = mapped_column(Float, default=90.0, nullable=False)
    latitude: Mapped[float] = mapped_column(Float, default=-23.5505, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, default=-46.6333, nullable=False)
    location_name: Mapped[str] = mapped_column(String(200), default="São Paulo, SP", nullable=False)
