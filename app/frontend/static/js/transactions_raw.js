(function () {
  const tableBody = document.getElementById("raw-transactions-body");
  if (!tableBody) {
    return;
  }

  const searchInput = document.getElementById("raw-filter-search");
  const typeFilter = document.getElementById("raw-filter-type");
  const categoryFilter = document.getElementById("raw-filter-category");
  const excludedFilter = document.getElementById("raw-filter-excluded");
  const visibleCount = document.getElementById("raw-visible-count");
  const sortButtons = Array.from(document.querySelectorAll(".raw-sort-btn"));

  const transactions = parseJsonFromScript("raw-transactions-data");
  const categories = parseJsonFromScript("raw-categories-data");
  const categoriesById = new Map(categories.map((category) => [Number(category.id), category]));

  const state = {
    search: "",
    type: "all",
    category: "all",
    excluded: "all",
    sortBy: "booking_date",
    sortDir: "desc",
  };

  function parseJsonFromScript(id) {
    const el = document.getElementById(id);
    if (!el) {
      return [];
    }
    try {
      const parsed = JSON.parse(el.textContent || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function normalizeCategoryLabel(value) {
    return window.Buchnancials.normalizeCategoryLabel(value);
  }

  function typeLabel(categoryType) {
    return categoryType === "income" ? "Einnahmen" : "Ausgaben";
  }

  function roundMoney(value) {
    return window.Buchnancials.roundMoney(value);
  }

  function parseSplitAmount(value) {
    return window.Buchnancials.parseMoneyInput(value);
  }

  function normalizeSplitItem(split) {
    return window.Buchnancials.normalizeSplitItem(split);
  }

  function getEffectiveSplitItems(tx) {
    const source = Array.isArray(tx.splits) ? tx.splits : [];
    const parsed = source
      .map((split) => normalizeSplitItem(split))
      .filter((split) => Number.isFinite(split.amount));
    tx.splits = parsed;
    return parsed.length > 1 ? parsed : [];
  }

  function getActiveSplitItems(tx, splitItems = null) {
    const source = Array.isArray(splitItems) ? splitItems : getEffectiveSplitItems(tx);
    return source.filter((split) => !split.excluded);
  }

  function effectiveSplitCount(tx) {
    return getEffectiveSplitItems(tx).length;
  }

  function matchesAmountTypeFilter(tx) {
    const amount = Number(tx.amount || 0);
    if (state.type === "income") {
      return amount >= 0;
    }
    if (state.type === "expense") {
      return amount < 0;
    }
    return true;
  }

  function matchesCategoryFilter(tx) {
    if (state.category === "all") {
      return true;
    }

    const splitItems = getEffectiveSplitItems(tx);
    const activeSplitItems = getActiveSplitItems(tx, splitItems);
    if (state.category === "none") {
      if (splitItems.length > 0) {
        return activeSplitItems.some((item) => item.category_id === null);
      }
      return tx.category_id === null || tx.category_id === undefined;
    }

    const targetCategoryId = Number(state.category);
    if (!Number.isFinite(targetCategoryId)) {
      return true;
    }
    if (splitItems.length > 0) {
      return activeSplitItems.some((item) => Number(item.category_id) === targetCategoryId);
    }
    return Number(tx.category_id) === targetCategoryId;
  }

  function matchesExcludedFilter(tx) {
    const excluded = Boolean(tx.excluded);
    if (state.excluded === "active") {
      return !excluded;
    }
    if (state.excluded === "excluded") {
      return excluded;
    }
    return true;
  }

  function matchesSearchFilter(tx) {
    if (!state.search) {
      return true;
    }

    const splitParts = getEffectiveSplitItems(tx).flatMap((split) => [
      split.category_name,
      split.amount,
      split.excluded ? "ignoriert" : "",
    ]);

    const haystack = [
      tx.booking_date,
      tx.description,
      tx.counterparty_name,
      tx.memo,
      tx.category_name,
      ...splitParts,
    ]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");
    return haystack.includes(state.search);
  }

  function sortValue(tx, sortBy) {
    if (sortBy === "booking_date") {
      return normalizeText(tx.booking_date);
    }
    if (sortBy === "amount") {
      return Number(tx.amount || 0);
    }
    if (sortBy === "description") {
      return normalizeText(tx.description).toLowerCase();
    }
    if (sortBy === "counterparty_name") {
      return normalizeText(tx.counterparty_name).toLowerCase();
    }
    if (sortBy === "memo") {
      return normalizeText(tx.memo).toLowerCase();
    }
    if (sortBy === "category_name") {
      const splitItems = getEffectiveSplitItems(tx);
      if (splitItems.length > 0) {
        return `aufgeteilt ${splitItems.length}`;
      }
      return normalizeCategoryLabel(tx.category_name || "Ohne Kategorie").toLowerCase();
    }
    if (sortBy === "split_count") {
      return effectiveSplitCount(tx);
    }
    if (sortBy === "excluded") {
      return Boolean(tx.excluded) ? 1 : 0;
    }
    return normalizeText(tx.booking_date);
  }

  function compareTransactions(a, b) {
    const left = sortValue(a, state.sortBy);
    const right = sortValue(b, state.sortBy);
    let result = 0;
    if (typeof left === "number" && typeof right === "number") {
      result = left - right;
    } else {
      result = String(left).localeCompare(String(right), "de", { sensitivity: "base" });
    }
    if (result === 0) {
      result = Number(a.id) - Number(b.id);
    }
    return state.sortDir === "asc" ? result : -result;
  }

  function getVisibleTransactions() {
    return transactions
      .filter((tx) => matchesAmountTypeFilter(tx) && matchesCategoryFilter(tx) && matchesExcludedFilter(tx) && matchesSearchFilter(tx))
      .sort(compareTransactions);
  }

  function buildCategorySelect(tx) {
    const select = document.createElement("select");
    select.className = "tx-category tx-category-select";

    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "Ohne Kategorie";
    select.appendChild(emptyOption);

    const selectedId = tx.category_id === null || tx.category_id === undefined ? null : Number(tx.category_id);
    const allowedCategories = categories
      .filter((category) => {
        if (selectedId !== null && Number(category.id) === selectedId) {
          return true;
        }
        if (Number(tx.amount || 0) >= 0) {
          return category.type === "income";
        }
        return category.type === "expense";
      })
      .sort((a, b) => {
        if (a.type !== b.type) {
          return a.type.localeCompare(b.type);
        }
        return a.name.localeCompare(b.name, "de", { sensitivity: "base" });
      });

    allowedCategories.forEach((category) => {
      const option = document.createElement("option");
      option.value = String(category.id);
      option.textContent = `${category.name} (${typeLabel(category.type)})`;
      option.dataset.color = category.color || "";
      select.appendChild(option);
    });

    select.value = selectedId === null ? "" : String(selectedId);
    return select;
  }

  function getCategoryOptionsHtmlFromSelect(select) {
    return window.Buchnancials.getSelectOptionsHtml(select);
  }

  function buildSplitLine(categoryOptionsHtml, split = null) {
    return window.Buchnancials.buildSplitLine(categoryOptionsHtml, split);
  }

  function updateSplitBalance(lineContainer, txAmount, balanceEl, saveSplitBtn) {
    return window.Buchnancials.updateSplitBalance(lineContainer, txAmount, balanceEl, saveSplitBtn);
  }

  function findSplitEditorRowForTxId(transactionId) {
    return tableBody.querySelector(`.split-editor-row[data-split-editor-for="${transactionId}"]`);
  }

  function renderSplitPreview(previewList, splitItems) {
    window.Buchnancials.renderSplitPreview(previewList, splitItems);
  }

  function updateRowVisualState(row, tx) {
    const splitItems = getEffectiveSplitItems(tx);
    const activeSplitItems = getActiveSplitItems(tx, splitItems);
    const isSplit = splitItems.length > 0 || row.classList.contains("tx-row-split-editing");
    const isExcluded = Boolean(tx.excluded);

    row.classList.toggle("tx-row-split", isSplit);
    row.classList.toggle("tx-row-excluded", isExcluded);

    const categorySelect = row.querySelector(".tx-category");
    const splitCategoryNote = row.querySelector(".tx-split-category-note");
    if (categorySelect) {
      categorySelect.hidden = isSplit;
      categorySelect.disabled = isSplit;
    }

    if (splitCategoryNote) {
      if (isSplit) {
        splitCategoryNote.textContent = `Aufgeteilt in ${splitItems.length} Posten`;
      } else {
        splitCategoryNote.textContent = "";
      }
      splitCategoryNote.hidden = !isSplit;
    }

    const splitButton = row.querySelector(".split-manage-btn");
    if (splitButton) {
      splitButton.textContent = isSplit ? `${splitItems.length} Posten` : "Aufteilen";
    }

    renderSplitPreview(row.querySelector(".split-preview-list"), splitItems);

    const hasUncategorizedSplitComponent =
      isSplit && activeSplitItems.some((split) => split.category_id === null);
    const isUncategorized =
      !isExcluded &&
      ((isSplit && hasUncategorizedSplitComponent) ||
        (!isSplit && categorySelect && (categorySelect.value || "") === ""));
    row.classList.toggle("tx-row-uncategorized", Boolean(isUncategorized));

    const splitEditorRow = findSplitEditorRowForTxId(tx.id);
    if (splitEditorRow) {
      splitEditorRow.classList.toggle("tx-row-excluded", isExcluded);
    }
  }

  async function patchTransaction(transactionId, payload) {
    return window.Buchnancials.patchTransaction(transactionId, payload);
  }

  async function fetchTransactionSplits(transactionId) {
    return window.Buchnancials.fetchTransactionSplits(transactionId);
  }

  async function openSplitEditor(tx, txRow) {
    const transactionId = Number(tx.id);
    const editorRow = findSplitEditorRowForTxId(transactionId);
    if (!editorRow) {
      return;
    }

    tableBody.querySelectorAll(".split-editor-row").forEach((row) => {
      if (row !== editorRow) {
        row.hidden = true;
        const oldTxRow = tableBody.querySelector(`tr.tx-row[data-transaction-id="${row.dataset.splitEditorFor}"]`);
        if (oldTxRow) {
          oldTxRow.classList.remove("tx-row-split-editing");
          const oldTx = transactions.find((item) => Number(item.id) === Number(row.dataset.splitEditorFor));
          if (oldTx) {
            updateRowVisualState(oldTxRow, oldTx);
          }
        }
      }
    });

    editorRow.hidden = false;
    txRow.classList.add("tx-row-split-editing");
    updateRowVisualState(txRow, tx);

    const lineContainer = editorRow.querySelector(".split-lines");
    const addBtn = editorRow.querySelector(".split-add-line");
    const saveSplitBtn = editorRow.querySelector(".split-save");
    const cancelBtn = editorRow.querySelector(".split-cancel");
    const splitBalanceEl = editorRow.querySelector(".split-balance");
    const categoryOptionsHtml = getCategoryOptionsHtmlFromSelect(txRow.querySelector(".tx-category"));
    const txAmount = Number(tx.amount || 0);

    if (!lineContainer || !addBtn || !saveSplitBtn || !cancelBtn || !splitBalanceEl) {
      editorRow.hidden = true;
      txRow.classList.remove("tx-row-split-editing");
      updateRowVisualState(txRow, tx);
      return;
    }

    let splitData;
    try {
      splitData = await fetchTransactionSplits(transactionId);
    } catch (err) {
      editorRow.hidden = true;
      txRow.classList.remove("tx-row-split-editing");
      updateRowVisualState(txRow, tx);
      window.Buchnancials.notify(err.message, "error");
      return;
    }

    lineContainer.innerHTML = "";
    if (splitData.splits.length <= 1) {
      let firstSplit = null;
      let amountA = roundMoney(txAmount / 2);
      if (splitData.splits.length === 1) {
        const existing = splitData.splits[0] || {};
        const existingAmount = Number(existing.amount);
        amountA = Number.isFinite(existingAmount) ? roundMoney(existingAmount) : amountA;
        firstSplit = {
          category_id: existing.category_id ?? null,
          amount: amountA,
          excluded: Boolean(existing.excluded),
        };
      }
      const amountB = roundMoney(txAmount - amountA);
      const first = buildSplitLine(categoryOptionsHtml, firstSplit);
      const second = buildSplitLine(categoryOptionsHtml, { category_id: null, amount: amountB, excluded: false });
      first.querySelector(".split-amount").value = amountA.toFixed(2);
      second.querySelector(".split-amount").value = amountB.toFixed(2);
      lineContainer.appendChild(first);
      lineContainer.appendChild(second);
    } else {
      splitData.splits.forEach((split) => {
        lineContainer.appendChild(buildSplitLine(categoryOptionsHtml, split));
      });
    }

    let splitBalanceFrame = null;
    const scheduleSplitBalanceUpdate = () => {
      if (splitBalanceFrame !== null) {
        window.cancelAnimationFrame(splitBalanceFrame);
      }
      splitBalanceFrame = window.requestAnimationFrame(() => {
        splitBalanceFrame = null;
        updateSplitBalance(lineContainer, txAmount, splitBalanceEl, saveSplitBtn);
      });
    };

    lineContainer.oninput = (event) => {
      if (event.target && event.target.classList.contains("split-amount")) {
        scheduleSplitBalanceUpdate();
      }
    };

    lineContainer.onchange = (event) => {
      if (event.target && event.target.classList.contains("split-excluded")) {
        scheduleSplitBalanceUpdate();
      }
    };

    lineContainer.onclick = (event) => {
      const removeBtn = event.target.closest(".split-remove-line");
      if (!removeBtn) {
        return;
      }
      const line = removeBtn.closest(".split-line");
      if (line) {
        line.remove();
      }
      scheduleSplitBalanceUpdate();
    };

    scheduleSplitBalanceUpdate();

    addBtn.onclick = (event) => {
      event.preventDefault();
      lineContainer.appendChild(buildSplitLine(categoryOptionsHtml));
      scheduleSplitBalanceUpdate();
    };

    cancelBtn.onclick = (event) => {
      event.preventDefault();
      editorRow.hidden = true;
      txRow.classList.remove("tx-row-split-editing");
      updateRowVisualState(txRow, tx);
    };

    saveSplitBtn.onclick = async (event) => {
      event.preventDefault();
      const splitLines = Array.from(lineContainer.querySelectorAll(".split-line"));
      const splitItems = [];

      for (const line of splitLines) {
        const rawCategory = line.querySelector(".split-category")?.value || "";
        const categoryId = rawCategory === "" ? null : Number(rawCategory);
        const amount = parseSplitAmount(line.querySelector(".split-amount")?.value);
        const excludedValue = line.querySelector(".split-excluded")?.checked || false;

        if (categoryId !== null && !Number.isFinite(categoryId)) {
          window.Buchnancials.notify("Bitte eine gültige Kategorie für alle Teilzeilen auswählen.", "error");
          return;
        }
        if (amount === null) {
          window.Buchnancials.notify("Bitte in jeder Teilzeile einen gültigen Betrag eingeben.", "error");
          return;
        }

        splitItems.push({
          category_id: categoryId,
          amount,
          excluded: excludedValue,
        });
      }

      if (splitItems.length === 1) {
        window.Buchnancials.notify("Eine Aufteilung benötigt mindestens 2 Posten.", "error");
        return;
      }

      const splitTotal = Number(splitItems.reduce((sum, item) => sum + item.amount, 0).toFixed(2));
      if (splitItems.length > 1 && Math.abs(splitTotal - txAmount) > 0.01) {
        window.Buchnancials.notify(
          `Die Summe der Aufteilung (${splitTotal.toFixed(2)}) muss dem Transaktionsbetrag (${txAmount.toFixed(2)}) entsprechen.`,
          "error"
        );
        return;
      }

      saveSplitBtn.disabled = true;
      try {
        await window.Buchnancials.jsonFetch(`/transactions/${transactionId}/splits`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ splits: splitItems }),
        });
        const refreshedSplitData = await fetchTransactionSplits(transactionId);
        tx.splits = refreshedSplitData.splits;
        editorRow.hidden = true;
        txRow.classList.remove("tx-row-split-editing");
        updateRowVisualState(txRow, tx);
        renderTable();
        window.Buchnancials.notify("Aufteilung gespeichert.", "success");
      } catch (err) {
        window.Buchnancials.notify(err.message, "error");
      } finally {
        saveSplitBtn.disabled = false;
      }
    };
  }

  function buildRow(tx) {
    const row = document.createElement("tr");
    row.className = "tx-row";
    row.dataset.transactionId = String(tx.id);

    const dateCell = document.createElement("td");
    dateCell.dataset.label = "Datum";
    dateCell.textContent = normalizeText(tx.booking_date);
    row.appendChild(dateCell);

    const amountCell = document.createElement("td");
    amountCell.dataset.label = "Betrag";
    const amountValue = Number(tx.amount || 0);
    amountCell.className = amountValue >= 0 ? "amount-positive" : "amount-negative";
    amountCell.textContent = amountValue.toFixed(2);
    row.appendChild(amountCell);

    const descriptionCell = document.createElement("td");
    descriptionCell.dataset.label = "Beschreibung";
    descriptionCell.textContent = normalizeText(tx.description);
    row.appendChild(descriptionCell);

    const counterpartyCell = document.createElement("td");
    counterpartyCell.dataset.label = "Auftraggeber";
    counterpartyCell.textContent = normalizeText(tx.counterparty_name);
    row.appendChild(counterpartyCell);

    const memoCell = document.createElement("td");
    memoCell.dataset.label = "Notiz";
    const memoInput = document.createElement("input");
    memoInput.type = "text";
    memoInput.value = tx.memo || "";
    memoInput.className = "tx-memo tx-memo-input";
    memoCell.appendChild(memoInput);
    row.appendChild(memoCell);

    const categoryCell = document.createElement("td");
    categoryCell.dataset.label = "Kategorie";
    categoryCell.className = "tx-category-cell";
    const categorySelect = buildCategorySelect(tx);
    categoryCell.appendChild(categorySelect);
    const splitCategoryNote = document.createElement("div");
    splitCategoryNote.className = "tx-split-category-note";
    splitCategoryNote.hidden = true;
    categoryCell.appendChild(splitCategoryNote);
    row.appendChild(categoryCell);

    const splitCell = document.createElement("td");
    splitCell.dataset.label = "Aufteilung";
    splitCell.className = "tx-split-cell";
    const splitButton = document.createElement("button");
    splitButton.type = "button";
    splitButton.className = "btn-secondary split-manage-btn";
    splitButton.textContent = "Aufteilen";
    splitCell.appendChild(splitButton);
    const splitPreview = document.createElement("ul");
    splitPreview.className = "split-preview-list";
    splitPreview.hidden = true;
    splitCell.appendChild(splitPreview);
    row.appendChild(splitCell);

    const excludedCell = document.createElement("td");
    excludedCell.dataset.label = "Ignorieren";
    excludedCell.className = "raw-center-cell";
    const excludedCheckbox = document.createElement("input");
    excludedCheckbox.type = "checkbox";
    excludedCheckbox.checked = Boolean(tx.excluded);
    excludedCheckbox.className = "tx-excluded";
    excludedCell.appendChild(excludedCheckbox);
    row.appendChild(excludedCell);

    const editorRow = document.createElement("tr");
    editorRow.className = "split-editor-row";
    editorRow.dataset.splitEditorFor = String(tx.id);
    editorRow.hidden = true;
    editorRow.innerHTML = `
      <td colspan="8">
        <div class="split-editor">
          <div class="split-lines"></div>
          <p class="split-balance"></p>
          <div class="split-editor-actions">
            <button class="btn-secondary split-add-line">Teilzeile hinzufügen</button>
            <button class="btn-primary split-save">Aufteilung speichern</button>
            <button class="btn-secondary split-cancel">Abbrechen</button>
          </div>
          <small class="split-hint">
            Eine Aufteilung braucht mindestens 2 Posten. Die Summe der Teilbeträge muss exakt dem Transaktionsbetrag entsprechen.
            Einzelne Teilzeilen können ignoriert werden. Wenn alle Teilzeilen entfernt werden, wird die Aufteilung aufgehoben.
          </small>
        </div>
      </td>
    `;

    updateRowVisualState(row, tx);

    memoInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        memoInput.blur();
      }
    });

    memoInput.addEventListener("blur", async () => {
      const nextMemo = memoInput.value;
      const previousMemo = tx.memo || "";
      if (nextMemo === previousMemo) {
        return;
      }

      memoInput.disabled = true;
      tx.memo = nextMemo;
      try {
        await patchTransaction(tx.id, { memo: nextMemo });
      } catch (err) {
        tx.memo = previousMemo;
        memoInput.value = previousMemo;
        window.Buchnancials.notify(err.message, "error");
      } finally {
        memoInput.disabled = false;
      }
    });

    categorySelect.addEventListener("change", async () => {
      const nextCategoryId = categorySelect.value === "" ? null : Number(categorySelect.value);
      const previousCategoryId = tx.category_id === null || tx.category_id === undefined ? null : Number(tx.category_id);
      if (nextCategoryId === previousCategoryId) {
        updateRowVisualState(row, tx);
        return;
      }

      categorySelect.disabled = true;
      tx.category_id = nextCategoryId;
      const category = nextCategoryId === null ? null : categoriesById.get(nextCategoryId) || null;
      tx.category_name = category ? category.name : null;
      tx.category_type = category ? category.type : null;
      tx.category_color = category ? category.color : null;
      try {
        await patchTransaction(tx.id, { category_id: nextCategoryId });
        updateRowVisualState(row, tx);
        scheduleRenderTable();
      } catch (err) {
        tx.category_id = previousCategoryId;
        const previousCategory = previousCategoryId === null ? null : categoriesById.get(previousCategoryId) || null;
        tx.category_name = previousCategory ? previousCategory.name : null;
        tx.category_type = previousCategory ? previousCategory.type : null;
        tx.category_color = previousCategory ? previousCategory.color : null;
        categorySelect.value = previousCategoryId === null ? "" : String(previousCategoryId);
        updateRowVisualState(row, tx);
        window.Buchnancials.notify(err.message, "error");
      } finally {
        categorySelect.disabled = false;
      }
    });

    excludedCheckbox.addEventListener("change", async () => {
      const nextExcluded = excludedCheckbox.checked;
      const previousExcluded = Boolean(tx.excluded);
      if (nextExcluded === previousExcluded) {
        updateRowVisualState(row, tx);
        return;
      }

      excludedCheckbox.disabled = true;
      tx.excluded = nextExcluded;
      try {
        await patchTransaction(tx.id, { excluded: nextExcluded });
        updateRowVisualState(row, tx);
        scheduleRenderTable();
      } catch (err) {
        tx.excluded = previousExcluded;
        excludedCheckbox.checked = previousExcluded;
        updateRowVisualState(row, tx);
        window.Buchnancials.notify(err.message, "error");
      } finally {
        excludedCheckbox.disabled = false;
      }
    });

    splitButton.addEventListener("click", async () => {
      await openSplitEditor(tx, row);
    });

    const fragment = document.createDocumentFragment();
    fragment.appendChild(row);
    fragment.appendChild(editorRow);
    return fragment;
  }

  function updateSortButtons() {
    sortButtons.forEach((button) => {
      if (!button.dataset.label) {
        button.dataset.label = button.textContent || "";
      }
      const label = button.dataset.label;
      if (button.dataset.sort === state.sortBy) {
        button.textContent = `${label} ${state.sortDir === "asc" ? "↑" : "↓"}`;
      } else {
        button.textContent = label;
      }
    });
  }

  function renderTable() {
    const visible = getVisibleTransactions();
    tableBody.innerHTML = "";

    if (visible.length === 0) {
      const emptyRow = document.createElement("tr");
      const emptyCell = document.createElement("td");
      emptyCell.colSpan = 8;
      emptyCell.textContent = "Keine Transaktionen für diese Filter gefunden.";
      emptyCell.className = "raw-empty-cell";
      emptyRow.appendChild(emptyCell);
      tableBody.appendChild(emptyRow);
    } else {
      visible.forEach((tx) => tableBody.appendChild(buildRow(tx)));
    }

    if (visibleCount) {
      visibleCount.textContent = `${visible.length} von ${transactions.length} Transaktionen sichtbar`;
    }
    updateSortButtons();
  }

  let renderFrame = null;
  function scheduleRenderTable() {
    if (renderFrame !== null) {
      window.cancelAnimationFrame(renderFrame);
    }
    renderFrame = window.requestAnimationFrame(() => {
      renderFrame = null;
      renderTable();
    });
  }

  function populateCategoryFilterOptions() {
    if (!categoryFilter) {
      return;
    }

    const staticOptions = [
      { value: "all", label: "Alle Kategorien" },
      { value: "none", label: "Ohne Kategorie" },
    ];

    categoryFilter.innerHTML = "";
    staticOptions.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      categoryFilter.appendChild(option);
    });

    categories
      .slice()
      .sort((a, b) => {
        if (a.type !== b.type) {
          return a.type.localeCompare(b.type);
        }
        return a.name.localeCompare(b.name, "de", { sensitivity: "base" });
      })
      .forEach((category) => {
        const option = document.createElement("option");
        option.value = String(category.id);
        option.textContent = `${category.name} (${typeLabel(category.type)})`;
        categoryFilter.appendChild(option);
      });
  }

  transactions.forEach((tx) => {
    tx.id = Number(tx.id);
    tx.amount = Number(tx.amount || 0);
    tx.category_id = tx.category_id === null || tx.category_id === undefined ? null : Number(tx.category_id);
    tx.excluded = Boolean(tx.excluded);
    tx.memo = tx.memo || "";
    tx.category_name = tx.category_name || null;
    tx.splits = Array.isArray(tx.splits) ? tx.splits : [];
  });

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      state.search = (searchInput.value || "").trim().toLowerCase();
      scheduleRenderTable();
    });
  }

  if (typeFilter) {
    typeFilter.addEventListener("change", () => {
      state.type = typeFilter.value || "all";
      scheduleRenderTable();
    });
  }

  if (categoryFilter) {
    categoryFilter.addEventListener("change", () => {
      state.category = categoryFilter.value || "all";
      scheduleRenderTable();
    });
  }

  if (excludedFilter) {
    excludedFilter.addEventListener("change", () => {
      state.excluded = excludedFilter.value || "all";
      scheduleRenderTable();
    });
  }

  sortButtons.forEach((button) => {
    if (!button.dataset.label) {
      button.dataset.label = button.textContent || "";
    }
    button.addEventListener("click", () => {
      const sortBy = button.dataset.sort || "booking_date";
      if (state.sortBy === sortBy) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortBy = sortBy;
        state.sortDir = sortBy === "amount" || sortBy === "split_count" ? "desc" : "asc";
      }
      scheduleRenderTable();
    });
  });

  populateCategoryFilterOptions();
  renderTable();
})();
