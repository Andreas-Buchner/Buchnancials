(function () {
  const tableBody = document.querySelector("#rules-table tbody");
  const createBtn = document.getElementById("create-rule-btn");
  const applyExistingBtn = document.getElementById("apply-existing-rules-btn");
  const categorySelect = document.getElementById("rule-category");
  const ruleAmountSign = document.getElementById("rule-amount-sign");
  const ruleOperator = document.getElementById("rule-condition-operator");
  const ruleSecondField = document.getElementById("rule-second-field");
  const ruleSecondType = document.getElementById("rule-second-type");
  const ruleSecondValue = document.getElementById("rule-second-value");
  let categories = [];

  function fieldLabel(value) {
    if (value === "description") {
      return "Beschreibung";
    }
    if (value === "counterparty_name") {
      return "Auftraggeber";
    }
    if (value === "raw_text") {
      return "Rohtext";
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
      return "Aufwände";
    }
    if (value === "positive") {
      return "Erträge";
    }
    return value;
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

  function fieldOptions(selectedValue = "", withEmpty = false) {
    const options = [];
    if (withEmpty) {
      options.push(`<option value="" ${selectedValue === "" ? "selected" : ""}>(kein Feld)</option>`);
    }
    ["description", "counterparty_name", "raw_text"].forEach((field) => {
      options.push(
        `<option value="${field}" ${selectedValue === field ? "selected" : ""}>${fieldLabel(field)}</option>`
      );
    });
    return options.join("");
  }

  function typeOptions(selectedValue = "contains") {
    return ["contains", "equals", "starts_with", "regex"]
      .map((type) => `<option value="${type}" ${selectedValue === type ? "selected" : ""}>${typeLabel(type)}</option>`)
      .join("");
  }

  function operatorOptions(selectedValue = "and") {
    return `
      <option value="and" ${selectedValue === "and" ? "selected" : ""}>UND</option>
      <option value="or" ${selectedValue === "or" ? "selected" : ""}>ODER</option>
    `;
  }

  function normalizeSecondCondition(field, type, value) {
    const cleanedValue = (value || "").trim();
    if (!cleanedValue) {
      return {
        second_match_field: null,
        second_match_type: null,
        second_match_value: null,
      };
    }
    const cleanedField = (field || "").trim();
    const cleanedType = (type || "").trim();
    if (!cleanedField || !cleanedType) {
      throw new Error("Für die zweite Bedingung bitte Feld und Typ auswählen.");
    }
    return {
      second_match_field: cleanedField,
      second_match_type: cleanedType,
      second_match_value: cleanedValue,
    };
  }

  async function loadCategories() {
    categories = await window.Buchnancials.jsonFetch("/categories");
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
          <select class="rule-amount-sign">
            <option value="negative" ${rule.amount_sign !== "positive" ? "selected" : ""}>${amountSignLabel("negative")}</option>
            <option value="positive" ${rule.amount_sign === "positive" ? "selected" : ""}>${amountSignLabel("positive")}</option>
          </select>
        </td>
        <td><select class="rule-field">${fieldOptions(rule.match_field)}</select></td>
        <td><select class="rule-type">${typeOptions(rule.match_type)}</select></td>
        <td><input type="text" class="rule-value" value="${rule.match_value}" /></td>
        <td><select class="rule-condition-operator">${operatorOptions(rule.condition_operator || "and")}</select></td>
        <td><select class="rule-second-field">${fieldOptions(rule.second_match_field || "", true)}</select></td>
        <td><select class="rule-second-type">${typeOptions(rule.second_match_type || "contains")}</select></td>
        <td><input type="text" class="rule-second-value" value="${rule.second_match_value || ""}" /></td>
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
          const secondCondition = normalizeSecondCondition(
            row.querySelector(".rule-second-field").value,
            row.querySelector(".rule-second-type").value,
            row.querySelector(".rule-second-value").value
          );

          const payload = {
            name: row.querySelector(".rule-name").value,
            match_field: row.querySelector(".rule-field").value,
            match_type: row.querySelector(".rule-type").value,
            match_value: row.querySelector(".rule-value").value,
            condition_operator: row.querySelector(".rule-condition-operator").value,
            ...secondCondition,
            counterparty_filter: null,
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
    try {
      const secondCondition = normalizeSecondCondition(ruleSecondField.value, ruleSecondType.value, ruleSecondValue.value);
      const payload = {
        name: document.getElementById("rule-name").value,
        match_field: document.getElementById("rule-field").value,
        match_type: document.getElementById("rule-type").value,
        match_value: document.getElementById("rule-value").value,
        condition_operator: ruleOperator.value,
        ...secondCondition,
        counterparty_filter: null,
        amount_sign: ruleAmountSign.value,
        category_id: document.getElementById("rule-category").value
          ? Number(document.getElementById("rule-category").value)
          : null,
        exclude_transaction: document.getElementById("rule-exclude").checked,
        priority: 100,
        active: true,
      };

      if (!payload.name.trim() || !payload.match_value.trim()) {
        window.Buchnancials.notify("Bitte Regelname und den ersten Suchwert ausfüllen.", "error");
        return;
      }

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
        "success"
      );
    } catch (err) {
      window.Buchnancials.notify(err.message, "error");
    } finally {
      applyExistingBtn.disabled = false;
    }
  });

  Promise.all([loadCategories(), loadRules()]).catch((err) => window.Buchnancials.notify(err.message, "error"));
})();
