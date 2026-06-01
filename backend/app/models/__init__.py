# Pacote models — importa todos os modelos para que o Base.metadata os reconheça
from app.models.alert import Alert
from app.models.config_model import AppConfig

__all__ = ["Alert", "AppConfig"]
