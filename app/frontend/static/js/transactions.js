(function () {
  const BALANCE_NODE_LABEL = window.Buchnancials.sankeyBalanceNodeLabel;
  const sankeyExport = window.Buchnancials.createPlotExportButtonManager({
    chartIdPrefix: "overview-sankey",
    getChartContainer: (el) => el.closest(".sankey-container") || el.parentElement,
    getFilename: (el) => {
      const detailsBlock = el.closest("details");
      const label = detailsBlock?.querySelector(":scope > summary .period-label")?.textContent?.trim() || "uebersicht";
      const slug = window.Buchnancials.slugifyFilenamePart(label) || "sankey";
      return `buchnancials-sankey-${slug}.jpg`;
    },
    getExportTitle: (el) => {
      const detailsBlock = el.closest("details");
      const label = detailsBlock?.querySelector(":scope > summary .period-label")?.textContent?.trim();
      return label ? `Sankey · ${label}` : "Sankey";
    },
    successMessage: "Sankey als JPG exportiert.",
    errorMessage: "Sankey-Export fehlgeschlagen.",
  });

  function buildSankey(rows) {
    const income = new Map();
    const expense = new Map();
    const incomeColor = new Map();
    const expenseColor = new Map();
    let totalIncome = 0;
    let totalExpenses = 0;

    rows.forEach((row) => {
      if (row.excluded) {
        return;
      }
      const amount = Number(row.amount || 0);
      const category = window.Buchnancials.normalizeCategoryLabel(row.category_name || "Ohne Kategorie");
      const categoryColor = window.Buchnancials.isHexColor(row.category_color) ? row.category_color : null;
      if (amount >= 0) {
        income.set(category, (income.get(category) || 0) + amount);
        if (!incomeColor.has(category) && categoryColor) {
          incomeColor.set(category, categoryColor);
        }
        totalIncome += amount;
      } else {
        expense.set(category, (expense.get(category) || 0) + Math.abs(amount));
        if (!expenseColor.has(category) && categoryColor) {
          expenseColor.set(category, categoryColor);
        }
        totalExpenses += Math.abs(amount);
      }
    });

    const collisions = new Set([...income.keys()].filter((name) => expense.has(name)));
    const incomeNode = (name) => (collisions.has(name) ? `${name} (Einnahme)` : name);
    const expenseNode = (name) => (collisions.has(name) ? `${name} (Ausgabe)` : name);
    const sortCategoriesAlphabetically = (totals) =>
      [...totals.keys()].sort((left, right) =>
        String(left || "").localeCompare(String(right || ""), "de", { sensitivity: "base" })
      );

    const links = [];
    const incomeCategories = sortCategoriesAlphabetically(income);
    const expenseCategories = sortCategoriesAlphabetically(expense);

    incomeCategories
      .forEach((category) => {
        const value = Number((income.get(category) || 0).toFixed(2));
        if (value > 0) {
          links.push({
            source: incomeNode(category),
            target: BALANCE_NODE_LABEL,
            value,
            color: window.Buchnancials.hexToRgba(incomeColor.get(category), 0.4),
          });
        }
      });

    expenseCategories
      .forEach((category) => {
        const value = Number((expense.get(category) || 0).toFixed(2));
        if (value > 0) {
          links.push({
            source: BALANCE_NODE_LABEL,
            target: expenseNode(category),
            value,
            color: window.Buchnancials.hexToRgba(expenseColor.get(category), 0.4),
          });
        }
      });

    const net = Number((totalIncome - totalExpenses).toFixed(2));
    if (net > 0) {
      links.push({
        source: BALANCE_NODE_LABEL,
        target: "Überschuss",
        value: net,
        color: "rgba(93, 125, 104, 0.56)",
      });
    } else if (net < 0) {
      links.push({
        source: "Fehlbetrag",
        target: BALANCE_NODE_LABEL,
        value: Math.abs(net),
        color: "rgba(155, 102, 102, 0.56)",
      });
    }

    const incomeNodes = incomeCategories.map(incomeNode);
    const expenseNodes = expenseCategories.map(expenseNode);
    let nodes = [...incomeNodes, BALANCE_NODE_LABEL, ...expenseNodes];
    if (net > 0) {
      nodes.push("Überschuss");
    } else if (net < 0) {
      nodes.push("Fehlbetrag");
    }

    const nodeColors = {};
    income.forEach((_, category) => {
      const label = incomeNode(category);
      nodeColors[label] = incomeColor.get(category) || "#739c8f";
    });
    expense.forEach((_, category) => {
      const label = expenseNode(category);
      nodeColors[label] = expenseColor.get(category) || "#b98c87";
    });
    nodeColors[BALANCE_NODE_LABEL] = "#121212";
    if (net > 0) {
      nodeColors["Überschuss"] = "#5d7d68";
    }
    if (net < 0) {
      nodeColors["Fehlbetrag"] = "#9b6666";
    }

    return { nodes, links, node_colors: nodeColors };
  }

  function summarizeRows(rows) {
    let income = 0;
    let expenses = 0;
    rows.forEach((row) => {
      if (row.excluded) {
        return;
      }
      const amount = Number(row.amount || 0);
      if (amount >= 0) {
        income += amount;
      } else {
        expenses += Math.abs(amount);
      }
    });
    return {
      income,
      expenses,
      saldo: income - expenses,
    };
  }

  function updateSummaryPills(block, totals) {
    const summary = block.querySelector(":scope > summary");
    if (!summary) {
      return;
    }
    const incomePill = summary.querySelector(".summary-pill.income");
    const expensePill = summary.querySelector(".summary-pill.expense");
    const saldoPill = Array.from(summary.querySelectorAll(".summary-pill")).find(
      (pill) => !pill.classList.contains("income") && !pill.classList.contains("expense")
    );
    if (incomePill) {
      incomePill.textContent = `Einnahmen ${window.Buchnancials.formatSankeyCompactEuro(totals.income)}`;
    }
    if (expensePill) {
      expensePill.textContent = `Ausgaben ${window.Buchnancials.formatSankeyCompactEuro(totals.expenses)}`;
    }
    if (saldoPill) {
      saldoPill.textContent = `Saldo ${window.Buchnancials.formatSankeyCompactEuro(totals.saldo)}`;
    }
  }

  function renderSankey(el, sankey) {
    window.Buchnancials.renderSankeyChart(el, sankey, {
      exporter: sankeyExport,
      emptyMessage: "Für diesen Zeitraum liegen keine Daten vor.",
      filenameBase: "uebersicht",
      exportTitle: "Sankey",
      isEmpty: (normalized) => !Array.isArray(normalized.nodes) || normalized.nodes.length === 0,
    });
  }

  function parseRowAmount(row) {
    const amountCell = row.querySelector("td:nth-child(2)");
    const raw = amountCell ? amountCell.textContent.trim() : "0";
    const normalized = raw.replace(/\s/g, "").replace(",", ".");
    const value = Number(normalized);
    return Number.isFinite(value) ? value : 0;
  }

  function parseRowSplits(row) {
    const raw = row.dataset.splits || "[]";
    if (row._cachedSplitsRaw === raw && Array.isArray(row._cachedSplits)) {
      return row._cachedSplits;
    }
    try {
      const splits = JSON.parse(raw);
      if (!Array.isArray(splits) || splits.length === 0) {
        row._cachedSplitsRaw = raw;
        row._cachedSplits = [];
        return [];
      }
      const parsed = splits
        .map((split) => window.Buchnancials.normalizeSplitItem(split))
        .filter((split) => Number.isFinite(split.amount));
      row._cachedSplitsRaw = raw;
      row._cachedSplits = parsed;
      return parsed;
    } catch (err) {
      row._cachedSplitsRaw = raw;
      row._cachedSplits = [];
      return [];
    }
  }

  function getEffectiveSplitItems(row) {
    const splitItems = parseRowSplits(row);
    return splitItems.length > 1 ? splitItems : [];
  }

  function roundMoney(value) {
    return window.Buchnancials.roundMoney(value);
  }

  function collectMonthRows(monthBlock) {
    const rows = [];
    monthBlock.querySelectorAll("tr.tx-row").forEach((row) => {
      const excluded = row.querySelector(".tx-excluded")?.checked || false;
      const splitItems = getEffectiveSplitItems(row);
      if (splitItems.length > 0) {
        splitItems.forEach((split) => {
          rows.push({
            amount: split.amount,
            excluded: excluded || split.excluded,
            category_name: split.category_name,
            category_color: split.category_color || null,
          });
        });
        return;
      }

      const categorySelect = row.querySelector(".tx-category");
      const selectedOption = categorySelect ? categorySelect.options[categorySelect.selectedIndex] : null;
      rows.push({
        amount: parseRowAmount(row),
        excluded,
        category_name: window.Buchnancials.normalizeCategoryLabel(selectedOption ? selectedOption.textContent : "Ohne Kategorie"),
        category_color: selectedOption ? selectedOption.dataset.color || null : null,
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

  function refreshMonthBlock(monthBlock) {
    if (!monthBlock) {
      return;
    }
    const rows = collectMonthRows(monthBlock);
    updateSummaryPills(monthBlock, summarizeRows(rows));
    const chart = monthBlock.querySelector(".month-sankey");
    if (!chart || !monthBlock.open) {
      return;
    }
    const chartContainer = chart.closest(".sankey-container");
    if (chartContainer && chartContainer.hidden) {
      return;
    }
    renderSankey(chart, buildSankey(rows));
  }

  function refreshQuarterBlock(quarterBlock) {
    if (!quarterBlock) {
      return;
    }
    const rows = collectRowsInContainer(quarterBlock);
    updateSummaryPills(quarterBlock, summarizeRows(rows));
    const chart = quarterBlock.querySelector(".quarter-sankey");
    if (!chart || !quarterBlock.open) {
      return;
    }
    const chartContainer = chart.closest(".sankey-container");
    if (chartContainer && chartContainer.hidden) {
      return;
    }
    renderSankey(chart, buildSankey(rows));
  }

  function refreshYearBlock(yearBlock) {
    if (!yearBlock) {
      return;
    }
    const rows = collectRowsInContainer(yearBlock);
    updateSummaryPills(yearBlock, summarizeRows(rows));
    const chart = yearBlock.querySelector(".year-sankey");
    if (!chart || !yearBlock.open) {
      return;
    }
    renderSankey(chart, buildSankey(rows));
  }

  function refreshHierarchyForMonthBlock(monthBlock) {
    if (!monthBlock) {
      return;
    }
    refreshMonthBlock(monthBlock);
    const quarterBlock = monthBlock.closest(".quarter-block");
    if (quarterBlock) {
      refreshQuarterBlock(quarterBlock);
    }
    const yearBlock = monthBlock.closest(".year-block");
    if (yearBlock) {
      refreshYearBlock(yearBlock);
    }
  }

  function refreshHierarchyForRow(row) {
    const monthBlock = row.closest(".month-block");
    refreshHierarchyForMonthBlock(monthBlock);
  }

  function expandHierarchyForMonthBlock(monthBlock) {
    if (!monthBlock) {
      return;
    }
    monthBlock.open = true;
    const quarterBlock = monthBlock.closest(".quarter-block");
    if (quarterBlock) {
      quarterBlock.open = true;
    }
    const yearBlock = monthBlock.closest(".year-block");
    if (yearBlock) {
      yearBlock.open = true;
    }
  }

  function rowNeedsAttention(row) {
    return row.classList.contains("tx-row-uncategorized");
  }

  function ensureAttentionExpansionForRow(row) {
    if (!row || !rowNeedsAttention(row)) {
      return;
    }
    expandHierarchyForMonthBlock(row.closest(".month-block"));
  }

  function expandAttentionSectionsFromDom() {
    document.querySelectorAll("tr.tx-row").forEach((row) => {
      ensureAttentionExpansionForRow(row);
    });
  }

  function refreshOpenSankeysFromDom() {
    document.querySelectorAll(".month-block[open]").forEach((monthBlock) => {
      refreshMonthBlock(monthBlock);
    });
    document.querySelectorAll(".quarter-block[open]").forEach((quarterBlock) => {
      refreshQuarterBlock(quarterBlock);
    });
    document.querySelectorAll(".year-block[open]").forEach((yearBlock) => {
      refreshYearBlock(yearBlock);
    });
  }

  function findOwnSankeyContainer(detailsBlock) {
    if (!detailsBlock) {
      return null;
    }
    for (const child of detailsBlock.children) {
      if (child.classList && child.classList.contains("sankey-container")) {
        return child;
      }
    }
    return null;
  }

  function setSankeyToggleLabel(button, isHidden) {
    if (!button) {
      return;
    }
    button.textContent = isHidden ? "Sankey anzeigen" : "Sankey ausblenden";
  }

  function wireSankeyVisibilityToggles() {
    document.querySelectorAll(".sankey-toggle-btn").forEach((button) => {
      const detailsBlock = button.closest("details");
      const container = findOwnSankeyContainer(detailsBlock);
      if (!detailsBlock || !container) {
        return;
      }
      setSankeyToggleLabel(button, container.hidden);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        container.hidden = !container.hidden;
        setSankeyToggleLabel(button, container.hidden);
        if (container.hidden || !detailsBlock.open) {
          return;
        }
        if (detailsBlock.classList.contains("month-block")) {
          refreshHierarchyForMonthBlock(detailsBlock);
          return;
        }
        if (detailsBlock.classList.contains("quarter-block")) {
          refreshQuarterBlock(detailsBlock);
          refreshYearBlock(detailsBlock.closest(".year-block"));
        }
      });
    });
  }

  function setRowInitialStateFromCurrent(row) {
    const category = row.querySelector(".tx-category");
    const memo = row.querySelector(".tx-memo");
    const excluded = row.querySelector(".tx-excluded");
    if (category) {
      category.dataset.initial = category.value || "";
      category.classList.remove("field-dirty");
    }
    if (memo) {
      memo.dataset.initial = memo.value || "";
      memo.classList.remove("field-dirty");
    }
    if (excluded) {
      excluded.dataset.initial = excluded.checked ? "1" : "0";
      excluded.classList.remove("field-dirty");
    }
    row.classList.remove("tx-row-dirty");
    ensureAttentionExpansionForRow(row);
  }

  async function patchTransaction(transactionId, payload) {
    return window.Buchnancials.patchTransaction(transactionId, payload);
  }

  function findSplitEditorRowForTxId(transactionId) {
    return document.querySelector(`.split-editor-row[data-split-editor-for="${transactionId}"]`);
  }

  function renderSplitPreview(row, splitItems) {
    window.Buchnancials.renderSplitPreview(row.querySelector(".split-preview-list"), splitItems);
  }

  function updateSplitStateForRow(row) {
    const splitItems = getEffectiveSplitItems(row);
    const isSplit = splitItems.length > 0 || row.classList.contains("tx-row-split-editing");
    row.classList.toggle("tx-row-split", isSplit);

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

    renderSplitPreview(row, splitItems);
    return { splitItems, isSplit };
  }

  function updateRowVisualState(row) {
    const { splitItems, isSplit } = updateSplitStateForRow(row);
    const isExcluded = Boolean(row.querySelector(".tx-excluded")?.checked);
    const categorySelect = row.querySelector(".tx-category");
    const hasUncategorizedSplitComponent =
      isSplit && splitItems.some((split) => !split.excluded && split.category_id === null);
    const isUncategorized =
      !isExcluded &&
      ((isSplit && hasUncategorizedSplitComponent) || (!isSplit && categorySelect && (categorySelect.value || "") === ""));

    row.classList.toggle("tx-row-excluded", isExcluded);
    row.classList.toggle("tx-row-uncategorized", Boolean(isUncategorized));

    const splitEditorRow = findSplitEditorRowForTxId(row.dataset.transactionId);
    if (splitEditorRow) {
      splitEditorRow.classList.toggle("tx-row-excluded", isExcluded);
    }
    ensureAttentionExpansionForRow(row);
  }

  function getCategoryOptionsHtml(row) {
    return window.Buchnancials.getSelectOptionsHtml(row.querySelector(".tx-category"));
  }

  function buildSplitLine(categoryOptionsHtml, split = null) {
    return window.Buchnancials.buildSplitLine(categoryOptionsHtml, split);
  }

  function parseSplitAmount(value) {
    return window.Buchnancials.parseMoneyInput(value);
  }

  function updateSplitBalance(lineContainer, txAmount, balanceEl, saveSplitBtn) {
    return window.Buchnancials.updateSplitBalance(lineContainer, txAmount, balanceEl, saveSplitBtn);
  }

  async function openSplitEditor(transactionId) {
    const editorRow = document.querySelector(`.split-editor-row[data-split-editor-for="${transactionId}"]`);
    if (!editorRow) {
      return;
    }

    document.querySelectorAll(".split-editor-row").forEach((row) => {
      if (row !== editorRow) {
        row.hidden = true;
        const oldTxRow = document.querySelector(`tr.tx-row[data-transaction-id="${row.dataset.splitEditorFor}"]`);
        if (oldTxRow) {
          oldTxRow.classList.remove("tx-row-split-editing");
          updateRowVisualState(oldTxRow);
        }
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

    const txAmount = Number(txRow.dataset.transactionAmount || 0);
    const categoryOptionsHtml = getCategoryOptionsHtml(txRow);
    txRow.classList.add("tx-row-split-editing");
    updateRowVisualState(txRow);

    let splitData;
    try {
      splitData = await window.Buchnancials.fetchTransactionSplits(transactionId);
    } catch (err) {
      editorRow.hidden = true;
      txRow.classList.remove("tx-row-split-editing");
      updateRowVisualState(txRow);
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
      updateRowVisualState(txRow);
    };

    saveSplitBtn.onclick = async (event) => {
      event.preventDefault();
      const splitLines = Array.from(lineContainer.querySelectorAll(".split-line"));
      const splitItems = [];
      for (const line of splitLines) {
        const rawCategory = line.querySelector(".split-category").value;
        const categoryId = rawCategory === "" ? null : Number(rawCategory);
        const amount = parseSplitAmount(line.querySelector(".split-amount").value);
        const excludedValue = line.querySelector(".split-excluded").checked;
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

      try {
        await window.Buchnancials.jsonFetch(`/transactions/${transactionId}/splits`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ splits: splitItems }),
        });
        const refreshedSplitData = await window.Buchnancials.fetchTransactionSplits(transactionId);
        const nextSplits = Array.isArray(refreshedSplitData.splits) ? refreshedSplitData.splits : [];
        txRow.dataset.splits = JSON.stringify(nextSplits);
        txRow._cachedSplitsRaw = null;
        txRow._cachedSplits = null;
        editorRow.hidden = true;
        txRow.classList.remove("tx-row-split-editing");
        updateRowVisualState(txRow);
        setRowInitialStateFromCurrent(txRow);
        refreshHierarchyForRow(txRow);
        window.Buchnancials.notify("Aufteilung gespeichert.", "success");
      } catch (err) {
        window.Buchnancials.notify(err.message, "error");
      }
    };
  }

  function setInitialStateFromCurrentDom() {
    document.querySelectorAll("tr.tx-row").forEach((row) => {
      setRowInitialStateFromCurrent(row);
      updateRowVisualState(row);
    });
    expandAttentionSectionsFromDom();
  }

  document.querySelectorAll("tr.tx-row").forEach((row) => {
    const id = Number(row.dataset.transactionId);
    const category = row.querySelector(".tx-category");
    const memo = row.querySelector(".tx-memo");
    const excluded = row.querySelector(".tx-excluded");

    if (!Number.isFinite(id) || !category || !memo || !excluded) {
      return;
    }

    category.addEventListener("change", async () => {
      const previous = category.dataset.initial || "";
      const current = category.value || "";
      if (current === previous) {
        updateRowVisualState(row);
        refreshHierarchyForRow(row);
        return;
      }

      category.disabled = true;
      try {
        await patchTransaction(id, { category_id: current === "" ? null : Number(current) });
        setRowInitialStateFromCurrent(row);
        updateRowVisualState(row);
        refreshHierarchyForRow(row);
      } catch (err) {
        category.value = previous;
        updateRowVisualState(row);
        refreshHierarchyForRow(row);
        window.Buchnancials.notify(err.message, "error");
      } finally {
        category.disabled = false;
      }
    });

    memo.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        memo.blur();
      }
    });

    memo.addEventListener("blur", async () => {
      const previous = memo.dataset.initial || "";
      const current = memo.value;
      if (current === previous) {
        return;
      }

      memo.disabled = true;
      try {
        await patchTransaction(id, { memo: current });
        setRowInitialStateFromCurrent(row);
      } catch (err) {
        memo.value = previous;
        window.Buchnancials.notify(err.message, "error");
      } finally {
        memo.disabled = false;
      }
    });

    excluded.addEventListener("change", async () => {
      const previous = excluded.dataset.initial === "1";
      const current = excluded.checked;
      if (current === previous) {
        updateRowVisualState(row);
        refreshHierarchyForRow(row);
        return;
      }

      excluded.disabled = true;
      try {
        await patchTransaction(id, { excluded: current });
        setRowInitialStateFromCurrent(row);
        updateRowVisualState(row);
        refreshHierarchyForRow(row);
      } catch (err) {
        excluded.checked = previous;
        updateRowVisualState(row);
        refreshHierarchyForRow(row);
        window.Buchnancials.notify(err.message, "error");
      } finally {
        excluded.disabled = false;
      }
    });
  });

  document.querySelectorAll(".split-manage-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const transactionId = button.dataset.transactionId;
      await openSplitEditor(transactionId);
    });
  });

  let suppressToggleRefresh = false;
  document.querySelectorAll("details").forEach((details) => {
    details.addEventListener("toggle", () => {
      if (suppressToggleRefresh) {
        return;
      }
      if (!details.open) {
        return;
      }
      window.setTimeout(() => {
        if (details.classList.contains("month-block")) {
          refreshHierarchyForMonthBlock(details);
          return;
        }
        if (details.classList.contains("quarter-block")) {
          refreshQuarterBlock(details);
          refreshYearBlock(details.closest(".year-block"));
          return;
        }
        if (details.classList.contains("year-block")) {
          refreshYearBlock(details);
        }
      }, 0);
    });
  });

  wireSankeyVisibilityToggles();
  suppressToggleRefresh = true;
  setInitialStateFromCurrentDom();
  suppressToggleRefresh = false;
  refreshOpenSankeysFromDom();
})();
