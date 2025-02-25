"""Platform for todo_list integration."""

from __future__ import annotations

import logging
from typing import Any, cast

from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import Entity

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


class TodoListResetEntity(Entity):
    """Custom entity that links to a todo entity and adds reset functionality."""

    _attr_has_entity_name = True
    _attr_should_poll = True

    def __init__(
        self, hass: HomeAssistant, entry_id: str, source_entity_id: str, reset_time: str
    ) -> None:
        """Initialize the TodoListResetEntity."""
        self.hass = hass
        self._entry_id = entry_id
        self._source_entity_id = source_entity_id
        self._reset_time = reset_time

        # Extract source name for entity_id
        source_name = source_entity_id.split(".")[-1]

        # Set entity_id format
        self.entity_id = f"{DOMAIN}.{source_name}_with_reset"

        # Extract a more readable name for display
        display_name = source_name.replace("_", " ").title()

        # Set a unique ID for the entity
        self._attr_unique_id = f"{DOMAIN}_{entry_id}"

        # Set a friendly name
        self._attr_name = f"{display_name} With Reset"

        # Initialize state
        self._state = "idle"

    @property
    def state(self) -> str:
        """Return the state of the entity."""
        return self._state

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return entity specific state attributes."""
        return {
            "source_entity_id": self._source_entity_id,
            "reset_time": self._reset_time,
        }

    async def async_update(self) -> None:
        """Update the entity state."""
        # Just set the state to active if the source entity exists
        if self._source_entity_id in self.hass.states.async_entity_ids():
            self._state = "active"
        else:
            self._state = "error"

    async def async_get_items(self):
        """Get items directly from the source entity."""
        try:
            items_response = cast(
                dict[str, dict[str, list[dict[str, Any]]]],
                await self.hass.services.async_call(
                    "todo",
                    "get_items",
                    {"entity_id": self._source_entity_id},
                    blocking=True,
                    return_response=True,
                ),
            )

            if not items_response or self._source_entity_id not in items_response:
                _LOGGER.warning("No items found for entity: %s", self._source_entity_id)
                return []

            return items_response[self._source_entity_id]["items"]
        except Exception as e:
            _LOGGER.exception("Error getting todo items: %s", str(e))
            return []

    async def async_reset_items(self) -> None:
        """Reset all items to needs_action."""
        try:
            self._state = "resetting"
            self.async_write_ha_state()

            # Get items directly from source
            items = await self.async_get_items()

            # Reset completed items
            for item in items:
                if item["status"] == "completed":
                    await self.hass.services.async_call(
                        "todo",
                        "update_item",
                        {
                            "entity_id": self._source_entity_id,
                            "item": item["uid"],
                            "status": "needs_action",
                        },
                        blocking=True,
                    )

            self._state = "reset_complete"
            self.async_write_ha_state()

            # Schedule state change back to active
            async def set_active():
                self._state = "active"
                self.async_write_ha_state()

            self.hass.async_create_task(set_active())
        except Exception as e:
            _LOGGER.exception("Error resetting todo items: %s", str(e))
            self._state = "error"
            self.async_write_ha_state()
