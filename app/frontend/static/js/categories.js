(function () {
  const expenseBody = document.querySelector("#expense-categories-table tbody");
  const incomeBody = document.querySelector("#income-categories-table tbody");

  const createExpenseBtn = document.getElementById("create-expense-category-btn");
  const createIncomeBtn = document.getElementById("create-income-category-btn");
  const newExpenseInput = document.getElementById("new-expense-category-name");
  const newIncomeInput = document.getElementById("new-income-category-name");
  const newExpenseColorInput = document.getElementById("new-expense-category-color");
  const newIncomeColorInput = document.getElementById("new-income-category-color");
  const colorPalettes = {
    expense: [
      "#7f0000",
      "#ff3b30",
      "#a30015",
      "#ff6b6b",
      "#b34700",
      "#ff9500",
      "#8c2f00",
      "#ffb347",
      "#6a040f",
      "#ff1744",
      "#9d0208",
      "#f9844a",
      "#c1121f",
      "#ffd166",
      "#e65100",
      "#f94144",
      "#5f0f40",
      "#f3722c",
      "#b5651d",
      "#ffe066",
    ],
    income: [
      "#0b6e4f",
      "#2ecc71",
      "#14532d",
      "#84cc16",
      "#0f766e",
      "#2dd4bf",
      "#006d77",
      "#00b4d8",
      "#1d4ed8",
      "#60a5fa",
      "#1e3a8a",
      "#7c3aed",
      "#6b7280",
      "#4b5563",
      "#8b5e34",
      "#a16207",
      "#3f6212",
      "#14b8a6",
      "#5c7cfa",
      "#3b7a57",
    ],
  };
  const defaultColorByType = {
    expense: colorPalettes.expense[0],
    income: colorPalettes.income[0],
  };

  function getPaletteColor(type, index) {
    const palette = colorPalettes[type];
    if (!palette || !palette.length) {
      return "#7f8c99";
    }
    return palette[index % palette.length];
  }

  function nextColorForType(type, categories) {
    const count = categories.filter((category) => category.type === type).length;
    return getPaletteColor(type, count);
  }

  function askDecision({ title, message, actions }) {
    return window.Buchnancials.askDecision({ title, message, actions });
  }

  function renderCategoryRow(category, fallbackColor) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><input type="text" class="cat-name" value="${category.name}" /></td>
      <td><input type="color" class="cat-color" value="${category.color || fallbackColor || defaultColorByType[category.type] || "#7f8c99"}" /></td>
      <td class="cat-actions">
        <button class="btn-secondary cat-save">Speichern</button>
        <button class="btn-secondary cat-delete">Löschen</button>
      </td>
    `;

    row.querySelector(".cat-save").addEventListener("click", async () => {
      try {
        const payload = {
          name: row.querySelector(".cat-name").value,
          type: category.type,
          color: row.querySelector(".cat-color").value,
        };
        await window.Buchnancials.jsonFetch(`/categories/${category.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        await loadCategories();
      } catch (err) {
        window.Buchnancials.notify(err.message, "error");
      }
    });

    row.querySelector(".cat-delete").addEventListener("click", async () => {
      try {
        const usage = await window.Buchnancials.jsonFetch(`/categories/${category.id}/usage`);
        let message = `Soll die Kategorie "${category.name}" wirklich gelöscht werden?`;
        if (usage.affected_transactions > 0) {
          message += `\n\nAchtung: ${usage.affected_transactions} Transaktionen nutzen diese Kategorie. Diese werden auf "Ohne Kategorie" gesetzt.`;
        }
        if (usage.linked_rules > 0) {
          message += `\nHinweis: ${usage.linked_rules} Regeln verlieren dabei ihre Kategoriezuordnung.`;
        }
        const decision = await askDecision({
          title: "Kategorie löschen?",
          message,
          actions: [
            { label: "Abbrechen", value: "cancel", variant: "secondary" },
            { label: "Löschen", value: "delete", variant: "primary" },
          ],
        });
        if (decision !== "delete") {
          return;
        }

        const result = await window.Buchnancials.jsonFetch(`/categories/${category.id}`, {
          method: "DELETE",
        });
        window.Buchnancials.notify(
          `Kategorie gelöscht. ${result.affected_transactions} Transaktionen wurden auf "Ohne Kategorie" gesetzt.`,
          "success"
        );
        await loadCategories();
      } catch (err) {
        window.Buchnancials.notify(err.message, "error");
      }
    });

    return row;
  }

  async function loadCategories() {
    const categories = await window.Buchnancials.jsonFetch("/categories");
    expenseBody.innerHTML = "";
    incomeBody.innerHTML = "";

    const expenseCategories = categories.filter((category) => category.type === "expense");
    const incomeCategories = categories.filter((category) => category.type === "income");

    expenseCategories.forEach((category, index) =>
      expenseBody.appendChild(renderCategoryRow(category, getPaletteColor("expense", index)))
    );
    incomeCategories.forEach((category, index) =>
      incomeBody.appendChild(renderCategoryRow(category, getPaletteColor("income", index)))
    );

    if (newExpenseColorInput) {
      newExpenseColorInput.value = nextColorForType("expense", categories);
    }
    if (newIncomeColorInput) {
      newIncomeColorInput.value = nextColorForType("income", categories);
    }
  }

  async function createCategory(type, input, colorInput) {
    const name = input.value.trim();
    if (!name) {
      window.Buchnancials.notify("Bitte einen Kategorienamen eingeben.", "error");
      return;
    }
    await window.Buchnancials.jsonFetch("/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type, color: colorInput?.value || defaultColorByType[type] }),
    });
    input.value = "";
    await loadCategories();
  }

  createExpenseBtn.addEventListener("click", async () => {
    try {
      await createCategory("expense", newExpenseInput, newExpenseColorInput);
    } catch (err) {
      window.Buchnancials.notify(err.message, "error");
    }
  });

  createIncomeBtn.addEventListener("click", async () => {
    try {
      await createCategory("income", newIncomeInput, newIncomeColorInput);
    } catch (err) {
      window.Buchnancials.notify(err.message, "error");
    }
  });

  loadCategories();
})();
