(function () {
  const BALANCE_NODE_LABEL = "Bilanzsumme";
  let sankeyExportCounter = 0;

  function normalizeCategoryLabel(value) {
    if (!value || !value.trim()) {
      return "Ohne Kategorie";
    }
    return value
      .replace(/\s+\((income|expense|einnahme|einnahmen|ausgabe|ausgaben)(,\s*inactive|,\s*inaktiv)?\)$/i, "")
      .trim();
  }

  function formatEuroCompact(value) {
    const numeric = Number(value || 0);
    const absolute = Math.round(Math.abs(numeric));
    const grouped = String(absolute).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    const prefix = numeric < 0 ? "-" : "";
    return `${prefix}${grouped} €`;
  }

  function formatEuroNode(value) {
    const absolute = Math.round(Math.abs(Number(value || 0)));
    const grouped = String(absolute).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return `${grouped} €`;
  }

  function isHexColor(value) {
    return /^#[0-9a-f]{6}$/i.test((value || "").trim());
  }

  function hexToRgba(hex, alpha) {
    const normalized = (hex || "").trim();
    if (!isHexColor(normalized)) {
      return null;
    }
    const r = Number.parseInt(normalized.slice(1, 3), 16);
    const g = Number.parseInt(normalized.slice(3, 5), 16);
    const b = Number.parseInt(normalized.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

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
      const category = normalizeCategoryLabel(row.category_name || "Ohne Kategorie");
      const categoryColor = isHexColor(row.category_color) ? row.category_color : null;
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

    const links = [];
    [...income.keys()]
      .sort()
      .forEach((category) => {
        const value = Number((income.get(category) || 0).toFixed(2));
        if (value > 0) {
          links.push({
            source: incomeNode(category),
            target: BALANCE_NODE_LABEL,
            value,
            color: hexToRgba(incomeColor.get(category), 0.4),
          });
        }
      });

    [...expense.keys()]
      .sort()
      .forEach((category) => {
        const value = Number((expense.get(category) || 0).toFixed(2));
        if (value > 0) {
          links.push({
            source: BALANCE_NODE_LABEL,
            target: expenseNode(category),
            value,
            color: hexToRgba(expenseColor.get(category), 0.4),
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

    const incomeNodes = [...income.keys()].sort().map(incomeNode);
    const expenseNodes = [...expense.keys()].sort().map(expenseNode);
    let nodes = [...incomeNodes, BALANCE_NODE_LABEL, ...expenseNodes];
    if (net > 0) {
      nodes.push("Überschuss");
    }
    if (net < 0) {
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

  function orderSankeyNodesForDisplay(nodes) {
    const source = Array.isArray(nodes) ? nodes : [];
    const bottomLabels = new Set(["Überschuss", "Fehlbetrag"]);
    const regular = [];
    const bottom = [];
    source.forEach((label) => {
      if (bottomLabels.has(label)) {
        bottom.push(label);
      } else {
        regular.push(label);
      }
    });
    return [...regular, ...bottom];
  }

  function orderSankeyLinksForDisplay(links, nodeIndex) {
    const source = Array.isArray(links) ? links.slice() : [];
    const idx = (label) => (nodeIndex.has(label) ? nodeIndex.get(label) : Number.MAX_SAFE_INTEGER);
    return source.sort((a, b) => {
      const aToBalance = a.target === BALANCE_NODE_LABEL;
      const bToBalance = b.target === BALANCE_NODE_LABEL;
      if (aToBalance !== bToBalance) {
        return aToBalance ? -1 : 1;
      }

      const aFromBalance = a.source === BALANCE_NODE_LABEL;
      const bFromBalance = b.source === BALANCE_NODE_LABEL;
      if (aFromBalance !== bFromBalance) {
        return aFromBalance ? 1 : -1;
      }

      if (aToBalance && bToBalance) {
        const bySource = idx(a.source) - idx(b.source);
        if (bySource !== 0) {
          return bySource;
        }
      } else if (aFromBalance && bFromBalance) {
        const byTarget = idx(a.target) - idx(b.target);
        if (byTarget !== 0) {
          return byTarget;
        }
      }

      const bySource = idx(a.source) - idx(b.source);
      if (bySource !== 0) {
        return bySource;
      }
      const byTarget = idx(a.target) - idx(b.target);
      if (byTarget !== 0) {
        return byTarget;
      }
      return String(a.target || "").localeCompare(String(b.target || ""), "de");
    });
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
      incomePill.textContent = `Einnahmen ${formatEuroCompact(totals.income)}`;
    }
    if (expensePill) {
      expensePill.textContent = `Ausgaben ${formatEuroCompact(totals.expenses)}`;
    }
    if (saldoPill) {
      saldoPill.textContent = `Saldo ${formatEuroCompact(totals.saldo)}`;
    }
  }

  function slugifyFilenamePart(value) {
    const normalized = String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return normalized
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
  }

  function ensureSankeyChartId(el) {
    if (!el.id) {
      sankeyExportCounter += 1;
      el.id = `overview-sankey-${sankeyExportCounter}`;
    }
    return el.id;
  }

  function getSankeyExportFilename(el) {
    const detailsBlock = el.closest("details");
    const label =
      detailsBlock?.querySelector(":scope > summary .period-label")?.textContent?.trim() || "uebersicht";
    const slug = slugifyFilenamePart(label) || "sankey";
    return `buchnancials-sankey-${slug}.jpg`;
  }

  function getSankeyExportTitle(el) {
    const detailsBlock = el.closest("details");
    const label = detailsBlock?.querySelector(":scope > summary .period-label")?.textContent?.trim();
    return label ? `Sankey · ${label}` : "Sankey";
  }

  function findSankeyChartContainer(el) {
    return el.closest(".sankey-container") || el.parentElement;
  }

  function findSankeyExportHost(el) {
    const chartContainer = findSankeyChartContainer(el);
    if (!chartContainer) {
      return null;
    }
    const hostParent = chartContainer.parentElement || chartContainer;
    return { chartContainer, hostParent };
  }

  async function exportSankeyAsJpg(chartEl, filename) {
    const width = Math.max(Math.round(chartEl.clientWidth || 900), 640);
    const height = Math.max(Math.round(chartEl.clientHeight || 300), 280);
    const priorPaperBg = chartEl.layout?.paper_bgcolor ?? "rgba(0,0,0,0)";
    const priorPlotBg = chartEl.layout?.plot_bgcolor ?? "rgba(0,0,0,0)";
    const priorTitle = chartEl.layout?.title ?? { text: "" };
    const priorMarginTop = Number(chartEl.layout?.margin?.t ?? 10);
    const exportTitle = chartEl.dataset.exportTitle || "Sankey";
    try {
      await window.Plotly.relayout(chartEl, {
        paper_bgcolor: "#ffffff",
        plot_bgcolor: "#ffffff",
        title: {
          text: exportTitle,
          x: 0.02,
          xanchor: "left",
          y: 0.98,
          yanchor: "top",
          font: { size: 15, color: "#1f2933" },
        },
        "margin.t": Math.max(priorMarginTop, 58),
      });
      const imageDataUrl = await window.Plotly.toImage(chartEl, {
        format: "jpeg",
        width,
        height,
        scale: 2,
      });
      const downloadLink = document.createElement("a");
      downloadLink.href = imageDataUrl;
      downloadLink.download = filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
    } finally {
      try {
        await window.Plotly.relayout(chartEl, {
          paper_bgcolor: priorPaperBg,
          plot_bgcolor: priorPlotBg,
          title: priorTitle,
          "margin.t": priorMarginTop,
        });
      } catch (err) {
        // Keep export success path unaffected if background reset fails.
      }
    }
  }

  function setSankeyExportButtonVisibility(el, visible) {
    const chartId = ensureSankeyChartId(el);
    const host = findSankeyExportHost(el);
    if (!host) {
      return;
    }
    const button = host.hostParent.querySelector(`.sankey-export-btn[data-target-chart-id="${chartId}"]`);
    if (button) {
      button.hidden = !visible;
    }
  }

  function ensureSankeyExportButton(el) {
    const host = findSankeyExportHost(el);
    if (!host) {
      return;
    }
    const chartId = ensureSankeyChartId(el);
    let row = host.hostParent.querySelector(`.plot-export-row[data-target-chart-id="${chartId}"]`);
    let button = row ? row.querySelector(".sankey-export-btn") : null;
    if (!row) {
      row = document.createElement("div");
      row.className = "plot-export-row";
      row.dataset.targetChartId = chartId;
      const nextSibling = host.chartContainer.nextSibling;
      if (nextSibling) {
        host.chartContainer.parentElement.insertBefore(row, nextSibling);
      } else {
        host.chartContainer.parentElement.appendChild(row);
      }
    }
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "btn-secondary sankey-export-btn";
      button.textContent = "JPG exportieren";
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        const targetId = button.dataset.targetChartId;
        const target = targetId ? document.getElementById(targetId) : null;
        if (!target || !window.Plotly) {
          return;
        }
        button.disabled = true;
        try {
          await exportSankeyAsJpg(target, button.dataset.filename || "buchnancials-sankey.jpg");
          window.Buchnancials.notify("Sankey als JPG exportiert.", "success");
        } catch (err) {
          window.Buchnancials.notify("Sankey-Export fehlgeschlagen.", "error");
        } finally {
          button.disabled = false;
        }
      });
      row.appendChild(button);
    }
    button.dataset.targetChartId = chartId;
    button.dataset.filename = getSankeyExportFilename(el);
    el.dataset.exportTitle = getSankeyExportTitle(el);
    button.hidden = false;
  }

  function renderSankey(el, sankey) {
    if (!window.Plotly) {
      return;
    }
    if (!Array.isArray(sankey.nodes) || sankey.nodes.length === 0) {
      el.innerHTML = "<small>Für diesen Zeitraum liegen keine Daten vor.</small>";
      setSankeyExportButtonVisibility(el, false);
      return;
    }

    const orderedNodes = orderSankeyNodesForDisplay(sankey.nodes);
    const index = new Map();
    orderedNodes.forEach((label, i) => index.set(label, i));
    const orderedLinks = orderSankeyLinksForDisplay(sankey.links, index);
    const source = [];
    const target = [];
    const value = [];
    const color = [];
    const customdata = [];

    const incomeNodes = new Set();
    const expenseNodes = new Set();
    orderedLinks.forEach((link) => {
      if (link.target === BALANCE_NODE_LABEL) {
        incomeNodes.add(link.source);
      } else if (link.source === BALANCE_NODE_LABEL) {
        expenseNodes.add(link.target);
      }
    });

    const inbound = new Map();
    const outbound = new Map();
    orderedLinks.forEach((link) => {
      outbound.set(link.source, (outbound.get(link.source) || 0) + Number(link.value || 0));
      inbound.set(link.target, (inbound.get(link.target) || 0) + Number(link.value || 0));
    });
    const displayLabels = orderedNodes.map((label) => {
      const total = Math.max(inbound.get(label) || 0, outbound.get(label) || 0);
      if (total <= 0) {
        return label;
      }
      return `${label} · ${formatEuroNode(total)}`;
    });
    const providedNodeColors = sankey.node_colors || {};
    const nodeColors = orderedNodes.map((label) => {
      if (providedNodeColors[label]) {
        return providedNodeColors[label];
      }
      if (label === BALANCE_NODE_LABEL) {
        return "#121212";
      }
      if (label === "Überschuss") {
        return "#5d7d68";
      }
      if (label === "Fehlbetrag") {
        return "#9b6666";
      }
      if (incomeNodes.has(label)) {
        return "#739c8f";
      }
      if (expenseNodes.has(label)) {
        return "#b98c87";
      }
      return "#8a9ba8";
    });

    orderedLinks.forEach((link) => {
      source.push(index.get(link.source));
      target.push(index.get(link.target));
      value.push(link.value);
      customdata.push(formatEuroCompact(link.value));
      if (link.color) {
        color.push(link.color);
      } else if (link.target === BALANCE_NODE_LABEL) {
        color.push("rgba(103, 142, 132, 0.35)");
      } else if (link.source === BALANCE_NODE_LABEL) {
        color.push("rgba(178, 129, 125, 0.35)");
      } else {
        color.push("rgba(109, 123, 133, 0.35)");
      }
    });

    window.Plotly.react(
      el,
      [
        {
          type: "sankey",
          arrangement: "snap",
          textfont: { size: 11, color: "#26333a" },
          node: {
            label: displayLabels,
            color: nodeColors,
            pad: 12,
            thickness: 20,
            line: { color: "rgba(45,45,45,0.3)", width: 0.5 },
          },
          link: {
            source,
            target,
            value,
            color,
            customdata,
            hovertemplate: "%{source.label} → %{target.label}<br>%{customdata}<extra></extra>",
          },
        },
      ],
      {
        margin: { l: 18, r: 18, t: 10, b: 10 },
        paper_bgcolor: "rgba(0,0,0,0)",
        font: { size: 12 },
      },
      { displayModeBar: false, responsive: true }
    );
    ensureSankeyExportButton(el);
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
        .map((split) => ({
          category_id:
            split.category_id === null || split.category_id === undefined
              ? null
              : Number(split.category_id),
          amount: Number(split.amount),
          excluded: Boolean(split.excluded),
          category_name: normalizeCategoryLabel(split.category_name || "Ohne Kategorie"),
          category_color: split.category_color || null,
        }))
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
    return Number(Number(value).toFixed(2));
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
        category_name: normalizeCategoryLabel(selectedOption ? selectedOption.textContent : "Ohne Kategorie"),
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
    return window.Buchnancials.jsonFetch(`/transactions/${transactionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  function findSplitEditorRowForTxId(transactionId) {
    return document.querySelector(`.split-editor-row[data-split-editor-for="${transactionId}"]`);
  }

  function renderSplitPreview(row, splitItems) {
    const previewList = row.querySelector(".split-preview-list");
    if (!previewList) {
      return;
    }
    previewList.textContent = "";
    if (splitItems.length === 0) {
      previewList.hidden = true;
      return;
    }
    splitItems.forEach((split) => {
      const item = document.createElement("li");
      item.className = "split-preview-item";
      if (split.excluded) {
        item.classList.add("excluded");
      }

      const labelWrap = document.createElement("span");
      labelWrap.className = "split-preview-item-label";
      if (split.category_color) {
        labelWrap.style.setProperty("--split-color", split.category_color);
      }

      const labelText = document.createElement("span");
      labelText.className = "split-preview-item-text";
      labelText.textContent = split.excluded
        ? `${split.category_name} (ignoriert)`
        : split.category_name;
      labelWrap.appendChild(labelText);

      const amount = document.createElement("span");
      amount.className = "split-preview-item-amount";
      amount.textContent = `${Number(split.amount).toLocaleString("de-AT", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} €`;

      item.appendChild(labelWrap);
      item.appendChild(amount);
      previewList.appendChild(item);
    });
    previewList.hidden = false;
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
    const categorySelect = row.querySelector(".tx-category");
    if (!categorySelect) {
      return "";
    }
    return Array.from(categorySelect.options)
      .map(
        (option) =>
          `<option value="${option.value}" data-color="${option.dataset.color || ""}">${option.textContent}</option>`
      )
      .join("");
  }

  function buildSplitLine(categoryOptionsHtml, split = null) {
    const wrapper = document.createElement("div");
    wrapper.className = "split-line";
    wrapper.innerHTML = `
      <select class="split-category">${categoryOptionsHtml}</select>
      <input class="split-amount" type="number" step="0.01" placeholder="Betrag" />
      <label class="split-exclude-toggle"><input type="checkbox" class="split-excluded" /> Ignorieren</label>
      <button type="button" class="btn-secondary split-remove-line">Entfernen</button>
    `;
    if (split) {
      if (split.category_id === null || split.category_id === undefined) {
        wrapper.querySelector(".split-category").value = "";
      } else {
        wrapper.querySelector(".split-category").value = String(split.category_id);
      }
      wrapper.querySelector(".split-amount").value = Number(split.amount).toFixed(2);
      wrapper.querySelector(".split-excluded").checked = Boolean(split.excluded);
    }
    return wrapper;
  }

  function parseSplitAmount(value) {
    const normalized = String(value ?? "")
      .trim()
      .replace(",", ".");
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function updateSplitBalance(lineContainer, txAmount, balanceEl, saveSplitBtn) {
    const lines = Array.from(lineContainer.querySelectorAll(".split-line"));
    const amounts = lines.map((line) => parseSplitAmount(line.querySelector(".split-amount")?.value));
    const hasInvalidAmount = amounts.some((value) => value === null);
    const validAmounts = amounts.filter((value) => value !== null);
    const total = Number(validAmounts.reduce((sum, value) => sum + value, 0).toFixed(2));
    const remaining = Number((txAmount - total).toFixed(2));
    const lineCount = lines.length;

    let valid = false;
    balanceEl.classList.remove("ok", "error", "warning");
    if (lineCount === 0) {
      balanceEl.textContent = "Keine Aufteilung aktiv. Speichern entfernt alle Posten.";
      balanceEl.classList.add("ok");
      valid = true;
    } else if (lineCount === 1) {
      balanceEl.textContent = "Mindestens 2 Posten für eine Aufteilung erforderlich.";
      balanceEl.classList.add("warning");
    } else if (hasInvalidAmount) {
      balanceEl.textContent = "Bitte in jeder Teilzeile einen gültigen Betrag eingeben.";
      balanceEl.classList.add("warning");
    } else {
      balanceEl.textContent = `Verteilt: ${total.toFixed(2)} | Offen: ${remaining.toFixed(2)}`;
      valid = Math.abs(remaining) <= 0.01;
      balanceEl.classList.add(valid ? "ok" : "error");
    }
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
      splitData = await window.Buchnancials.jsonFetch(`/transactions/${transactionId}/splits`);
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
        const refreshedSplitData = await window.Buchnancials.jsonFetch(`/transactions/${transactionId}/splits`);
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
