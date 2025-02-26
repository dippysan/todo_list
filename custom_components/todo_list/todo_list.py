"""Platform for todo_list integration."""

from __future__ import annotations

import logging
from typing import Any, cast

from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import Entity

from .const import DOMAIN


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

        self._setup_timer()

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
                return []

            return items_response[self._source_entity_id]["items"]
        except Exception as e:
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
            self._state = "error"
            self.async_write_ha_state()

    def update_settings(self, entity_id: str = None, reset_time: str = None) -> None:
        """Update the entity settings."""

        changed = False

        if entity_id is not None and entity_id != self._source_entity_id:
            self._source_entity_id = entity_id
            changed = True

        if reset_time is not None and reset_time != self._reset_time:
            self._reset_time = reset_time
            self._setup_timer()
            changed = True

        if changed:
            # Force a state update to reflect the changes
            self.async_schedule_update_ha_state(True)

            # Update the entity registry
            try:
                from homeassistant.helpers.entity_registry import async_get

                # Get new display name
                source_name = self._source_entity_id.split(".")[-1]
                display_name = source_name.replace("_", " ").title()
                new_name = f"{display_name} With Reset"

                # Update entity registry - don't change the unique_id to avoid conflicts
                entity_registry = async_get(self.hass)
                entity_registry.async_update_entity(
                    self.entity_id,
                    name=new_name,
                )

                # Also update the entity attribute
                self._attr_name = new_name

            except Exception as e:
                logging.getLogger(__name__).error(
                    f"Error updating entity registry: {e}"
                )

    def _setup_timer(self) -> None:
        """Set up the timer for resetting items using Home Assistant time trigger."""
        import logging
        import datetime
        import time

        logger = logging.getLogger(__name__)

        # Remove any existing timer
        if hasattr(self, "_timer_unsub") and self._timer_unsub is not None:
            self._timer_unsub()
            self._timer_unsub = None

        # If no reset time is set, don't schedule anything
        if not self._reset_time:
            logger.info(f"No reset time configured for {self.entity_id}")
            return

        try:
            # Parse the reset time (expected format: "HH:MM:SS")
            hour, minute, _second = map(int, self._reset_time.split(":"))

            # Create a time object for the reset time
            reset_time = datetime.time(hour=hour, minute=minute, second=0)

            # Define the reset callback
            async def reset_callback(now):
                """Reset the todo items."""
                logger.info(f"Executing scheduled reset for {self.entity_id}")
                await self.async_reset_items()

            # Schedule using time listener
            self._timer_unsub = self.hass.helpers.event.async_track_time_change(
                reset_callback, hour=hour, minute=minute, second=0
            )

            logger.info(
                f"Reset timer scheduled for {hour:02d}:{minute:02d} daily for {self.entity_id}"
            )

        except (ValueError, AttributeError) as e:
            logger.error(
                f"Error setting up timer with reset_time '{self._reset_time}': {e}"
            )
