"""Automation platform for Todo List integration."""

from __future__ import annotations

from homeassistant.const import CONF_ENTITY_ID
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType

from . import DOMAIN


async def async_get_automations(
    hass: HomeAssistant, config_entry
) -> list[dict[str, any]]:
    """Return automation config."""
    if not DOMAIN in hass.data or not config_entry.entry_id in hass.data[DOMAIN]:
        return []

    return [hass.data[DOMAIN][config_entry.entry_id]["automation"]]


async def async_setup_automation(
    hass: HomeAssistant,
    config: ConfigType,
    config_entry,
    automation_config: dict,
) -> None:
    """Set up an automation."""
    return True
