if (customElements.get("todo-reset-card")) {
  console.debug("todo-reset-card already registered");
} else {
  class TodoResetCard extends HTMLElement {
    // ... existing card code ...
  }

  customElements.define("todo-reset-card", TodoResetCard);

  // Register card for Lovelace
  const panelConfig = document.createElement('ha-panel-lovelace');
  if (!panelConfig.lovelace?.resources) {
    window.customCards = window.customCards || [];
    window.customCards.push({
      type: "todo-reset-card",
      name: "Todo Reset Card",
      description: "A custom todo list card with auto-reset functionality",
      preview: false,
    });
  }
}