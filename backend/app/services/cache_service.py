import json
import redis
from app.core.config import settings
from app.core.logging import setup_logging

logger = setup_logging("berryguard.cache")

_redis_client: redis.Redis | None = None

STALE_TTL_SECONDS = 86400  # 24 horas


def get_redis_client() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


class CacheService:
    def __init__(self):
        self.client = get_redis_client()
        self.ttl = settings.CACHE_TTL_SECONDS

    def get(self, key: str) -> dict | None:
        try:
            raw = self.client.get(key)
            if raw:
                logger.info(f"[CACHE HIT] key={key}")
                return json.loads(raw)
            logger.info(f"[CACHE MISS] key={key}")
            return None
        except Exception as exc:
            logger.warning(f"[CACHE ERROR] get key={key}: {exc}")
            return None

    def set(self, key: str, value: dict) -> bool:
        try:
            self.client.setex(key, self.ttl, json.dumps(value))
            logger.info(f"[CACHE SET] key={key} ttl={self.ttl}s")
            return True
        except Exception as exc:
            logger.warning(f"[CACHE ERROR] set key={key}: {exc}")
            return False

    def delete(self, key: str) -> bool:
        try:
            deleted = self.client.delete(key, f"stale:{key}")
            logger.info(f"[CACHE DELETE] key={key} stale:key={key} deleted={deleted}")
            return True
        except Exception as exc:
            logger.warning(f"[CACHE ERROR] delete key={key}: {exc}")
            return False

    def set_stale(self, key: str, value: dict) -> bool:
        """Armazena cópia com TTL de 24h para uso como fallback quando API falha."""
        try:
            self.client.setex(f"stale:{key}", STALE_TTL_SECONDS, json.dumps(value))
            logger.info(f"[CACHE STALE SET] key=stale:{key} ttl={STALE_TTL_SECONDS}s")
            return True
        except Exception as exc:
            logger.warning(f"[CACHE ERROR] set_stale key={key}: {exc}")
            return False

    def get_stale(self, key: str) -> dict | None:
        """Recupera cópia stale para fallback. Sem log de MISS para não poluir."""
        try:
            raw = self.client.get(f"stale:{key}")
            if raw:
                logger.info(f"[CACHE STALE HIT] key=stale:{key}")
                return json.loads(raw)
            return None
        except Exception as exc:
            logger.warning(f"[CACHE ERROR] get_stale key={key}: {exc}")
            return None

    @staticmethod
    def make_weather_key(lat: float, lon: float) -> str:
        return f"weather:{lat:.4f}:{lon:.4f}"
