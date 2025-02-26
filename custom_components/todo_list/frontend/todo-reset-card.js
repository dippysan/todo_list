// Constants
const CARD_TYPE_RAW = "todo-reset-card";
const CARD_TYPE = "custom:" + CARD_TYPE_RAW;
const DEFAULT_REFRESH_DELAY = 1000;
const DEBUG = false; // Set to true to enable debug logging
const CSS_CLASSES = {
  DONE: "done",
  ERROR: "error",
  TODO_ITEM: "todo-item",
  TODO_LIST: "todo-list",
  CARD_HEADER: "card-header",
  CARD_CONTENT: "card-content",
  CARD_ACTIONS: "card-actions"
};

// Helper function for conditional logging
const debugLog = (...args) => {
  if (DEBUG) {
    console.log(...args);
  }
};

if (customElements.get("todo-reset-card")) {
  console.info("todo-reset-card already defined");
} else {
  class TodoResetCardEditor extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._boundValueChanged = this._valueChanged.bind(this);
    }

    set hass(hass) {
      this._hass = hass;
      this._render();
    }

    setConfig(config) {
      this.config = config || {};
      this._render();
    }

    configChanged(newConfig) {
      console.log("Config changed called with:", newConfig);
      if (!newConfig.entity) {
        console.error("No entity provided in new config");
        return;
      }

      // Ensure we're only sending the entity property and type
      const cleanConfig = {
        type: CARD_TYPE,  // Use the constant
        entity: newConfig.entity
      };

      console.log("Dispatching clean config:", cleanConfig);

      const event = new CustomEvent("config-changed", {
        detail: { config: cleanConfig },
        bubbles: true,
        composed: true,
      });
      this.dispatchEvent(event);
    }

    _render() {
      if (!this._hass) return;
      this._clearShadowRoot();
      this._createForm();
    }

    _clearShadowRoot() {
      while (this.shadowRoot.firstChild) {
        this.shadowRoot.removeChild(this.shadowRoot.firstChild);
      }
    }

    _createForm() {
      // Add styles
      const style = document.createElement('style');
      style.textContent = this._getStyles();
      this.shadowRoot.appendChild(style);

      // Create container and form
      const container = document.createElement('div');
      container.className = 'card-config';

      const haForm = this._createHaForm();
      container.appendChild(haForm);
      this.shadowRoot.appendChild(container);
    }

    _getStyles() {
      return `
        .card-config {
          padding: 16px;
        }
      `;
    }

    _createHaForm() {
      const haForm = document.createElement('ha-form');
      haForm.hass = this._hass;
      haForm.data = this.config;
      haForm.schema = this._getSchema();
      haForm.computeLabel = this._computeLabel;
      haForm.addEventListener('value-changed', this._boundValueChanged);
      return haForm;
    }

    _getSchema() {
      return [
        {
          name: "entity",
          required: true,
          selector: {
            entity: {
              domain: "todo_list",
              label: "Todo List Entity",
              multiple: false,
            },
          },
        },
      ];
    }

    _computeLabel(schema) {
      return schema.selector?.entity?.label ||
             schema.selector?.text?.label ||
             schema.name;
    }

    _valueChanged(ev) {
      if (!this._hass) return;

      console.log("Value changed event:", ev);
      console.log("Current config:", this.config);

      // Create a new config object
      let newConfig = {};

      // Check if we have a nested configuration
      if (ev.detail.value && typeof ev.detail.value === 'object' && ev.detail.value.entity) {
        // This is the case where we get a complete config object
        console.log("Received complete config object:", ev.detail.value);
        newConfig = {
          type: CARD_TYPE,  // Use the constant
          entity: ev.detail.value.entity
        };
      } else if (ev.detail.name === "entity") {
        // This is the case where we get a single property
        newConfig = {
          type: CARD_TYPE,  // Use the constant
          entity: ev.detail.value
        };
      } else {
        console.error("Unexpected event structure:", ev);
        return;
      }

      console.log("New config to be dispatched:", newConfig);

      // Notify about the config change
      this.configChanged(newConfig);
    }

    disconnectedCallback() {
      const haForm = this.shadowRoot.querySelector('ha-form');
      if (haForm) {
        haForm.removeEventListener('value-changed', this._boundValueChanged);
      }
    }
  }

  customElements.define("todo-reset-card-editor", TodoResetCardEditor);

  class TodoResetCard extends HTMLElement {
    constructor() {
      super();
      this._config = {};
      this._initialized = false;
      this._items = [];
      this._boundHandleReset = this._handleReset.bind(this);
      this._boundRefreshVisibility = this._refreshVisibility.bind(this);
      this.attachShadow({ mode: "open" });
    }

    static getConfigElement() {
      return document.createElement("todo-reset-card-editor");
    }

    static getStubConfig() {
      return {
        entity: ""
      };
    }

    set hass(hass) {
      const oldHass = this._hass;
      this._hass = hass;

      // If this is the first time we're getting hass, subscribe to events
      if (!oldHass && hass) {
        this._subscribeToEvents();
      }

      this.updateCard();
    }

    _checkTimeBasedVisibility() {
      // Only check visibility once per minute to avoid excessive updates
      const now = Date.now();
      if (now - this._lastVisibilityCheck < 60000) { // 60000ms = 1 minute
        return;
      }

      this._lastVisibilityCheck = now;
      console.log("Time-based visibility check triggered");

      if (this._hass && this._config && this._config.entity) {
        const resetEntity = this._hass.states[this._config.entity];
        if (resetEntity) {
          // Check if visibility should change
          const shouldShow = this._shouldShowCard(resetEntity);

          // Update visibility if needed
          if (shouldShow && this.style.display === 'none') {
            console.log("Time check: Showing card");
            this.style.display = 'block';
          } else if (!shouldShow && this.style.display !== 'none') {
            console.log("Time check: Hiding card");
            this.style.display = 'none';
          }
        }
      }
    }

    async fetchItems() {
      if (!this._hass || !this._config || !this._config.entity) {
        console.error("Missing hass or config for fetchItems");
        return [];
      }

      // Get the source entity ID from our entity's attributes
      const resetEntity = this._hass.states[this._config.entity];
      if (!resetEntity) {
        console.error(`Entity ${this._config.entity} not found`);
        return [];
      }

      if (!resetEntity.attributes || !resetEntity.attributes.source_entity_id) {
        console.error(`Source entity ID not found in attributes for ${this._config.entity}`);
        console.log("Available attributes:", resetEntity.attributes);
        return [];
      }

      const sourceEntityId = resetEntity.attributes.source_entity_id;
      console.log(`Fetching items for source entity: ${sourceEntityId}`);

      try {
        const result = await this._hass.callWS({
          type: "todo/item/list",
          entity_id: sourceEntityId,
        });

        if (!result || !result.items) {
          console.error("No items returned from todo/item/list call");
          return [];
        }

        console.log(`Retrieved ${result.items.length} items from ${sourceEntityId}`);
        return result.items;
      } catch (error) {
        console.error(`Error fetching todo items for ${sourceEntityId}:`, error);
        return [];
      }
    }

    async updateCard() {
      if (!this._hass || !this._config) return;

      if (!this._initialized) {
        this._initializeCard();
        this._initialized = true;
      }

      const resetEntity = this._hass.states[this._config.entity];
      if (!resetEntity) {
        return this._showError(`Entity ${this._config.entity} not found`);
      }

      // Debug the entity state and attributes
      console.log("Reset entity state:", resetEntity.state);
      console.log("Reset entity attributes:", resetEntity.attributes);

      // Handle unavailable entity state
      if (resetEntity.state === "unavailable") {
        return this._showError(`Entity ${this._config.entity} is currently unavailable. This may be because Home Assistant is still starting up or the entity has an error.`);
      }

      // Check if the card should be visible based on time settings
      if (!this._shouldShowCard(resetEntity)) {
        this.style.display = 'none';
        return;
      } else {
        this.style.display = 'block';
      }

      // Get the source entity ID
      const sourceEntityId = this._getSourceEntityId();
      if (!sourceEntityId) {
        // More detailed error message
        const attrs = resetEntity.attributes ?
          `Available attributes: ${Object.keys(resetEntity.attributes).join(', ')}` :
          'No attributes found';

        // Special message for restored entities
        if (resetEntity.attributes.restored) {
          return this._showError(`Entity ${this._config.entity} has been restored but not fully initialized. Please check your configuration or restart Home Assistant.`);
        }

        return this._showError(`Source entity not defined in ${this._config.entity}. ${attrs}`);
      }

      // Update header
      this._updateHeader(sourceEntityId);

      // Fetch and render items
      try {
        const items = await this.fetchItems();
        this._renderTodoList(items);
      } catch (error) {
        console.error("Error updating todo list:", error);
        this._showError(`Error loading items: ${error.message}`);
      }
    }

    _shouldShowCard(resetEntity) {
      // Get display settings from entity attributes
      const displayPosition = resetEntity.attributes.display_position || 'before';
      const displayHours = parseInt(resetEntity.attributes.display_hours) || 2;
      const resetTime = resetEntity.attributes.reset_time || '00:00:00';

      // Parse reset time
      const [resetHour, resetMinute, resetSecond] = resetTime.split(':').map(Number);

      // Get current time
      const now = new Date();

      // Create Date objects for comparison
      const resetDate = new Date();
      resetDate.setHours(resetHour, resetMinute, resetSecond, 0);

      // Calculate time difference in hours (precise)
      const diffMs = Math.abs(now - resetDate);
      const diffHours = diffMs / (1000 * 60 * 60);

      // Determine if we should show the card based on position and hours
      if (displayPosition === 'before') {
        if (now < resetDate) {
          // We're before the reset time today
          return diffHours <= displayHours;
        } else {
          // We're after the reset time, check against tomorrow's reset
          const tomorrowResetDate = new Date(resetDate);
          tomorrowResetDate.setDate(tomorrowResetDate.getDate() + 1);

          const diffToTomorrowMs = tomorrowResetDate - now;
          const hoursUntilTomorrow = diffToTomorrowMs / (1000 * 60 * 60);
          const hoursInDay = 24;

          // We should NOT show if we're within displayHours of tomorrow's reset
          return hoursUntilTomorrow >= (hoursInDay - displayHours);
        }
      } else { // 'after'
        if (now >= resetDate) {
          // We're after the reset time today
          return diffHours <= displayHours;
        } else {
          // We're before the reset time, check against yesterday's reset
          const yesterdayResetDate = new Date(resetDate);
          yesterdayResetDate.setDate(yesterdayResetDate.getDate() - 1);

          const diffFromYesterdayMs = now - yesterdayResetDate;
          const hoursSinceYesterday = diffFromYesterdayMs / (1000 * 60 * 60);

          return hoursSinceYesterday <= displayHours;
        }
      }
    }

    _updateHeader(sourceEntityId) {
      const header = this.shadowRoot.querySelector(`.${CSS_CLASSES.CARD_HEADER}`);
      if (header) {
        header.textContent = this._getEntityName(sourceEntityId);
      }
    }

    _renderTodoList(items) {
      const todoList = this.shadowRoot.querySelector(`.${CSS_CLASSES.TODO_LIST}`);
      if (!todoList) return;

      todoList.innerHTML = this._renderItems(items);

      // Add click handlers
      this._addItemClickHandlers(items);
    }

    _addItemClickHandlers(items) {
      const todoList = this.shadowRoot.querySelector(`.${CSS_CLASSES.TODO_LIST}`);
      if (!todoList) return;

      todoList.querySelectorAll(`.${CSS_CLASSES.TODO_ITEM}`).forEach(element => {
        element.onclick = async () => {
          const itemId = element.dataset.itemId;
          const item = items.find(i => i.uid === itemId);
          if (!item) return;

          await this._toggleItemStatus(item);
        };
      });
    }

    async _toggleItemStatus(item) {
      const sourceEntityId = this._getSourceEntityId();
      if (!sourceEntityId) return;

      const newStatus = item.status === "completed" ? "needs_action" : "completed";

      await this._hass.callService("todo", "update_item", {
        entity_id: sourceEntityId,
        item: item.uid,
        status: newStatus,
      });

      // Refresh items after update
      this.updateCard();
    }

    async _handleReset() {
      if (!this._hass || !this._config?.entity) return;

      try {
        await this._hass.callService("todo_list", "reset_now", {});

        // Show a temporary "resetting" state
        const header = this.shadowRoot.querySelector(`.${CSS_CLASSES.CARD_HEADER}`);
        const originalText = header.textContent;
        header.textContent = `${originalText} (Resetting...)`;

        // Refresh the card after a delay
        setTimeout(() => {
          if (header) header.textContent = originalText;
          this.updateCard();
        }, DEFAULT_REFRESH_DELAY);
      } catch (error) {
        console.error("Error resetting todo items:", error);
        this._showError(`Failed to reset items: ${error.message}`);
      }
    }

    setConfig(config) {
      if (!config) {
        throw new Error("Invalid configuration");
      }

      if (!config.entity) {
        throw new Error("You need to define an entity");
      }

      this._config = config;

      this._initialized = false;
      this.updateCard();
    }

    getCardSize() {
      return 3;
    }

    _getSourceEntityId() {
      if (!this._hass || !this._config?.entity) return null;

      const resetEntity = this._hass.states[this._config.entity];
      if (!resetEntity) return null;

      // Check if source_entity_id exists in attributes
      if (!resetEntity.attributes.source_entity_id) {
        console.error(`Source entity ID not found in attributes for ${this._config.entity}`);
        return null;
      }

      return resetEntity.attributes.source_entity_id;
    }

    _getEntityName(entityId) {
      if (!entityId || !this._hass) return null;

      const entity = this._hass.states[entityId];
      if (entity?.attributes?.friendly_name) {
        return entity.attributes.friendly_name;
      }

      // Format entity ID as a readable name
      return entityId.split('.')[1]
        .replace(/_/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
    }

    _showError(message) {
      const todoList = this.shadowRoot.querySelector(`.${CSS_CLASSES.TODO_LIST}`);
      if (todoList) {
        todoList.innerHTML = `
          <div class="${CSS_CLASSES.ERROR}">
            ${message}
          </div>
        `;
      }
    }

    _initializeCard() {
      // Create the styles
      const style = document.createElement("style");
      style.textContent = `
        :host {
          --item-spacing: 12px;
          --text-color: var(--primary-text-color);
        }

        .${CSS_CLASSES.CARD_HEADER} {
          padding: 16px 16px 0;
          font-size: 18px;
          font-weight: 500;
          color: var(--text-color);
        }

        .${CSS_CLASSES.TODO_LIST} {
          display: flex;
          flex-direction: column;
          gap: var(--item-spacing);
          padding: 16px;
        }

        .${CSS_CLASSES.TODO_ITEM} {
          padding: 12px 0;
          cursor: pointer;
          color: var(--text-color);
          font-size: 14px;
          border-bottom: 1px solid var(--divider-color);
          transition: all 0.2s ease-in-out;
        }

        .${CSS_CLASSES.TODO_ITEM}:hover {
          color: var(--primary-color);
        }

        .${CSS_CLASSES.TODO_ITEM}.${CSS_CLASSES.DONE} {
          --text-color: rgb(95, 99, 104);
          color: var(--text-color) !important;
          text-decoration: line-through;
        }

        .${CSS_CLASSES.TODO_ITEM}:last-child {
          border-bottom: none;
        }

        .${CSS_CLASSES.ERROR} {
          color: var(--error-color, red);
          padding: 8px 16px;
          font-style: italic;
        }

        .${CSS_CLASSES.CARD_ACTIONS} {
          padding: 8px 16px;
          display: flex;
          justify-content: flex-end;
        }
      `;

      // Create the card content
      const card = document.createElement("ha-card");
      card.innerHTML = `
        <h1 class="${CSS_CLASSES.CARD_HEADER}"></h1>
        <div class="${CSS_CLASSES.CARD_CONTENT}">
          <div class="${CSS_CLASSES.TODO_LIST}"></div>
        </div>
        <div class="${CSS_CLASSES.CARD_ACTIONS}">
          <mwc-button>Reset All Items</mwc-button>
        </div>
      `;

      // Add style and content to shadow root
      this.shadowRoot.appendChild(style);
      this.shadowRoot.appendChild(card);

      // Add event listener for reset button
      const resetButton = this.shadowRoot.querySelector('mwc-button');
      if (resetButton) {
        resetButton.addEventListener('click', this._boundHandleReset);
      } else {
        console.error("Reset button not found in the shadow DOM");
      }
    }

    connectedCallback() {
      // Subscribe to Home Assistant events when the card is connected
      if (this._hass) {
        this._subscribeToEvents();
      }
    }

    disconnectedCallback() {
      // Remove event listeners
      const resetButton = this.shadowRoot.querySelector('mwc-button');
      if (resetButton) {
        resetButton.removeEventListener('click', this._boundHandleReset);
      }

      // Remove item click handlers
      const todoItems = this.shadowRoot.querySelectorAll(`.${CSS_CLASSES.TODO_ITEM}`);
      todoItems.forEach(item => {
        item.onclick = null;
      });

      // Unsubscribe from events
      this._unsubscribeFromEvents();
    }

    _subscribeToEvents() {
      if (!this._hass || this._eventSubscribed) return;

      // Subscribe to the state_changed event
      this._hass.connection.subscribeEvents(
        (event) => {
          // Check if this is a time entity change
          if (event.data &&
              event.data.entity_id === 'sensor.time' &&
              event.data.new_state &&
              event.data.old_state &&
              event.data.new_state.state !== event.data.old_state.state) {

            this._refreshVisibility();
          }
        },
        "state_changed"
      ).then(unsub => {
        this._eventUnsub = unsub;
        this._eventSubscribed = true;

        // Do an immediate visibility check
        setTimeout(() => this._refreshVisibility(), 1000);
      }).catch(err => {
        console.error("Failed to subscribe to state_changed events:", err);
      });
    }

    _unsubscribeFromEvents() {
      if (this._eventUnsub) {
        this._eventUnsub();
        this._eventUnsub = null;
        this._eventSubscribed = false;
      }
    }

    _renderItems(items) {
      if (!items || !items.length) {
        return `<div class="${CSS_CLASSES.TODO_ITEM}">No items in todo list</div>`;
      }

      // Sort items: TODO first, then DONE
      const sortedItems = [...items].sort((a, b) => {
        if (a.status === b.status) return 0;
        return a.status === "needs_action" ? -1 : 1;
      });

      return sortedItems
        .map(item => this._renderItem(item))
        .join("");
    }

    _renderItem(item) {
      const isDone = item.status === "completed";
      const doneClass = isDone ? CSS_CLASSES.DONE : "";

      return `
        <div class="${CSS_CLASSES.TODO_ITEM} ${doneClass}"
             data-item-id="${item.uid}">
          ${item.summary}
        </div>
      `;
    }

    // Clean up _refreshVisibility
    _refreshVisibility() {
      if (this._hass && this._config && this._config.entity) {
        const resetEntity = this._hass.states[this._config.entity];
        if (resetEntity) {
          // Check if visibility should change
          const shouldShow = this._shouldShowCard(resetEntity);

          // Update visibility if needed
          if (shouldShow && this.style.display === 'none') {
            this.style.display = 'block';
            this.updateCard(); // Full update when becoming visible
          } else if (!shouldShow && this.style.display !== 'none') {
            this.style.display = 'none';
          }
        }
      }
    }

    // This is the key method that tells Home Assistant what entities this card depends on
    get _timeEntity() {
      // Use the time entity if available, otherwise null
      return this._hass ? this._hass.states['sensor.time'] : null;
    }

    // Tell Home Assistant what entities this card depends on
    getEntities() {
      return this._dependencies || [];
    }
  }

  customElements.define("todo-reset-card", TodoResetCard);

  // Ensure card registration happens after customElements are available
  (async () => {
    while (!window.customCards) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    window.customCards.push({
      type: CARD_TYPE_RAW,
      name: "Todo Reset Card",
      description: "A custom todo list card with auto-reset functionality",
      preview: true,
    });
  })();
}
