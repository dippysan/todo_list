"""The Todo List integration."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

import voluptuous as vol
from homeassistant.components.http import StaticPathConfig
from homeassistant.const import CONF_ENTITY_ID
from homeassistant.helpers import config_validation as cv

from .const import (
    CONF_TIME,
    DOMAIN,
    CONF_DISPLAY_POSITION,
    DEFAULT_DISPLAY_POSITION,
    CONF_DISPLAY_HOURS,
    DEFAULT_DISPLAY_HOURS,
)
from .frontend import TodoListCardRegistration

if TYPE_CHECKING:
    from homeassistant.config_entries import ConfigEntry
    from homeassistant.core import HomeAssistant
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

    try:
        # Store data in hass.data
        entity_id = entry.data[CONF_ENTITY_ID]
        reset_time = entry.data[CONF_TIME]
        display_position = entry.data.get(
            CONF_DISPLAY_POSITION, DEFAULT_DISPLAY_POSITION
        )
        display_hours = entry.data.get(CONF_DISPLAY_HOURS, DEFAULT_DISPLAY_HOURS)

        # Register the entity directly
        from .todo_list import TodoListResetEntity

        entity = TodoListResetEntity(
            hass, entry.entry_id, entity_id, reset_time, display_position, display_hours
        )

        # Store the entity reference directly
        hass.data.setdefault(DOMAIN, {})[entry.entry_id] = {
            "entity_id": entity_id,
            "reset_time": reset_time,
            "display_position": display_position,
            "display_hours": display_hours,
            "entity": entity,  # Store direct reference to entity
        }

        # Register frontend
        cards = TodoListCardRegistration(hass)
        await cards.async_register()

        # Add the entity to Home Assistant
        from homeassistant.helpers.entity_component import EntityComponent

        component = EntityComponent(_LOGGER, DOMAIN, hass)
        await component.async_add_entities([entity])

        # Register service
        async def handle_reset_now(call):
            """Handle the service call."""
            await entity.async_reset_items()

        hass.services.async_register(DOMAIN, "reset_now", handle_reset_now)

        # Set up update listener for config entry changes
        entry.async_on_unload(entry.add_update_listener(update_listener))

        return True
    except Exception as e:
        return False


async def update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Handle options update."""

    # Check if we have options
    if not entry.options:
        return

    # Update the data with the new options
    new_data = {**entry.data}

    # Apply options to data
    for key, value in entry.options.items():
        new_data[key] = value

    hass.config_entries.async_update_entry(entry, data=new_data)

    # Try to get the entity directly from our stored reference
    if DOMAIN in hass.data and entry.entry_id in hass.data[DOMAIN]:
        entity_data = hass.data[DOMAIN][entry.entry_id]
        entity = entity_data.get("entity")

        if entity:
            # Update the stored data
            entity_data.update(
                {
                    "entity_id": new_data[CONF_ENTITY_ID],
                    "reset_time": new_data[CONF_TIME],
                    "display_position": new_data.get(
                        CONF_DISPLAY_POSITION, DEFAULT_DISPLAY_POSITION
                    ),
                    "display_hours": new_data.get(
                        CONF_DISPLAY_HOURS, DEFAULT_DISPLAY_HOURS
                    ),
                }
            )

            # Update the entity settings
            entity.update_settings(
                entity_id=new_data[CONF_ENTITY_ID],
                reset_time=new_data[CONF_TIME],
                display_position=new_data.get(CONF_DISPLAY_POSITION),
                display_hours=new_data.get(CONF_DISPLAY_HOURS),
            )
        else:
            await hass.config_entries.async_reload(entry.entry_id)
    else:
        await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    try:
        # Just remove the data
        if DOMAIN in hass.data and entry.entry_id in hass.data[DOMAIN]:
            del hass.data[DOMAIN][entry.entry_id]

        return True
    except Exception as e:
        return False


async def async_setup(hass: HomeAssistant, _config: ConfigType) -> bool:
    """Set up the Todo List integration."""
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
        return True
    except Exception as e:
        return False
