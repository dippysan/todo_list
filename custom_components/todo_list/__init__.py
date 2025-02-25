"""The Todo List integration."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

import voluptuous as vol
from homeassistant.components.http import StaticPathConfig
from homeassistant.const import CONF_ENTITY_ID, Platform
from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers import config_validation as cv

from .const import CONF_TIME, DOMAIN
from .frontend import TodoListCardRegistration

if TYPE_CHECKING:
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

# Define the platforms we support
PLATFORMS = []


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Todo List from a config entry."""
    _LOGGER.debug("Starting async_setup_entry with config: %s", entry.data)

    try:
        # Store data in hass.data
        hass.data.setdefault(DOMAIN, {})[entry.entry_id] = {
            "entity_id": entry.data[CONF_ENTITY_ID],
            "reset_time": entry.data[CONF_TIME],
        }

        # Register frontend
        cards = TodoListCardRegistration(hass)
        await cards.async_register()

        # Register the entity directly
        from .todo_list import TodoListResetEntity

        entity_id = entry.data[CONF_ENTITY_ID]
        reset_time = entry.data[CONF_TIME]

        entity = TodoListResetEntity(hass, entry.entry_id, entity_id, reset_time)

        # Add the entity to Home Assistant
        from homeassistant.helpers.entity_component import EntityComponent

        component = EntityComponent(_LOGGER, DOMAIN, hass)
        await component.async_add_entities([entity])

        # Register service
        async def handle_reset_now(call):
            """Handle the service call."""
            await entity.async_reset_items()

        hass.services.async_register(DOMAIN, "reset_now", handle_reset_now)

        return True
    except Exception as e:
        _LOGGER.exception("Error setting up Todo List integration: %s", str(e))
        return False


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    _LOGGER.debug("Unloading Todo List integration")
    try:
        # Just remove the data
        if DOMAIN in hass.data and entry.entry_id in hass.data[DOMAIN]:
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
