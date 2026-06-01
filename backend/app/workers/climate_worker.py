#!/usr/bin/env python3
"""
BerryGuard Climate Worker

Consome mensagens da fila RabbitMQ com dados climáticos,
analisa as regras agronômicas de cultivo do morango e persiste alertas no SQLite.

─── Métricas Oficiais (Open-Meteo) ────────────────────────────────────────────
  Temperatura        │ Umidade Relativa  │ Velocidade do Vento
  Precipitação       │ Horas de Luz Diárias

─── Faixas Ideais ─────────────────────────────────────────────────────────────
  Temperatura:  15°C – 28°C
  Umidade:      60% – 80%
  Vento:        ≤ 25 km/h
  Precipitação: ≤ 10 mm (diária)
  Luz:          ≥ 4 h/dia
"""

import json
import sys
import time

import pika
import pika.exceptions

sys.path.insert(0, "/app")

from app.core.config import settings
from app.core.logging import setup_logging
from app.database.connection import Base, SessionLocal, engine
from app.models import Alert, AppConfig
from app.models.alert import Alert
from app.repositories.alert_repository import AlertRepository
from app.repositories.config_repository import ConfigRepository

logger = setup_logging("berryguard.worker")

# ─────────────────────────────────────────────────────────────────────────────
# Limiares agronômicos — morango
# ─────────────────────────────────────────────────────────────────────────────

TEMP_IDEAL_MIN   = 15.0
TEMP_IDEAL_MAX   = 28.0
TEMP_GEADA_MIN   = 10.0   # abaixo: risco de geada
TEMP_CONGEL      = 0.0    # abaixo: congelamento crítico
TEMP_CALOR_MAX   = 30.0   # acima: calor excessivo
TEMP_FRIO_OBS    = 7.0    # abaixo: observação informativa de horas de frio

HUM_IDEAL_MIN    = 60.0
HUM_IDEAL_MAX    = 80.0

WIND_MAX         = 25.0   # km/h

PRECIP_MAX       = 10.0   # mm — excesso de chuva
SUNSHINE_MIN     = 4.0    # h  — baixa luminosidade


# ─────────────────────────────────────────────────────────────────────────────
# Regras de alerta (avaliadas em ordem de prioridade)
# ─────────────────────────────────────────────────────────────────────────────

ALERT_RULES = [
    # ── Congelamento Crítico (≤ 0°C) ──────────────────────────────────────────
    {
        "id": "CONGELAMENTO_CRITICO",
        "check": lambda t, h, w, p, s: t is not None and t <= TEMP_CONGEL,
        "type": "GEADA_CRITICA",
        "severity": "CRITICAL",
        "message": lambda t, h, w, p, s: (
            f"GEADA CRÍTICA: Temperatura {t:.1f}°C. "
            "Potencial de danos severos às flores, frutos e coroas da planta."
        ),
    },
    # ── Risco de Geada (0°C < temp < 10°C) ────────────────────────────────────
    {
        "id": "RISCO_GEADA",
        "check": lambda t, h, w, p, s: t is not None and TEMP_CONGEL < t < TEMP_GEADA_MIN,
        "type": "GEADA",
        "severity": "HIGH",
        "message": lambda t, h, w, p, s: (
            f"RISCO DE GEADA: Temperatura {t:.1f}°C na faixa crítica (0°C a 10°C). "
            "Risco elevado de danos ao desenvolvimento da cultura."
        ),
    },
    # ── Temperatura Baixa (10°C ≤ temp < 15°C) ────────────────────────────────
    {
        "id": "TEMP_BAIXA",
        "check": lambda t, h, w, p, s: t is not None and TEMP_GEADA_MIN <= t < TEMP_IDEAL_MIN,
        "type": "TEMPERATURA_BAIXA",
        "severity": "MEDIUM",
        "message": lambda t, h, w, p, s: (
            f"TEMPERATURA BAIXA: {t:.1f}°C abaixo da faixa ideal (15°C – 28°C). "
            "Pode comprometer o desenvolvimento vegetativo."
        ),
    },
    # ── Calor Excessivo (> 30°C) ───────────────────────────────────────────────
    {
        "id": "CALOR_EXCESSIVO",
        "check": lambda t, h, w, p, s: t is not None and t > TEMP_CALOR_MAX,
        "type": "CALOR_EXCESSIVO",
        "severity": "HIGH",
        "message": lambda t, h, w, p, s: (
            f"CALOR EXCESSIVO: Temperatura {t:.1f}°C acima do limite (30°C). "
            "Risco de estresse hídrico e queima foliar."
        ),
    },
    # ── Observação informativa: condição de frio (< 7°C) ──────────────────────
    {
        "id": "OBS_FRIO",
        "check": lambda t, h, w, p, s: (
            t is not None and TEMP_CONGEL < t < TEMP_FRIO_OBS
        ),
        "type": "OBS_FRIO",
        "severity": "LOW",
        "message": lambda t, h, w, p, s: (
            f"Temperatura abaixo de 7°C detectada ({t:.1f}°C). "
            "Condição favorável para o acúmulo de horas de frio necessárias "
            "ao desenvolvimento do morangueiro."
        ),
    },
    # ── Umidade Baixa (< 60%) ──────────────────────────────────────────────────
    {
        "id": "UMIDADE_BAIXA",
        "check": lambda t, h, w, p, s: h is not None and h < HUM_IDEAL_MIN,
        "type": "UMIDADE_BAIXA",
        "severity": "MEDIUM",
        "message": lambda t, h, w, p, s: (
            f"UMIDADE BAIXA: {h:.1f}% abaixo da faixa ideal (60% – 80%). "
            "Pode comprometer o desenvolvimento dos frutos."
        ),
    },
    # ── Umidade Elevada (> 80%) ────────────────────────────────────────────────
    {
        "id": "UMIDADE_ELEVADA",
        "check": lambda t, h, w, p, s: h is not None and h > HUM_IDEAL_MAX,
        "type": "UMIDADE_ELEVADA",
        "severity": lambda t, h, w, p, s: "CRITICAL" if h >= 95 else "HIGH",
        "message": lambda t, h, w, p, s: (
            f"UMIDADE ELEVADA: {h:.1f}% acima da faixa ideal (80%). "
            "Condições favoráveis ao desenvolvimento de fungos e doenças (Botrytis)."
        ),
    },
    # ── Vento Forte (> 25 km/h) ────────────────────────────────────────────────
    {
        "id": "VENTO_FORTE",
        "check": lambda t, h, w, p, s: w is not None and w > WIND_MAX,
        "type": "VENTO_FORTE",
        "severity": "MEDIUM",
        "message": lambda t, h, w, p, s: (
            f"VENTO FORTE: {w:.1f} km/h acima do limite seguro (25 km/h). "
            "Pode causar danos às flores e dificultar o manejo."
        ),
    },
    # ── Excesso de Chuva (> 10 mm) ────────────────────────────────────────────
    {
        "id": "EXCESSO_CHUVA",
        "check": lambda t, h, w, p, s: p is not None and p > PRECIP_MAX,
        "type": "EXCESSO_CHUVA",
        "severity": "HIGH",
        "message": lambda t, h, w, p, s: (
            f"EXCESSO DE CHUVA: {p:.1f} mm de precipitação acima do limite seguro (10 mm). "
            "Risco de encharcamento do solo e podridão das raízes."
        ),
    },
    # ── Baixa Luminosidade (< 4 h) ─────────────────────────────────────────────
    {
        "id": "BAIXA_LUMINOSIDADE",
        "check": lambda t, h, w, p, s: (
            s is not None and s > 0 and s < SUNSHINE_MIN
        ),
        "type": "BAIXA_LUMINOSIDADE",
        "severity": "MEDIUM",
        "message": lambda t, h, w, p, s: (
            f"BAIXA LUMINOSIDADE: {s:.1f}h de luz hoje, abaixo do ideal (≥ 4h). "
            "Pode reduzir a fotossíntese e comprometer o desenvolvimento dos frutos."
        ),
    },
]


# ─────────────────────────────────────────────────────────────────────────────
# Motor de análise climática
# ─────────────────────────────────────────────────────────────────────────────


def analyze_climate(data: dict, session) -> list[Alert]:
    """Aplica as regras agronômicas e persiste os alertas gerados."""
    temp     = data.get("temperature")
    hum      = data.get("humidity")
    wind     = data.get("wind_speed")
    precip   = data.get("precipitation", 0.0)
    sunshine = data.get("sunshine_hours", 0.0)
    location = f"Lat:{data.get('latitude', '?')}, Lon:{data.get('longitude', '?')}"

    repo    = AlertRepository(session)
    created: list[Alert] = []

    for rule in ALERT_RULES:
        if not rule["check"](temp, hum, wind, precip, sunshine):
            continue

        severity = rule["severity"]
        if callable(severity):
            severity = severity(temp, hum, wind, precip, sunshine)

        message = rule["message"](temp, hum, wind, precip, sunshine)

        alert = Alert(
            type=rule["type"],
            severity=severity,
            temperature=temp,
            humidity=hum,
            wind_speed=wind,
            location=location,
            message=message,
        )
        saved = repo.create(alert)
        created.append(saved)

        logger.info(
            f"[RULE TRIGGERED] rule={rule['id']} severity={severity} "
            f"temp={temp} hum={hum} wind={wind} precip={precip} sun={sunshine}"
        )
        logger.info(
            f"[ALERT CREATED] id={saved.id} type={saved.type} "
            f"severity={saved.severity} | {saved.message}"
        )

    return created


# ─────────────────────────────────────────────────────────────────────────────
# Callback de mensagem
# ─────────────────────────────────────────────────────────────────────────────


def on_message(channel, method, _properties, body):
    try:
        data = json.loads(body)
        logger.info(
            f"[MESSAGE RECEIVED] temp={data.get('temperature')}°C "
            f"hum={data.get('humidity')}% wind={data.get('wind_speed')}km/h "
            f"precip={data.get('precipitation', 0)}mm sun={data.get('sunshine_hours', 0)}h "
            f"lat={data.get('latitude')} lon={data.get('longitude')}"
        )

        with SessionLocal() as session:
            alerts = analyze_climate(data, session)

        if not alerts:
            logger.info("[NO ALERTS] Condições climáticas dentro dos limites agronômicos normais")
        else:
            logger.info(f"[MESSAGE PROCESSED] {len(alerts)} alerta(s) gerado(s)")

        channel.basic_ack(delivery_tag=method.delivery_tag)

    except json.JSONDecodeError as exc:
        logger.error(f"[ERROR] JSON inválido: {exc}")
        channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
    except Exception as exc:
        logger.error(f"[ERROR] Falha ao processar mensagem: {exc}", exc_info=True)
        channel.basic_nack(delivery_tag=method.delivery_tag, requeue=True)


# ─────────────────────────────────────────────────────────────────────────────
# Conexão com RabbitMQ
# ─────────────────────────────────────────────────────────────────────────────


def connect_to_rabbitmq() -> pika.BlockingConnection:
    retry = 0
    while True:
        try:
            conn = pika.BlockingConnection(pika.URLParameters(settings.RABBITMQ_URL))
            logger.info(f"[CONNECTED] RabbitMQ conectado após {retry} tentativas")
            return conn
        except pika.exceptions.AMQPConnectionError as exc:
            retry += 1
            wait = min(retry * 2, 30)
            logger.warning(
                f"[RECONNECT] RabbitMQ não disponível, tentativa {retry}, "
                f"aguardando {wait}s... ({exc})"
            )
            time.sleep(wait)


def setup_channel(connection: pika.BlockingConnection):
    channel = connection.channel()
    channel.exchange_declare(
        exchange=settings.RABBITMQ_EXCHANGE,
        exchange_type="direct",
        durable=True,
    )
    channel.queue_declare(queue=settings.RABBITMQ_QUEUE, durable=True)
    channel.queue_bind(
        exchange=settings.RABBITMQ_EXCHANGE,
        queue=settings.RABBITMQ_QUEUE,
        routing_key=settings.RABBITMQ_ROUTING_KEY,
    )
    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(queue=settings.RABBITMQ_QUEUE, on_message_callback=on_message)
    return channel


# ─────────────────────────────────────────────────────────────────────────────
# Entrypoint
# ─────────────────────────────────────────────────────────────────────────────


def main():
    logger.info("=" * 60)
    logger.info("BerryGuard Climate Worker iniciando...")
    logger.info(f"Queue: {settings.RABBITMQ_QUEUE}")
    logger.info(f"Exchange: {settings.RABBITMQ_EXCHANGE}")
    logger.info("Métricas: temp | umidade | vento | precipitação | horas de luz")
    logger.info("=" * 60)

    Base.metadata.create_all(bind=engine)
    logger.info("[DB] Tabelas verificadas")

    while True:
        connection = None
        try:
            connection = connect_to_rabbitmq()
            channel = setup_channel(connection)
            logger.info(
                f"[READY] Aguardando mensagens na fila '{settings.RABBITMQ_QUEUE}'... "
                "(Ctrl+C para parar)"
            )
            channel.start_consuming()
        except KeyboardInterrupt:
            logger.info("[STOP] Worker encerrado pelo usuário")
            if connection and not connection.is_closed:
                connection.close()
            sys.exit(0)
        except pika.exceptions.AMQPConnectionError as exc:
            logger.error(f"[DISCONNECTED] Conexão perdida: {exc}. Reconectando...")
            time.sleep(5)
        except Exception as exc:
            logger.error(f"[ERROR] Erro inesperado: {exc}", exc_info=True)
            if connection and not connection.is_closed:
                try:
                    connection.close()
                except Exception:
                    pass
            time.sleep(5)


if __name__ == "__main__":
    main()
