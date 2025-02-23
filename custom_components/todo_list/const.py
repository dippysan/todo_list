"""Constants for the Todo List integration."""

from homeassistant.const import CONF_ENTITY_ID

DOMAIN = "todo_list"
CONF_TIME = "time"  # Define our own time constant
DEFAULT_TIME = "00:00:00"
URL_BASE = "/todo_list"

TODO_LIST_CARDS = [
    {"name": "Todo List Cards", "filename": "todo-reset-card.js", "version": "0.0.1"}
]
