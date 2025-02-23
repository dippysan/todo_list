if (customElements.get("todo-reset-card")) {
  console.info("todo-reset-card already defined");
} else {
  class TodoResetCard extends HTMLElement {
    constructor() {
      super();
      this._config = {};
      this._initialized = false;
      this._items = [];
      // Create shadow root
      this.attachShadow({ mode: "open" });
    }

    set hass(hass) {
      this._hass = hass;
      this.updateCard();
    }

    async fetchItems() {
      if (!this._hass || !this._config.entity) return [];

      try {
        const result = await this._hass.callWS({
          type: "todo/item/list",
          entity_id: this._config.entity,
        });
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

      // Update the title every time
      const todoEntity = this._hass.states[this._config.entity];
      console.log("friendly_name", todoEntity?.attributes?.friendly_name);
      const header = this.shadowRoot.querySelector(".card-header");
      if (header) {
        const title =
          todoEntity?.attributes?.friendly_name ||
          this._config.title ||
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
      this._config = {
        title: "Todo List",
        ...config,
      };
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
      preview: false,
    });
  })();
}
