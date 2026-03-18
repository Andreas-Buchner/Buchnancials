(function () {
  const staged = new Map();
  const saveBtn = document.getElementById("save-staged-btn");
  const discardBtn = document.getElementById("discard-staged-btn");
  const indicator = document.getElementById("unsaved-indicator");

  const modal = document.getElementById("decision-modal");
  const modalTitle = document.getElementById("decision-title");
  const modalMessage = document.getElementById("decision-message");
  const modalActions = document.getElementById("decision-actions");
  if (modal) {
    modal.hidden = true;
    modal.setAttribute("hidden", "");
  }

  function normalizeCategoryLabel(value) {
    if (!value || !value.trim()) {
      return "Nicht kategorisiert";
    }
    return value
      .replace(/\s+\((income|expense|einnahme|ausgabe)(,\s*inactive|,\s*inaktiv)?\)$/i, "")
      .trim();
  }

  function buildSankey(rows) {
    const income = new Map();
    const expense = new Map();
    let totalIncome = 0;
    let totalExpenses = 0;

    rows.forEach((row) => {
      if (row.excluded) {
        return;
      }
      const amount = Number(row.amount || 0);
      const category = normalizeCategoryLabel(row.category_name || "Nicht kategorisiert");
      if (amount >= 0) {
        income.set(category, (income.get(category) || 0) + amount);
        totalIncome += amount;
      } else {
        expense.set(category, (expense.get(category) || 0) + Math.abs(amount));
        totalExpenses += Math.abs(amount);
      }
    });

    const collisions = new Set([...income.keys()].filter((name) => expense.has(name)));
    const incomeNode = (name) => (collisions.has(name) ? `${name} (Einnahme)` : name);
    const expenseNode = (name) => (collisions.has(name) ? `${name} (Ausgabe)` : name);

    const links = [];
    [...income.keys()]
      .sort()
      .forEach((category) => {
        const value = Number((income.get(category) || 0).toFixed(2));
        if (value > 0) {
          links.push({ source: incomeNode(category), target: "Saldo", value });
        }
      });

    [...expense.keys()]
      .sort()
      .forEach((category) => {
        const value = Number((expense.get(category) || 0).toFixed(2));
        if (value > 0) {
          links.push({ source: "Saldo", target: expenseNode(category), value });
        }
      });

    const net = Number((totalIncome - totalExpenses).toFixed(2));
    if (net > 0) {
      links.push({ source: "Saldo", target: "Überschuss", value: net, color: "#2e7d32" });
    } else if (net < 0) {
      links.push({ source: "Fehlbetrag", target: "Saldo", value: Math.abs(net), color: "#b71c1c" });
    }

    const incomeNodes = [...income.keys()].sort().map(incomeNode);
    const expenseNodes = [...expense.keys()].sort().map(expenseNode);
    let nodes = [...incomeNodes, "Saldo", ...expenseNodes];
    if (net > 0) {
      nodes.push("Überschuss");
    }
    if (net < 0) {
      nodes = ["Fehlbetrag", ...nodes];
    }
    return { nodes, links };
  }

  function renderSankey(el, sankey) {
    if (!window.Plotly) {
      return;
    }
    if (!Array.isArray(sankey.nodes) || sankey.nodes.length === 0) {
      el.innerHTML = "<small>Für diesen Zeitraum liegen keine Daten vor.</small>";
      return;
    }

    const index = new Map();
    sankey.nodes.forEach((label, i) => index.set(label, i));
    const source = [];
    const target = [];
    const value = [];
    const color = [];
    sankey.links.forEach((link) => {
      source.push(index.get(link.source));
      target.push(index.get(link.target));
      value.push(link.value);
      color.push(link.color || "rgba(10,108,99,0.32)");
    });

    window.Plotly.react(
      el,
      [
        {
          type: "sankey",
          arrangement: "snap",
          node: {
            label: sankey.nodes,
            pad: 12,
            thickness: 15,
            line: { color: "rgba(80,80,80,0.35)", width: 0.5 },
          },
          link: { source, target, value, color },
        },
      ],
      {
        margin: { l: 8, r: 8, t: 8, b: 8 },
        paper_bgcolor: "rgba(0,0,0,0)",
        font: { size: 12 },
      },
      { displayModeBar: false, responsive: true }
    );
  }

  function parseRowAmount(row) {
    const amountCell = row.querySelector("td:nth-child(2)");
    const raw = amountCell ? amountCell.textContent.trim() : "0";
    const normalized = raw.replace(/\s/g, "").replace(",", ".");
    const value = Number(normalized);
    return Number.isFinite(value) ? value : 0;
  }

  function parseRowSplits(row) {
    try {
      const splits = JSON.parse(row.dataset.splits || "[]");
      if (!Array.isArray(splits) || splits.length === 0) {
        return [];
      }
      return splits.map((split) => ({
        amount: Number(split.amount),
        category_name: normalizeCategoryLabel(split.category_name || "Nicht kategorisiert"),
      }));
    } catch (err) {
      return [];
    }
  }

  function collectMonthRows(monthBlock) {
    const rows = [];
    monthBlock.querySelectorAll("tr.tx-row").forEach((row) => {
      const excluded = row.querySelector(".tx-excluded")?.checked || false;
      const splitItems = parseRowSplits(row);
      if (splitItems.length > 0) {
        splitItems.forEach((split) => {
          rows.push({ amount: split.amount, excluded, category_name: split.category_name });
        });
        return;
      }

      const categorySelect = row.querySelector(".tx-category");
      const selectedOption = categorySelect ? categorySelect.options[categorySelect.selectedIndex] : null;
      rows.push({
        amount: parseRowAmount(row),
        excluded,
        category_name: normalizeCategoryLabel(selectedOption ? selectedOption.textContent : "Nicht kategorisiert"),
      });
    });
    return rows;
  }

  function collectRowsInContainer(container) {
    const rows = [];
    container.querySelectorAll(".month-block").forEach((monthBlock) => {
      rows.push(...collectMonthRows(monthBlock));
    });
    return rows;
  }

  function refreshSankeyFromDom() {
    document.querySelectorAll(".month-block").forEach((monthBlock) => {
      const chart = monthBlock.querySelector(".month-sankey");
      if (!chart) {
        return;
      }
      renderSankey(chart, buildSankey(collectMonthRows(monthBlock)));
    });

    document.querySelectorAll(".quarter-block").forEach((quarterBlock) => {
      const chart = quarterBlock.querySelector(".quarter-sankey");
      if (!chart) {
        return;
      }
      renderSankey(chart, buildSankey(collectRowsInContainer(quarterBlock)));
    });

    document.querySelectorAll(".year-block").forEach((yearBlock) => {
      const chart = yearBlock.querySelector(".year-sankey");
      if (!chart) {
        return;
      }
      renderSankey(chart, buildSankey(collectRowsInContainer(yearBlock)));
    });
  }

  function ensureEntry(id) {
    if (!staged.has(id)) {
      staged.set(id, { id: Number(id) });
    }
    return staged.get(id);
  }

  function cleanupEntry(id) {
    const entry = staged.get(id);
    if (!entry) {
      return;
    }
    const keys = Object.keys(entry).filter((k) => k !== "id");
    if (keys.length === 0) {
      staged.delete(id);
    }
  }

  function refreshIndicator() {
    indicator.textContent = `Ungespeicherte Änderungen: ${staged.size}`;
  }

  function setFieldDirtyClass(field, isDirty) {
    if (!field) {
      return;
    }
    field.classList.toggle("field-dirty", isDirty);
  }

  function updateRowDirtyState(row) {
    const category = row.querySelector(".tx-category");
    const memo = row.querySelector(".tx-memo");
    const excluded = row.querySelector(".tx-excluded");
    const categoryDirty = category ? (category.value || "") !== (category.dataset.initial || "") : false;
    const memoDirty = memo ? memo.value !== (memo.dataset.initial || "") : false;
    const excludedDirty = excluded
      ? excluded.checked !== (excluded.dataset.initial === "1")
      : false;

    setFieldDirtyClass(category, categoryDirty);
    setFieldDirtyClass(memo, memoDirty);
    setFieldDirtyClass(excluded, excludedDirty);
    row.classList.toggle("tx-row-dirty", categoryDirty || memoDirty || excludedDirty);
  }

  function setRowInitialStateFromCurrent(row) {
    const category = row.querySelector(".tx-category");
    const memo = row.querySelector(".tx-memo");
    const excluded = row.querySelector(".tx-excluded");
    if (category) {
      category.dataset.initial = category.value || "";
    }
    if (memo) {
      memo.dataset.initial = memo.value || "";
    }
    if (excluded) {
      excluded.dataset.initial = excluded.checked ? "1" : "0";
    }
    updateRowDirtyState(row);
  }

  function setFieldChange(id, field, value) {
    const entry = ensureEntry(id);
    entry[field] = value;
    cleanupEntry(id);
    refreshIndicator();
  }

  function getCategoryOptionsHtml(row) {
    const categorySelect = row.querySelector(".tx-category");
    if (!categorySelect) {
      return "";
    }
    return Array.from(categorySelect.options)
      .filter((option) => option.value !== "")
      .map((option) => `<option value="${option.value}">${option.textContent}</option>`)
      .join("");
  }

  function buildSplitLine(categoryOptionsHtml, split = null) {
    const wrapper = document.createElement("div");
    wrapper.className = "split-line";
    wrapper.innerHTML = `
      <select class="split-category">${categoryOptionsHtml}</select>
      <input class="split-amount" type="number" step="0.01" placeholder="Betrag" />
      <button class="btn-secondary split-remove-line">Entfernen</button>
    `;
    if (split) {
      wrapper.querySelector(".split-category").value = String(split.category_id);
      wrapper.querySelector(".split-amount").value = Number(split.amount).toFixed(2);
    }
    return wrapper;
  }

  function updateSplitBalance(lineContainer, txAmount, balanceEl, saveSplitBtn) {
    const values = Array.from(lineContainer.querySelectorAll(".split-amount"))
      .map((input) => Number(input.value))
      .filter((value) => Number.isFinite(value));
    const total = Number(values.reduce((sum, value) => sum + value, 0).toFixed(2));
    const remaining = Number((txAmount - total).toFixed(2));

    balanceEl.textContent = `Verteilt: ${total.toFixed(2)} | Offen: ${remaining.toFixed(2)}`;
    const valid = Math.abs(remaining) <= 0.01 && values.length > 0;
    balanceEl.classList.toggle("ok", valid);
    balanceEl.classList.toggle("error", !valid);
    saveSplitBtn.disabled = !valid;
  }

  async function openSplitEditor(transactionId) {
    const editorRow = document.querySelector(`.split-editor-row[data-split-editor-for="${transactionId}"]`);
    if (!editorRow) {
      return;
    }

    document.querySelectorAll(".split-editor-row").forEach((row) => {
      if (row !== editorRow) {
        row.hidden = true;
      }
    });
    editorRow.hidden = false;

    const lineContainer = editorRow.querySelector(".split-lines");
    const addBtn = editorRow.querySelector(".split-add-line");
    const saveSplitBtn = editorRow.querySelector(".split-save");
    const cancelBtn = editorRow.querySelector(".split-cancel");
    const splitBalanceEl = editorRow.querySelector(".split-balance");
    const txRow = document.querySelector(`tr.tx-row[data-transaction-id="${transactionId}"]`);
    if (!txRow) {
      return;
    }
    const txAmount = Number(txRow?.dataset.transactionAmount || 0);
    const categoryOptionsHtml = getCategoryOptionsHtml(txRow);

    const splitData = await window.Buchnancials.jsonFetch(`/transactions/${transactionId}/splits`);
    lineContainer.innerHTML = "";
    if (splitData.splits.length === 0) {
      lineContainer.appendChild(buildSplitLine(categoryOptionsHtml));
    } else {
      splitData.splits.forEach((split) => {
        lineContainer.appendChild(buildSplitLine(categoryOptionsHtml, split));
      });
    }

    function bindSplitLineEvents() {
      lineContainer.querySelectorAll(".split-line").forEach((line) => {
        const amountInput = line.querySelector(".split-amount");
        const removeBtn = line.querySelector(".split-remove-line");
        amountInput.oninput = () => updateSplitBalance(lineContainer, txAmount, splitBalanceEl, saveSplitBtn);
        removeBtn.onclick = () => {
          line.remove();
          updateSplitBalance(lineContainer, txAmount, splitBalanceEl, saveSplitBtn);
        };
      });
      updateSplitBalance(lineContainer, txAmount, splitBalanceEl, saveSplitBtn);
    }

    bindSplitLineEvents();

    addBtn.onclick = () => {
      lineContainer.appendChild(buildSplitLine(categoryOptionsHtml));
      bindSplitLineEvents();
    };

    cancelBtn.onclick = () => {
      editorRow.hidden = true;
    };

    saveSplitBtn.onclick = async () => {
      const splitItems = Array.from(lineContainer.querySelectorAll(".split-line"))
        .map((line) => ({
          category_id: Number(line.querySelector(".split-category").value),
          amount: Number(line.querySelector(".split-amount").value),
        }))
        .filter((item) => Number.isFinite(item.category_id) && Number.isFinite(item.amount));

      const splitTotal = Number(splitItems.reduce((sum, item) => sum + item.amount, 0).toFixed(2));
      if (Math.abs(splitTotal - txAmount) > 0.01) {
        window.Buchnancials.notify(
          `Die Summe der Aufteilung (${splitTotal.toFixed(2)}) muss dem Transaktionsbetrag (${txAmount.toFixed(2)}) entsprechen.`,
          "error"
        );
        return;
      }

      try {
        await window.Buchnancials.jsonFetch(`/transactions/${transactionId}/splits`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ splits: splitItems }),
        });
        window.Buchnancials.notify("Aufteilung gespeichert.", "success");
        window.location.reload();
      } catch (err) {
        window.Buchnancials.notify(err.message, "error");
      }
    };
  }

  function askDecision({ title, message, actions }) {
    if (!modal || !modalTitle || !modalMessage || !modalActions) {
      const fallback = window.confirm(message);
      return Promise.resolve(fallback ? actions[actions.length - 1].value : actions[0].value);
    }
    return new Promise((resolve) => {
      modalTitle.textContent = title;
      modalMessage.textContent = message;
      modalActions.innerHTML = "";
      actions.forEach((action) => {
        const button = document.createElement("button");
        button.className = action.variant === "primary" ? "btn-primary" : "btn-secondary";
        button.textContent = action.label;
        button.addEventListener("click", () => {
          modal.hidden = true;
          modal.setAttribute("hidden", "");
          resolve(action.value);
        });
        modalActions.appendChild(button);
      });
      modal.hidden = false;
      modal.removeAttribute("hidden");
    });
  }

  function setInitialStateFromCurrentDom() {
    document.querySelectorAll("tr.tx-row").forEach((row) => {
      setRowInitialStateFromCurrent(row);
    });
  }

  document.querySelectorAll("tr.tx-row").forEach((row) => {
    const id = row.dataset.transactionId;
    const category = row.querySelector(".tx-category");
    const memo = row.querySelector(".tx-memo");
    const excluded = row.querySelector(".tx-excluded");

    if (!category || !memo || !excluded) {
      return;
    }

    category.addEventListener("change", () => {
      const initial = category.dataset.initial || "";
      const current = category.value || "";
      if (current === initial) {
        const entry = ensureEntry(id);
        delete entry.category_id;
        cleanupEntry(id);
      } else {
        setFieldChange(id, "category_id", current === "" ? null : Number(current));
      }
      refreshIndicator();
      updateRowDirtyState(row);
      refreshSankeyFromDom();
    });

    memo.addEventListener("input", () => {
      const initial = memo.dataset.initial || "";
      const current = memo.value;
      if (current === initial) {
        const entry = ensureEntry(id);
        delete entry.memo;
        cleanupEntry(id);
      } else {
        setFieldChange(id, "memo", current);
      }
      refreshIndicator();
      updateRowDirtyState(row);
    });

    excluded.addEventListener("change", () => {
      const initial = excluded.dataset.initial === "1";
      const current = excluded.checked;
      if (current === initial) {
        const entry = ensureEntry(id);
        delete entry.excluded;
        cleanupEntry(id);
      } else {
        setFieldChange(id, "excluded", current);
      }
      refreshIndicator();
      updateRowDirtyState(row);
      refreshSankeyFromDom();
    });
  });

  document.querySelectorAll(".split-manage-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const transactionId = button.dataset.transactionId;
      await openSplitEditor(transactionId);
    });
  });

  async function saveChanges({ reload = false } = {}) {
    if (staged.size === 0) {
      return true;
    }
    const updates = Array.from(staged.values());
    const changedIds = updates.map((item) => Number(item.id));
    const response = await window.Buchnancials.jsonFetch("/transactions/batch", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    });
    if (response.errors && response.errors.length > 0) {
      throw new Error(`Speichern abgeschlossen, aber ${response.errors.length} Fehler sind aufgetreten.`);
    }
    changedIds.forEach((id) => {
      const row = document.querySelector(`tr.tx-row[data-transaction-id="${id}"]`);
      if (row) {
        setRowInitialStateFromCurrent(row);
      }
    });
    staged.clear();
    refreshIndicator();
    window.Buchnancials.notify(
      changedIds.length === 1 ? "1 Änderung gespeichert." : `${changedIds.length} Änderungen gespeichert.`,
      "success"
    );
    if (reload) {
      window.location.reload();
    }
    return true;
  }

  async function resolveUnsaved(actionAfterResolve) {
    if (staged.size === 0) {
      actionAfterResolve();
      return;
    }

    const choice = await askDecision({
      title: "Ungespeicherte Änderungen",
      message: "Es gibt ungespeicherte Änderungen. Was soll vor dem Fortfahren passieren?",
      actions: [
        { value: "stay", label: "Hier bleiben", variant: "secondary" },
        { value: "discard", label: "Verwerfen", variant: "secondary" },
        { value: "save", label: "Speichern und weiter", variant: "primary" },
      ],
    });

    if (choice === "stay") {
      return;
    }
    if (choice === "discard") {
      staged.clear();
      refreshIndicator();
      actionAfterResolve();
      return;
    }
    if (choice === "save") {
      try {
        await saveChanges({ reload: false });
      } catch (err) {
        window.Buchnancials.notify(err.message, "error");
        return;
      }
      actionAfterResolve();
    }
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      try {
        await saveChanges({ reload: false });
      } catch (err) {
        window.Buchnancials.notify(err.message, "error");
      }
    });
  }

  if (discardBtn) {
    discardBtn.addEventListener("click", async () => {
      if (staged.size === 0) {
        return;
      }
      const choice = await askDecision({
        title: "Ungespeicherte Änderungen verwerfen?",
        message: "Dadurch werden alle ungespeicherten Änderungen auf dieser Seite entfernt.",
        actions: [
          { value: "cancel", label: "Abbrechen", variant: "secondary" },
          { value: "discard", label: "Verwerfen", variant: "primary" },
        ],
      });
      if (choice !== "discard") {
        return;
      }
      staged.clear();
      refreshIndicator();
      window.location.reload();
    });
  }

  window.addEventListener("beforeunload", (event) => {
    if (staged.size === 0) {
      return;
    }
    event.preventDefault();
    event.returnValue = "";
  });

  document.querySelectorAll("[data-nav-link]").forEach((link) => {
    link.addEventListener("click", async (event) => {
      if (staged.size === 0) {
        return;
      }
      event.preventDefault();
      const href = link.getAttribute("href");
      await resolveUnsaved(() => {
        window.location.href = href;
      });
    });
  });

  document.querySelectorAll("details").forEach((details) => {
    details.addEventListener("toggle", () => {
      window.setTimeout(refreshSankeyFromDom, 0);
    });
  });

  setInitialStateFromCurrentDom();
  staged.clear();
  refreshIndicator();
  refreshSankeyFromDom();
})();
