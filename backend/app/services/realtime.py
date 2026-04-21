"""Real-time event bus backed by Redis Pub/Sub.

Provides a lightweight publish/subscribe mechanism used by services and
Celery tasks to push events to connected WebSocket clients.  Falls back
gracefully when Redis is unavailable (e.g. local development without
Docker).
"""

from __future__ import annotations

import json
import logging

from app.config import settings

logger = logging.getLogger(__name__)


class RealtimeService:
    """Thin wrapper around ``redis.asyncio`` pub/sub."""

    CHANNEL = "dentaflow:events"

    def __init__(self) -> None:
        self.redis = None

    async def connect(self) -> None:
        """Open a Redis connection.  Silently degrades if unavailable."""
        try:
            from redis.asyncio import Redis

            self.redis = Redis.from_url(
                settings.REDIS_URL,
                decode_responses=True,
            )
            # Quick connectivity check
            await self.redis.ping()
            logger.info("RealtimeService connected to Redis")
        except Exception:
            logger.warning("RealtimeService: Redis unavailable, running without pub/sub")
            self.redis = None

    async def disconnect(self) -> None:
        """Close the Redis connection if open."""
        if self.redis:
            await self.redis.close()
            self.redis = None

    async def publish(self, event_type: str, data: dict) -> None:
        """Publish an event to the dentaflow channel."""
        if self.redis is None:
            logger.debug("Publish skipped (no Redis): type=%s", event_type)
            return

        payload = json.dumps(
            {"type": event_type, "data": data},
            ensure_ascii=False,
            default=str,
        )
        try:
            await self.redis.publish(self.CHANNEL, payload)
        except Exception:
            logger.exception("Failed to publish event type=%s", event_type)

    async def subscribe(self):
        """Return a Pub/Sub subscription to the dentaflow channel.

        Returns ``None`` when Redis is not available.
        """
        if self.redis is None:
            return None

        try:
            pubsub = self.redis.pubsub()
            await pubsub.subscribe(self.CHANNEL)
            return pubsub
        except Exception:
            logger.exception("Failed to subscribe to %s", self.CHANNEL)
            return None


# Module-level singleton
realtime = RealtimeService()
