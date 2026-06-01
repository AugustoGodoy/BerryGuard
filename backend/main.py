from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.logging import setup_logging
from app.database.connection import SessionLocal, engine
from app.models import Alert, AppConfig  # garante que os modelos estão registrados no metadata
from app.database.connection import Base
from app.repositories.config_repository import ConfigRepository

logger = setup_logging("berryguard.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Iniciando BerryGuard API...")

    # Cria tabelas automaticamente (sem migrations)
    Base.metadata.create_all(bind=engine)
    logger.info("Tabelas verificadas/criadas no banco de dados")

    # Garante que a configuração padrão existe
    with SessionLocal() as session:
        ConfigRepository(session).get_or_create_default()
    logger.info("Configuração padrão inicializada")

    yield

    logger.info("Encerrando BerryGuard API")


app = FastAPI(
    title=settings.APP_TITLE,
    description="Plataforma de Monitoramento Climático para Produtores de Morango",
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok", "service": "berryguard-api"}
