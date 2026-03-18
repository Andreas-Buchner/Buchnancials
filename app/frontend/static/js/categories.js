(function () {
  const expenseBody = document.querySelector("#expense-categories-table tbody");
  const incomeBody = document.querySelector("#income-categories-table tbody");

  const createExpenseBtn = document.getElementById("create-expense-category-btn");
  const createIncomeBtn = document.getElementById("create-income-category-btn");
  const newExpenseInput = document.getElementById("new-expense-category-name");
  const newIncomeInput = document.getElementById("new-income-category-name");
  const newExpenseColorInput = document.getElementById("new-expense-category-color");
  const newIncomeColorInput = document.getElementById("new-income-category-color");
  const defaultColorByType = {
    expense: "#b88f7b",
    income: "#6d97ad",
  };

  function renderCategoryRow(category) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><input type="text" class="cat-name" value="${category.name}" /></td>
      <td><input type="color" class="cat-color" value="${category.color || defaultColorByType[category.type] || "#7f8c99"}" /></td>
      <td><input type="checkbox" class="cat-active" ${category.active ? "checked" : ""} /></td>
      <td><button class="btn-secondary cat-save">Speichern</button></td>
    `;

    row.querySelector(".cat-save").addEventListener("click", async () => {
      try {
        const payload = {
          name: row.querySelector(".cat-name").value,
          type: category.type,
          color: row.querySelector(".cat-color").value,
          active: row.querySelector(".cat-active").checked,
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

    return row;
  }

  async function loadCategories() {
    const categories = await window.Buchnancials.jsonFetch("/categories?include_inactive=true");
    expenseBody.innerHTML = "";
    incomeBody.innerHTML = "";

    categories
      .filter((category) => category.type === "expense")
      .forEach((category) => expenseBody.appendChild(renderCategoryRow(category)));
    categories
      .filter((category) => category.type === "income")
      .forEach((category) => incomeBody.appendChild(renderCategoryRow(category)));
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
      body: JSON.stringify({ name, type, color: colorInput?.value || defaultColorByType[type], active: true }),
    });
      input.value = "";
      if (colorInput) {
        colorInput.value = defaultColorByType[type];
      }
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
