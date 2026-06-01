import json
import pika
from app.core.config import settings
from app.core.logging import setup_logging

logger = setup_logging("berryguard.queue")


class QueueService:
    """Publica eventos climáticos na fila RabbitMQ (Direct Exchange, Durable, Persistent)."""

    def _get_channel(self):
        connection = pika.BlockingConnection(pika.URLParameters(settings.RABBITMQ_URL))
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
        return connection, channel

    def publish_climate_event(self, data: dict) -> bool:
        connection = None
        try:
            connection, channel = self._get_channel()
            body = json.dumps(data, default=str)
            channel.basic_publish(
                exchange=settings.RABBITMQ_EXCHANGE,
                routing_key=settings.RABBITMQ_ROUTING_KEY,
                body=body,
                properties=pika.BasicProperties(
                    delivery_mode=pika.DeliveryMode.Persistent,
                    content_type="application/json",
                ),
            )
            logger.info(f"[PUBLISHED] temp={data.get('temperature')}°C hum={data.get('humidity')}%")
            return True
        except Exception as exc:
            logger.error(f"[PUBLISH ERROR] {exc}")
            return False
        finally:
            if connection and not connection.is_closed:
                connection.close()
