// Define a constant for the card type
const CARD_TYPE_RAW = "todo-reset-card";
const CARD_TYPE = "custom:"+CARD_TYPE_RAW;

if (customElements.get("todo-reset-card")) {
  console.info("todo-reset-card already defined");
} else {
  class TodoResetCardEditor extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
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

      // Clear the shadow root
      while (this.shadowRoot.firstChild) {
        this.shadowRoot.removeChild(this.shadowRoot.firstChild);
      }

      // Define the schema for ha-form
      const schema = [
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

      // Create style element
      const style = document.createElement('style');
      style.textContent = `
        .card-config {
          padding: 16px;
        }
      `;
      this.shadowRoot.appendChild(style);

      // Create container
      const container = document.createElement('div');
      container.className = 'card-config';

      // Create ha-form
      const haForm = document.createElement('ha-form');
      haForm.hass = this._hass;
      haForm.data = this.config;
      haForm.schema = schema;
      haForm.computeLabel = (schema) => schema.selector?.entity?.label || schema.selector?.text?.label || schema.name;
      haForm.addEventListener('value-changed', this._valueChanged.bind(this));

      // Append elements
      container.appendChild(haForm);
      this.shadowRoot.appendChild(container);
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
  }

  customElements.define("todo-reset-card-editor", TodoResetCardEditor);

  class TodoResetCard extends HTMLElement {
    constructor() {
      super();
      this._config = {};
      this._initialized = false;
      this._items = [];
      // Create shadow root
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
      this._hass = hass;
      this.updateCard();
    }

    async fetchItems() {
      if (!this._hass || !this._config || !this._config.entity) {
        return [];
      }

      // Get the source entity ID from our entity's attributes
      const resetEntity = this._hass.states[this._config.entity];
      if (!resetEntity || !resetEntity.attributes.source_entity_id) {
        console.error("Source entity not found in attributes");
        return [];
      }

      const sourceEntityId = resetEntity.attributes.source_entity_id;

      try {
        const result = await this._hass.callWS({
          type: "todo/item/list",
          entity_id: sourceEntityId,
        });
        return result?.items || [];
      } catch (error) {
        console.error("Error fetching todo items:", error);
        return [];
      }
    }

    async updateCard() {
      if (!this._hass || !this._config) return;

      if (!this._initialized) {
        this._initialized = true;

        // Create the styles
        const style = document.createElement("style");
        style.textContent = `
          :host {
            --item-spacing: 12px;
            --text-color: var(--primary-text-color);
          }

          .card-header {
            padding: 16px 16px 0;
            font-size: 18px;
            font-weight: 500;
            color: var(--text-color);
          }

          .todo-list {
            display: flex;
            flex-direction: column;
            gap: var(--item-spacing);
            padding: 16px;
          }

          .todo-item {
            padding: 12px 0;
            cursor: pointer;
            color: var(--text-color);
            font-size: 14px;
            border-bottom: 1px solid var(--divider-color);
            transition: all 0.2s ease-in-out;
          }

          .todo-item:hover {
            color: var(--primary-color);
          }

          .todo-item.done {
            --text-color: rgb(95, 99, 104);
            color: var(--text-color) !important;
            text-decoration: line-through;
          }

          .todo-item:last-child {
            border-bottom: none;
          }

          .error {
            color: var(--error-color, red);
            padding: 8px 16px;
            font-style: italic;
          }

          .card-actions {
            padding: 8px 16px;
            display: flex;
            justify-content: flex-end;
          }
        `;

        // Create the card content
        const card = document.createElement("ha-card");
        card.innerHTML = `
          <h1 class="card-header"></h1>
          <div class="card-content">
            <div class="todo-list"></div>
          </div>
          <div class="card-actions">
            <mwc-button>Reset All Items</mwc-button>
          </div>
        `;

        // Add style and content to shadow root
        this.shadowRoot.appendChild(style);
        this.shadowRoot.appendChild(card);

        // Add event listener for reset button
        this.shadowRoot.querySelector('mwc-button').addEventListener('click', this._handleReset.bind(this));
      }

      const resetEntity = this._hass.states[this._config.entity];
      if (!resetEntity) {
        this.shadowRoot.querySelector(".todo-list").innerHTML = `
          <div class="error">
            Entity ${this._config.entity} not found
          </div>
        `;
        return;
      }

      // Get the source entity ID
      const sourceEntityId = resetEntity.attributes.source_entity_id;
      if (!sourceEntityId) {
        this.shadowRoot.querySelector(".todo-list").innerHTML = `
          <div class="error">
            Source entity not defined in ${this._config.entity}
          </div>
        `;
        return;
      }

      // Update header
      const header = this.shadowRoot.querySelector(".card-header");
      if (header) {
        // Get the source entity
        const sourceEntity = this._hass.states[sourceEntityId];

        // Use the source entity's friendly name if available
        if (sourceEntity && sourceEntity.attributes.friendly_name) {
          header.textContent = sourceEntity.attributes.friendly_name;
        } else {
          // Fall back to the source entity ID without the domain
          header.textContent = sourceEntityId.split('.')[1].replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }
      }

      // Fetch items
      const items = await this.fetchItems();
      const todoList = this.shadowRoot.querySelector(".todo-list");

      if (!items.length) {
        todoList.innerHTML = `
          <div class="todo-item">
            No items in todo list
          </div>
        `;
        return;
      }

      // Sort items: TODO first, then DONE
      const sortedItems = [...items].sort((a, b) => {
        if (a.status === b.status) return 0;
        return a.status === "needs_action" ? -1 : 1;
      });

      todoList.innerHTML = sortedItems
        .map(
          (item) => `
        <div class="todo-item ${item.status === "completed" ? "done" : ""}"
             data-item-id="${item.uid}">
          ${item.summary}
        </div>
      `
        )
        .join("");

      todoList.querySelectorAll(".todo-item").forEach((element) => {
        element.onclick = async () => {
          const itemId = element.dataset.itemId;
          const item = sortedItems.find((i) => i.uid === itemId);
          if (!item) return;

          const newStatus =
            item.status === "completed" ? "needs_action" : "completed";

          await this._hass.callService("todo", "update_item", {
            entity_id: sourceEntityId,
            item: itemId,
            status: newStatus,
          });

          // Refresh items after update
          this.updateCard();
        };
      });
    }

    _handleReset() {
      if (!this._hass || !this._config || !this._config.entity) return;

      this._hass.callService("todo_list", "reset_now", {});

      // Refresh the card after a short delay
      setTimeout(() => this.updateCard(), 1000);
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
