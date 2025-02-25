"""Todo list platform for todo_list integration."""

from __future__ import annotations

import logging
from typing import Any, cast

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import Entity
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.entity_registry import async_get as async_get_entity_registry

from .const import CONF_ENTITY_ID, CONF_TIME, DOMAIN

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up the Todo List entity."""
    entity_id = entry.data[CONF_ENTITY_ID]
    reset_time = entry.data[CONF_TIME]

    _LOGGER.debug(
        "Setting up Todo List entity with source: %s and reset time: %s",
        entity_id,
        reset_time,
    )

    # Create our custom entity
    entity = TodoListResetEntity(hass, entry.entry_id, entity_id, reset_time)

    # Add the entity
    async_add_entities([entity])

    # Get the entity registry
    entity_registry = async_get_entity_registry(hass)

    # Update the entity_id in the registry to use our domain
    source_name = entity_id.split(".")[-1]
    new_entity_id = f"{DOMAIN}.{source_name}_reset"

    # Register with our preferred entity_id
    if entity.entity_id in entity_registry.entities:
        entity_registry.async_update_entity(
            entity.entity_id, new_entity_id=new_entity_id
        )
        _LOGGER.debug("Updated entity ID to: %s", new_entity_id)

    # Register service
    async def handle_reset_now(call):
        """Handle the service call."""
        await entity.async_reset_items()

    hass.services.async_register(DOMAIN, "reset_now", handle_reset_now)


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

        # Extract a more readable name from the source entity
        source_name = source_entity_id.split(".")[-1].replace("_", " ").title()

        # Set a unique ID for the entity
        self._attr_unique_id = f"{DOMAIN}_{entry_id}"

        # Set a friendly name
        self._attr_name = f"{source_name} Reset ({reset_time})"

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
