"""Config flow for Todo List integration."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.const import CONF_ENTITY_ID, CONF_NAME
from homeassistant.helpers import selector
from homeassistant.data_entry_flow import FlowResult
from homeassistant.components import persistent_notification
import logging

from .const import CONF_TIME, DEFAULT_TIME, DOMAIN


class TodoResetConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Todo Reset."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle the initial step."""
        errors = {}

        if user_input is not None:
            await self.async_set_unique_id(
                f"{user_input[CONF_ENTITY_ID]}_{user_input[CONF_TIME]}"
            )
            self._abort_if_unique_id_configured()
            return cast(
                FlowResult,
                self.async_create_entry(
                    title=user_input[CONF_NAME],
                    data=user_input,
                ),
            )

        return cast(
            FlowResult,
            self.async_show_form(
                step_id="user",
                data_schema=vol.Schema(
                    {
                        vol.Required(CONF_NAME): str,
                        vol.Required(CONF_ENTITY_ID): selector.EntitySelector(
                            selector.EntitySelectorConfig(domain="todo"),
                        ),
                        vol.Required(
                            CONF_TIME, default=DEFAULT_TIME
                        ): selector.TimeSelector(),
                    }
                ),
                errors=errors,
            ),
        )

    # Add options flow handler
    @staticmethod
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> config_entries.OptionsFlow:
        """Create the options flow."""
        return TodoResetOptionsFlow(config_entry)


class TodoResetOptionsFlow(config_entries.OptionsFlow):
    """Handle options for the component."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        """Initialize options flow."""
        # Don't store config_entry directly
        self.entry_id = config_entry.entry_id
        self.entry_data = dict(config_entry.data)

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle the initial step."""
        errors = {}

        if user_input is not None:
            # Return the updated options

            # Get a reference to the Home Assistant instance
            hass = self.hass

            # Get the config entry
            config_entries = hass.config_entries
            config_entry = None

            for entry in config_entries.async_entries(DOMAIN):
                if entry.entry_id == self.entry_id:
                    config_entry = entry
                    break

            if config_entry:
                # Update the config entry data
                new_data = {**config_entry.data}
                for key, value in user_input.items():
                    new_data[key] = value

                hass.config_entries.async_update_entry(config_entry, data=new_data)

            # Directly update the entity if possible
            if DOMAIN in hass.data:
                for entry_id, entry_data in hass.data[DOMAIN].items():
                    if entry_id == self.entry_id:
                        entity = entry_data.get("entity")
                        if entity:
                            entity.update_settings(
                                entity_id=user_input[CONF_ENTITY_ID],
                                reset_time=user_input[CONF_TIME],
                            )

                            # Also update the stored data
                            entry_data.update(
                                {
                                    "entity_id": user_input[CONF_ENTITY_ID],
                                    "reset_time": user_input[CONF_TIME],
                                }
                            )

                            # Create a persistent notification
                            persistent_notification.async_create(
                                hass,
                                "Todo List entity has been updated.",
                                title="Todo List Updated",
                                notification_id="todo_list_updated",
                            )

            return cast(FlowResult, self.async_create_entry(title="", data=user_input))

        # Prepare default values from current configuration
        default_entity_id = self.entry_data.get(CONF_ENTITY_ID, "")
        default_time = self.entry_data.get(CONF_TIME, DEFAULT_TIME)

        return cast(
            FlowResult,
            self.async_show_form(
                step_id="init",
                data_schema=vol.Schema(
                    {
                        vol.Required(
                            CONF_ENTITY_ID, default=default_entity_id
                        ): selector.EntitySelector(
                            selector.EntitySelectorConfig(domain="todo"),
                        ),
                        vol.Required(
                            CONF_TIME, default=default_time
                        ): selector.TimeSelector(),
                    }
                ),
                errors=errors,
            ),
        )
