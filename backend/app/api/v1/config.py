from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.repositories.config_repository import ConfigRepository
from app.schemas.config import ConfigRead, ConfigUpdate, ConfigResponse
from app.core.logging import setup_logging

router = APIRouter()
logger = setup_logging("berryguard.api.config")


@router.get("", response_model=ConfigResponse, summary="Retorna configurações atuais")
def get_config(db: Session = Depends(get_db)):
    config = ConfigRepository(db).get_or_create_default()
    return ConfigResponse(data=ConfigRead.model_validate(config))


@router.put("", response_model=ConfigResponse, summary="Atualiza configurações")
def update_config(body: ConfigUpdate, db: Session = Depends(get_db)):
    repo = ConfigRepository(db)
    current = repo.get_or_create_default()

    # Detectar mudança de cidade (lat/lon)
    new_lat = body.latitude if body.latitude is not None else current.latitude
    new_lon = body.longitude if body.longitude is not None else current.longitude
    new_name = body.location_name if body.location_name is not None else current.location_name
    city_changed = (new_lat != current.latitude or new_lon != current.longitude)

    updated = repo.update(**body.model_dump(exclude_none=True))

    logger.info(
        f"[CONFIG UPDATED] location={new_name} "
        f"min_temp={updated.min_temperature} max_hum={updated.max_humidity}"
    )

    if city_changed:
        logger.info(
            f"[CITY CHANGED] old=({current.latitude},{current.longitude}) "
            f"new=({new_lat},{new_lon}) name={new_name}"
        )

    return ConfigResponse(data=ConfigRead.model_validate(updated))
