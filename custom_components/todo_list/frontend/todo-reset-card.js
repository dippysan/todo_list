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
      this.config = config;
      this._render();
    }

    configChanged(newConfig) {
      const event = new CustomEvent("config-changed", {
        detail: { config: newConfig },
        bubbles: true,
        composed: true,
      });
      this.dispatchEvent(event);
    }

    _render() {
      if (!this.config || !this._hass) return;

      // Clear the shadow root
      while (this.shadowRoot.firstChild) {
        this.shadowRoot.removeChild(this.shadowRoot.firstChild);
      }

      // Define the schema for ha-form
      const schema = [
        {
          name: "entity",
          selector: {
            entity: {
              domain: "todo_list",
              label: "Todo List Entity",
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
      if (!this.config || !this._hass) return;

      const newConfig = { ...this.config };
      if (ev.detail.value === undefined) {
        delete newConfig[ev.target.key];
      } else {
        newConfig[ev.target.key] = ev.detail.value;
      }

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
      console.log("Hass object:", this._hass);
      this.updateCard();
    }

    async fetchItems() {
      if (!this._hass || !this._config.entity) return [];

      try {
        const result = await this._hass.callWS({
          type: "todo/item/list",
          entity_id: this._config.entity,
        });-
        console.log("Fetched items:", result);
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
        `;

        // Create the card content
        const card = document.createElement("ha-card");
        card.innerHTML = `
          <h1 class="card-header"></h1>
          <div class="card-content">
            <div class="todo-list"></div>
          </div>
        `;

        // Add style and content to shadow root
        this.shadowRoot.appendChild(style);
        this.shadowRoot.appendChild(card);
      }

      const todoEntity = this._hass.states[this._config.entity];
      const header = this.shadowRoot.querySelector(".card-header");
      if (header) {
        const title =
          todoEntity?.attributes?.friendly_name ||
          "Todo List";
        header.textContent = title;
      }

      const todoList = this.shadowRoot.querySelector(".todo-list");
      if (!todoList) return;

      if (!this._config.entity) {
        todoList.innerHTML = `
          <div class="error">
            Please specify a todo entity in the card configuration
          </div>
        `;
        return;
      }

      if (!todoEntity) {
        todoList.innerHTML = `
          <div class="error">
            Entity ${this._config.entity} not found
          </div>
        `;
        return;
      }

      // Fetch items
      const items = await this.fetchItems();

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
            entity_id: this._config.entity,
            item: itemId,
            status: newStatus,
          });

          // Refresh items after update
          this.updateCard();
        };
      });
    }

    setConfig(config) {
      this._config = config;
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
      type: "todo-reset-card",
      name: "Todo Reset Card",
      description: "A custom todo list card with auto-reset functionality",
      preview: true,
    });
  })();
}
