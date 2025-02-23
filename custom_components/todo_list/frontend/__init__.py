"""Frontend for Todo List Cards."""

import logging
import os
import pathlib

from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant
from homeassistant.helpers.event import async_call_later

from ..const import TODO_LIST_CARDS, URL_BASE

_LOGGER = logging.getLogger(__name__)


class TodoListCardRegistration:
    def __init__(self, hass: HomeAssistant):
        self.hass = hass

    async def async_register(self):
        await self.async_register_todo_list_path()
        if self.hass.data["lovelace"]["mode"] == "storage":
            await self.async_wait_for_lovelace_resources()

    # install card
    async def async_register_todo_list_path(self):
        """Register custom cards path if not already registered"""
        try:
            await self.hass.http.async_register_static_paths(
                [StaticPathConfig(URL_BASE, pathlib.Path(__file__).parent, False)]
            )
            _LOGGER.debug(
                "Registered Todo List path from %s", pathlib.Path(__file__).parent
            )
        except RuntimeError:
            _LOGGER.debug("Todo List static path already registered")

    async def async_wait_for_lovelace_resources(self) -> None:
        async def check_lovelace_resources_loaded(now):
            if self.hass.data["lovelace"]["resources"].loaded:
                await self.async_register_todo_list_cards()
            else:
                _LOGGER.debug(
                    "Unable to install Todo List Cards because Lovelace resources not yet loaded. Trying again in 5 seconds"
                )
                async_call_later(self.hass, 5, check_lovelace_resources_loaded)

        await check_lovelace_resources_loaded(0)

    async def async_register_todo_list_cards(self):
        _LOGGER.debug("Installing Lovelace resource for Todo List Cards")

        # Get resources already registered
        todo_list_resources = [
            resource
            for resource in self.hass.data["lovelace"]["resources"].async_items()
            if resource["url"].startswith(URL_BASE)
        ]

        for card in TODO_LIST_CARDS:
            url = f"{URL_BASE}/{card.get('filename')}"

            card_registered = False

            for res in todo_list_resources:
                if self.get_resource_path(res["url"]) == url:
                    card_registered = True
                    # check version
                    if self.get_resource_version(res["url"]) != card.get("version"):
                        # Update card version
                        _LOGGER.debug(
                            "Updating %s to version %s",
                            card.get("name"),
                            card.get("version"),
                        )
                        await self.hass.data["lovelace"]["resources"].async_update_item(
                            res.get("id"),
                            {
                                "res_type": "module",
                                "url": url + "?v=" + card.get("version"),
                            },
                        )

                    else:
                        _LOGGER.debug(
                            "%s already registered as version %s",
                            card.get("name"),
                            card.get("version"),
                        )

            if not card_registered:
                _LOGGER.debug(
                    "Registering %s as version %s",
                    card.get("name"),
                    card.get("version"),
                )
                await self.hass.data["lovelace"]["resources"].async_create_item(
                    {"res_type": "module", "url": url + "?v=" + card.get("version")}
                )

    def get_resource_path(self, url: str):
        return url.split("?")[0]

    def get_resource_version(self, url: str):
        try:
            return url.split("?")[1].replace("v=", "")
        except Exception:
            return 0

    async def async_unregister(self):
        # Unload lovelace module resource
        if self.hass.data["lovelace"]["mode"] == "storage":
            for card in TODO_LIST_CARDS:
                url = f"{URL_BASE}/{card.get('filename')}"
                todo_list_resources = [
                    resource
                    for resource in self.hass.data["lovelace"][
                        "resources"
                    ].async_items()
                    if str(resource["url"]).startswith(url)
                ]

                for resource in todo_list_resources:
                    await self.hass.data["lovelace"]["resources"].async_delete_item(
                        resource.get("id")
                    )
