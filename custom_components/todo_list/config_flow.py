"""Config flow for Todo List integration."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.const import CONF_ENTITY_ID, CONF_NAME
from homeassistant.helpers import selector

from .const import CONF_TIME, DEFAULT_TIME, DOMAIN

if TYPE_CHECKING:
    from homeassistant.data_entry_flow import FlowResult


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
            return self.async_create_entry(
                title=user_input[CONF_NAME],
                data=user_input,
            )

        return self.async_show_form(
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
        )
