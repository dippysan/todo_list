"""Constants for the Todo List integration."""

from homeassistant.const import CONF_ENTITY_ID

DOMAIN = "todo_list"
CONF_TIME = "reset_time"
DEFAULT_TIME = "00:00:00"
URL_BASE = "/todo_list"

# New constants for UI display settings
CONF_DISPLAY_POSITION = "display_position"
CONF_DISPLAY_HOURS = "display_hours"
DEFAULT_DISPLAY_POSITION = "before"
DEFAULT_DISPLAY_HOURS = 2

TODO_LIST_CARDS = [
    {"name": "Todo List Cards", "filename": "todo-reset-card.js", "version": "0.0.6"}
]
