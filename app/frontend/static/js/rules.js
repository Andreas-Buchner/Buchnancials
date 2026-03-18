(function () {
  const tableBody = document.querySelector("#rules-table tbody");
  const createBtn = document.getElementById("create-rule-btn");
  const applyExistingBtn = document.getElementById("apply-existing-rules-btn");
  const categorySelect = document.getElementById("rule-category");
  const ruleCounterpartyFilter = document.getElementById("rule-counterparty-filter");
  const ruleAmountSign = document.getElementById("rule-amount-sign");
  let categories = [];

  function fieldLabel(value) {
    if (value === "description") {
      return "Beschreibung";
    }
    if (value === "counterparty_name") {
      return "Gegenpartei";
    }
    if (value === "raw_text") {
      return "Buchungstext (roh)";
    }
    return value;
  }

  function typeLabel(value) {
    if (value === "contains") {
      return "enthält";
    }
    if (value === "equals") {
      return "entspricht";
    }
    if (value === "starts_with") {
      return "beginnt mit";
    }
    if (value === "regex") {
      return "Muster (RegEx)";
    }
    return value;
  }

  function amountSignLabel(value) {
    if (value === "negative") {
      return "nur Ausgaben";
    }
    if (value === "positive") {
      return "nur Einnahmen";
    }
    return "alle";
  }

  function categoryOptions(selectedId) {
    const options = [`<option value="">(keine)</option>`];
    categories.forEach((category) => {
      options.push(
        `<option value="${category.id}" ${Number(selectedId) === Number(category.id) ? "selected" : ""}>${category.name} (${category.type === "income" ? "Einnahmen" : "Ausgaben"})</option>`
      );
    });
    return options.join("");
  }

  async function loadCategories() {
    categories = await window.Buchnancials.jsonFetch("/categories?include_inactive=false");
    categorySelect.innerHTML = categoryOptions(null);
  }

  async function loadRules() {
    const rules = await window.Buchnancials.jsonFetch("/rules");
    tableBody.innerHTML = "";

    rules.forEach((rule) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td><input type="text" class="rule-name" value="${rule.name}" /></td>
        <td>
          <select class="rule-field">
            <option value="description" ${rule.match_field === "description" ? "selected" : ""}>${fieldLabel("description")}</option>
            <option value="counterparty_name" ${rule.match_field === "counterparty_name" ? "selected" : ""}>${fieldLabel("counterparty_name")}</option>
            <option value="raw_text" ${rule.match_field === "raw_text" ? "selected" : ""}>${fieldLabel("raw_text")}</option>
          </select>
        </td>
        <td>
          <select class="rule-type">
            <option value="contains" ${rule.match_type === "contains" ? "selected" : ""}>${typeLabel("contains")}</option>
            <option value="equals" ${rule.match_type === "equals" ? "selected" : ""}>${typeLabel("equals")}</option>
            <option value="starts_with" ${rule.match_type === "starts_with" ? "selected" : ""}>${typeLabel("starts_with")}</option>
            <option value="regex" ${rule.match_type === "regex" ? "selected" : ""}>${typeLabel("regex")}</option>
          </select>
        </td>
        <td><input type="text" class="rule-value" value="${rule.match_value}" /></td>
        <td><input type="text" class="rule-counterparty-filter" value="${rule.counterparty_filter || ""}" /></td>
        <td>
          <select class="rule-amount-sign">
            <option value="any" ${(rule.amount_sign || "any") === "any" ? "selected" : ""}>${amountSignLabel("any")}</option>
            <option value="negative" ${rule.amount_sign === "negative" ? "selected" : ""}>${amountSignLabel("negative")}</option>
            <option value="positive" ${rule.amount_sign === "positive" ? "selected" : ""}>${amountSignLabel("positive")}</option>
          </select>
        </td>
        <td><select class="rule-category">${categoryOptions(rule.category_id)}</select></td>
        <td><input type="checkbox" class="rule-exclude" ${rule.exclude_transaction ? "checked" : ""} /></td>
        <td><input type="checkbox" class="rule-active" ${rule.active ? "checked" : ""} /></td>
        <td>
          <button class="btn-secondary rule-save">Speichern</button>
          <button class="btn-secondary rule-delete">Löschen</button>
        </td>
      `;

      row.querySelector(".rule-save").addEventListener("click", async () => {
        try {
          const payload = {
            name: row.querySelector(".rule-name").value,
            match_field: row.querySelector(".rule-field").value,
            match_type: row.querySelector(".rule-type").value,
            match_value: row.querySelector(".rule-value").value,
            counterparty_filter: row.querySelector(".rule-counterparty-filter").value || null,
            amount_sign: row.querySelector(".rule-amount-sign").value,
            category_id: row.querySelector(".rule-category").value
              ? Number(row.querySelector(".rule-category").value)
              : null,
            exclude_transaction: row.querySelector(".rule-exclude").checked,
            active: row.querySelector(".rule-active").checked,
            priority: rule.priority,
          };
          await window.Buchnancials.jsonFetch(`/rules/${rule.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          await loadRules();
        } catch (err) {
          window.Buchnancials.notify(err.message, "error");
        }
      });

      row.querySelector(".rule-delete").addEventListener("click", async () => {
        if (!window.confirm("Soll diese Regel wirklich gelöscht werden?")) {
          return;
        }
        try {
          await window.Buchnancials.jsonFetch(`/rules/${rule.id}`, { method: "DELETE" });
          await loadRules();
        } catch (err) {
          window.Buchnancials.notify(err.message, "error");
        }
      });

      tableBody.appendChild(row);
    });
  }

  createBtn.addEventListener("click", async () => {
    const payload = {
      name: document.getElementById("rule-name").value,
      match_field: document.getElementById("rule-field").value,
      match_type: document.getElementById("rule-type").value,
      match_value: document.getElementById("rule-value").value,
      counterparty_filter: ruleCounterpartyFilter.value || null,
      amount_sign: ruleAmountSign.value,
      category_id: document.getElementById("rule-category").value
        ? Number(document.getElementById("rule-category").value)
        : null,
      exclude_transaction: document.getElementById("rule-exclude").checked,
      priority: 100,
      active: true,
    };

    if (!payload.name.trim() || !payload.match_value.trim()) {
      window.Buchnancials.notify("Bitte Regelname und Suchwert ausfüllen.", "error");
      return;
    }

    try {
      await window.Buchnancials.jsonFetch("/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await loadRules();
    } catch (err) {
      window.Buchnancials.notify(err.message, "error");
    }
  });

  applyExistingBtn.addEventListener("click", async () => {
    try {
      applyExistingBtn.disabled = true;
      const result = await window.Buchnancials.jsonFetch("/rules/apply?only_uncategorized=true", {
        method: "POST",
      });
      window.Buchnancials.notify(
        `Regeln angewendet: ${result.updated_transactions} aktualisiert, ${result.categorized_transactions} kategorisiert, ${result.excluded_transactions} ignoriert.`,
        "success",
      );
    } catch (err) {
      window.Buchnancials.notify(err.message, "error");
    } finally {
      applyExistingBtn.disabled = false;
    }
  });

  Promise.all([loadCategories(), loadRules()]).catch((err) => window.Buchnancials.notify(err.message, "error"));
})();
