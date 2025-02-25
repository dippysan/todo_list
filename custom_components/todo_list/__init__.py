"""The Todo List integration."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any, cast

import voluptuous as vol
from homeassistant.components.http import StaticPathConfig
from homeassistant.const import CONF_ENTITY_ID
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.event import async_track_time_change

from .const import CONF_TIME, DOMAIN
from .frontend import TodoListCardRegistration

if TYPE_CHECKING:
    from datetime import datetime

    from homeassistant.config_entries import ConfigEntry
    from homeassistant.helpers.typing import ConfigType

_LOGGER = logging.getLogger(__name__)

# Configuration schema
CONFIG_SCHEMA = vol.Schema(
    {
        DOMAIN: vol.Schema(
            {
                vol.Required(CONF_ENTITY_ID): cv.entity_id,
                vol.Required(CONF_TIME): cv.time,
            }
        )
    },
    extra=vol.ALLOW_EXTRA,
)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Todo List from a config entry."""
    _LOGGER.debug("Starting async_setup_entry with config: %s", entry.data)

    try:

        async def reset_todo_items(_call: ServiceCall | None = None) -> None:
            """Reset all items in a todo list to needs_action."""
            entity_id = entry.data[CONF_ENTITY_ID]
            _LOGGER.debug("Attempting to reset items for entity: %s", entity_id)

            try:
                # Get all items
                items_response = cast(
                    dict[str, dict[str, list[dict[str, Any]]]],
                    await hass.services.async_call(
                        "todo",
                        "get_items",
                        {"entity_id": entity_id},
                        blocking=True,
                        return_response=True,
                    ),
                )

                if not items_response or entity_id not in items_response:
                    _LOGGER.warning("No items found for entity: %s", entity_id)
                    return

                # Update each item to needs_action
                for item in items_response[entity_id]["items"]:
                    _LOGGER.debug("Resetting item: %s", item["uid"])
                    await hass.services.async_call(
                        "todo",
                        "update_item",
                        {
                            "entity_id": entity_id,
                            "item": item["uid"],
                            "status": "needs_action",
                        },
                        blocking=True,
                    )
            except Exception as e:
                _LOGGER.exception("Error in reset_todo_items: %s", str(e))

        # Register service
        if DOMAIN not in hass.services.async_services():
            _LOGGER.debug("Registering reset_items service")
            hass.services.async_register(DOMAIN, "reset_items", reset_todo_items)

        # Parse reset time
        reset_time = entry.data.get(CONF_TIME)
        if not reset_time:
            _LOGGER.error("No reset time configured")
            return False

        _LOGGER.debug("Configuring reset time: %s", reset_time)
        try:
            hour, minute = list(map(int, reset_time.split(":")))[:2]
        except (ValueError, IndexError) as e:
            _LOGGER.exception("Error parsing reset time: %s", str(e))
            return False

        # Set up time-based trigger
        @callback
        def time_change_listener(_now: datetime) -> None:
            """Handle time change."""
            _LOGGER.debug("Time change triggered, resetting items")
            hass.async_create_task(reset_todo_items())

        # Store cleanup function
        unsub = async_track_time_change(
            hass, time_change_listener, hour=hour, minute=minute, second=0
        )

        # Store for cleanup
        hass.data.setdefault(DOMAIN, {})[entry.entry_id] = {
            "unsub": unsub,
            "entity_id": entry.data[CONF_ENTITY_ID],
        }

        # Forward the entry to the todo platform
        await hass.config_entries.async_forward_entry_setup(entry, "todo")

        cards = TodoListCardRegistration(hass)
        await cards.async_register()

        _LOGGER.debug("Successfully set up Todo List integration")
        return True

    except Exception as e:
        _LOGGER.exception("Error setting up Todo List integration: %s", str(e))
        return False


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    _LOGGER.debug("Unloading Todo List integration")
    try:
        # Unload the todo platform
        await hass.config_entries.async_forward_entry_unload(entry, "todo")

        if DOMAIN in hass.data and entry.entry_id in hass.data[DOMAIN]:
            unsub = hass.data[DOMAIN][entry.entry_id]["unsub"]
            unsub()
            del hass.data[DOMAIN][entry.entry_id]
        return True
    except Exception as e:
        _LOGGER.exception("Error unloading Todo List integration: %s", str(e))
        return False


async def async_setup(hass: HomeAssistant, _config: ConfigType) -> bool:
    """Set up the Todo List integration."""
    _LOGGER.debug("Starting async_setup for Todo List integration")
    try:
        # Register frontend path
        await hass.http.async_register_static_paths(
            [
                StaticPathConfig(
                    url_path="/todo_list",
                    path=hass.config.path("custom_components/todo_list/frontend"),
                    cache_headers=False,
                )
            ]
        )
        _LOGGER.debug("Successfully registered static path")
        return True
    except Exception as e:
        _LOGGER.exception("Error in async_setup: %s", str(e))
        return False
