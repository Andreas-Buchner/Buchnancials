(function () {
  const BALANCE_NODE_LABEL = "Bilanzsumme";

  const topNSelect = document.getElementById("planning-top-n");
  const refreshBtn = document.getElementById("planning-refresh");
  const overviewCards = document.getElementById("planning-overview-cards");
  const violinChart = document.getElementById("planning-violin-chart");
  const stackedChart = document.getElementById("planning-stacked-chart");
  const cashflowChart = document.getElementById("planning-cashflow-chart");
  const incomeStackedChart = document.getElementById("planning-income-stacked-chart");
  const yearlyAverageSankeyGrid = document.getElementById("planning-yearly-average-sankey-grid");
  let sankeyExportCounter = 0;

  function compactEuro(value) {
    const amount = Number(value || 0);
    return `${Math.round(amount).toLocaleString("de-AT")} €`;
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

  function normalizeCategoryLabel(value) {
    if (!value || !String(value).trim()) {
      return "Ohne Kategorie";
    }
    return String(value)
      .replace(/\s+\((income|expense|einnahme|einnahmen|ausgabe|ausgaben)\)$/i, "")
      .trim();
  }

  function normalizeSankeyLabel(label) {
    const raw = String(label || "").trim();
    if (raw === "Net") {
      return BALANCE_NODE_LABEL;
    }
    if (raw === "Savings") {
      return "Überschuss";
    }
    if (raw === "Shortfall") {
      return "Fehlbetrag";
    }
    if (/\(Income\)$/i.test(raw)) {
      return raw.replace(/\(Income\)$/i, "(Einnahme)");
    }
    if (/\(Expense\)$/i.test(raw)) {
      return raw.replace(/\(Expense\)$/i, "(Ausgabe)");
    }
    return normalizeCategoryLabel(raw);
  }

  function normalizeSankeyForOverviewStyle(sankey) {
    const nodesRaw = Array.isArray(sankey?.nodes) ? sankey.nodes : [];
    const linksRaw = Array.isArray(sankey?.links) ? sankey.links : [];
    const nodeColorsRaw = sankey?.node_colors && typeof sankey.node_colors === "object" ? sankey.node_colors : {};

    const nodes = [];
    const seen = new Set();
    nodesRaw.forEach((node) => {
      const mapped = normalizeSankeyLabel(node);
      if (!seen.has(mapped)) {
        seen.add(mapped);
        nodes.push(mapped);
      }
    });
    const links = linksRaw.map((link) => ({
      source: normalizeSankeyLabel(link.source),
      target: normalizeSankeyLabel(link.target),
      value: Number(link.value || 0),
      color: link.color || null,
    }));
    links.forEach((link) => {
      if (!seen.has(link.source)) {
        seen.add(link.source);
        nodes.push(link.source);
      }
      if (!seen.has(link.target)) {
        seen.add(link.target);
        nodes.push(link.target);
      }
    });

    const nodeColors = {};
    Object.entries(nodeColorsRaw).forEach(([label, color]) => {
      nodeColors[normalizeSankeyLabel(label)] = color;
    });
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

  function renderOverview(overview) {
    const cards = [
      { label: "Monate", value: String(overview.months_covered || 0) },
      { label: "Zeitraum", value: overview.first_month && overview.last_month ? `${overview.first_month} bis ${overview.last_month}` : "Keine Daten" },
      { label: "Ausgaben gesamt", value: compactEuro(overview.total_expenses) },
      { label: "Einnahmen gesamt", value: compactEuro(overview.total_income) },
      { label: "Saldo", value: compactEuro(overview.net_cash_flow) },
      { label: "Ø Monatsausgaben", value: compactEuro(overview.average_monthly_expenses) },
      { label: "Median Monatsausgaben", value: compactEuro(overview.median_monthly_expenses) },
      { label: "P90 Monatsausgaben", value: compactEuro(overview.p90_monthly_expenses) },
    ];
    overviewCards.innerHTML = cards
      .map(
        (card) => `
          <article class="planning-overview-card">
            <small>${card.label}</small>
            <strong>${card.value}</strong>
          </article>
        `
      )
      .join("");
  }

  function renderEmpty(el, text) {
    if (!el) {
      return;
    }
    el.innerHTML = `<small>${text}</small>`;
    setChartExportButtonVisibility(el, false);
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

  function ensureExportChartId(el) {
    if (!el.id) {
      sankeyExportCounter += 1;
      el.id = `planning-chart-${sankeyExportCounter}`;
    }
    return el.id;
  }

  function getChartExportFilename(el, fallbackLabel = "diagramm") {
    const cardTitle = el.closest(".planning-yearly-sankey-card")?.querySelector("h4")?.textContent?.trim();
    const panelTitle = el.closest(".panel")?.querySelector(":scope > h3")?.textContent?.trim();
    const label = cardTitle || panelTitle || fallbackLabel;
    const slug = slugifyFilenamePart(label) || "sankey";
    return `buchnancials-sankey-${slug}.jpg`;
  }

  function getChartExportTitle(el, fallbackLabel = "Diagramm") {
    const cardTitle = el.closest(".planning-yearly-sankey-card")?.querySelector("h4")?.textContent?.trim();
    const panelTitle = el.closest(".panel")?.querySelector(":scope > h3")?.textContent?.trim();
    const label = cardTitle || panelTitle || fallbackLabel;
    return String(label || fallbackLabel).trim();
  }

  function findChartExportHost(el) {
    const chartContainer = el.closest(".planning-yearly-sankey-chart") || el.closest(".sankey-container") || el.parentElement;
    if (!chartContainer) {
      return null;
    }
    const hostParent = chartContainer.parentElement || chartContainer;
    return { chartContainer, hostParent };
  }

  async function exportChartAsJpg(chartEl, filename) {
    const width = Math.max(Math.round(chartEl.clientWidth || 900), 640);
    const height = Math.max(Math.round(chartEl.clientHeight || 300), 280);
    const priorPaperBg = chartEl.layout?.paper_bgcolor ?? "rgba(0,0,0,0)";
    const priorPlotBg = chartEl.layout?.plot_bgcolor ?? "rgba(0,0,0,0)";
    const priorTitle = chartEl.layout?.title ?? { text: "" };
    const priorMarginTop = Number(chartEl.layout?.margin?.t ?? 10);
    const exportTitle = chartEl.dataset.exportTitle || "Diagramm";
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

  function setChartExportButtonVisibility(el, visible) {
    const chartId = ensureExportChartId(el);
    const host = findChartExportHost(el);
    if (!host) {
      return;
    }
    const button = host.hostParent.querySelector(`.sankey-export-btn[data-target-chart-id="${chartId}"]`);
    if (button) {
      button.hidden = !visible;
    }
  }

  function ensureChartExportButton(el, options = {}) {
    const host = findChartExportHost(el);
    if (!host) {
      return;
    }
    const chartId = ensureExportChartId(el);
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
          await exportChartAsJpg(target, button.dataset.filename || "buchnancials-sankey.jpg");
          window.Buchnancials.notify("Diagramm als JPG exportiert.", "success");
        } catch (err) {
          window.Buchnancials.notify("Diagramm-Export fehlgeschlagen.", "error");
        } finally {
          button.disabled = false;
        }
      });
      row.appendChild(button);
    }
    button.dataset.targetChartId = chartId;
    button.dataset.filename = getChartExportFilename(el, options.filenameBase || "diagramm");
    el.dataset.exportTitle = getChartExportTitle(el, options.exportTitle || "Diagramm");
    button.hidden = false;
  }

  function renderViolinChart(series) {
    if (!window.Plotly || !violinChart) {
      return;
    }
    if (!Array.isArray(series) || series.length === 0) {
      renderEmpty(violinChart, "Keine ausreichenden Ausgabendaten für den Violin-Chart.");
      return;
    }

    const traces = series
      .map((item) => {
        const values = (item.values || [])
          .map((value) => Math.max(0, Number(value || 0)))
          .filter((value) => value > 0);
        return {
          type: "violin",
          name: item.category,
          y: values,
          box: { visible: true },
          meanline: { visible: true },
          points: false,
          spanmode: "hard",
          hovertemplate: `${item.category}<br>%{y:.2f} €<extra></extra>`,
        };
      })
      .filter((trace) => trace.y.length > 0);

    if (traces.length === 0) {
      renderEmpty(violinChart, "Keine ausreichenden Ausgabendaten für den Violin-Chart.");
      return;
    }

    const maxY = Math.max(...traces.flatMap((trace) => trace.y));

    window.Plotly.react(
      violinChart,
      traces,
      {
        margin: { l: 50, r: 18, t: 8, b: 90 },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        yaxis: { title: "Monatliche Ausgaben (€)", range: [0, Math.max(1, maxY * 1.05)] },
      },
      { displayModeBar: false, responsive: true }
    );
    ensureChartExportButton(violinChart, { filenameBase: "ausgabenverteilung", exportTitle: "Ausgabenverteilung pro Kategorie" });
  }

  function renderStackedBarChart(stacked) {
    if (!window.Plotly || !stackedChart) {
      return;
    }
    const months = (stacked && stacked.months) || [];
    const series = (stacked && stacked.series) || [];
    if (months.length === 0 || series.length === 0) {
      renderEmpty(stackedChart, "Keine Ausgabenreihen für den Stacked-Bar-Chart verfügbar.");
      return;
    }

    const traces = series.map((item) => ({
      type: "bar",
      name: item.category,
      x: months,
      y: item.values || [],
      hovertemplate: `%{x}<br>${item.category}: %{y:.2f} €<extra></extra>`,
    }));

    window.Plotly.react(
      stackedChart,
      traces,
      {
        barmode: "stack",
        margin: { l: 50, r: 18, t: 8, b: 60 },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        yaxis: { title: "Ausgaben (€)" },
      },
      { displayModeBar: false, responsive: true }
    );
    ensureChartExportButton(stackedChart, { filenameBase: "ausgaben-stacked", exportTitle: "Monatliche Ausgaben nach Kategorie" });
  }

  function renderCashflowChart(monthlyTotals) {
    if (!window.Plotly || !cashflowChart) {
      return;
    }
    if (!Array.isArray(monthlyTotals) || monthlyTotals.length === 0) {
      renderEmpty(cashflowChart, "Keine Monatsdaten für den Cashflow-Verlauf vorhanden.");
      return;
    }

    const months = monthlyTotals.map((item) => item.month);
    const xIndex = months.map((_, idx) => idx);
    const income = monthlyTotals.map((item) => Number(item.income || 0));
    const expenses = monthlyTotals.map((item) => Number(item.expenses || 0));
    const net = monthlyTotals.map((item) => Number(item.net || 0));
    const incomeX = xIndex.map((x) => x - 0.2);
    const expensesX = xIndex.map((x) => x + 0.2);

    const saldoBands = xIndex
      .map((x, idx) => {
        const netValue = net[idx];
        if (netValue === 0) {
          return null;
        }
        return {
          type: "scatter",
          x: [x - 0.42, x - 0.42, x + 0.42, x + 0.42],
          y: [0, netValue, netValue, 0],
          mode: "lines",
          line: { width: 0 },
          fill: "toself",
          fillcolor: netValue > 0 ? "rgba(93, 150, 127, 0.24)" : "rgba(199, 131, 122, 0.26)",
          hoverinfo: "skip",
          showlegend: false,
        };
      })
      .filter(Boolean);

    window.Plotly.react(
      cashflowChart,
      [
        { type: "bar", name: "Einnahmen", x: incomeX, y: income, width: 0.34, marker: { color: "#5d967f" } },
        { type: "bar", name: "Ausgaben", x: expensesX, y: expenses, width: 0.34, marker: { color: "#c7837a" } },
        ...saldoBands,
        {
          type: "scatter",
          mode: "lines+markers",
          name: "Saldo",
          x: xIndex,
          y: net,
          marker: { color: "#2f4050" },
          line: { color: "#2f4050", width: 2 },
        },
      ],
      {
        barmode: "overlay",
        margin: { l: 50, r: 18, t: 8, b: 60 },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        xaxis: {
          tickmode: "array",
          tickvals: xIndex,
          ticktext: months,
        },
        yaxis: {
          title: "Betrag (€)",
          zeroline: true,
          zerolinecolor: "#4b5563",
          zerolinewidth: 1.4,
        },
      },
      { displayModeBar: false, responsive: true }
    );
    ensureChartExportButton(cashflowChart, { filenameBase: "cashflow", exportTitle: "Cashflow-Verlauf" });
  }

  function renderIncomeStackedBarChart(stacked) {
    if (!window.Plotly || !incomeStackedChart) {
      return;
    }
    const months = (stacked && stacked.months) || [];
    const series = (stacked && stacked.series) || [];
    if (months.length === 0 || series.length === 0) {
      renderEmpty(incomeStackedChart, "Keine Einnahmenreihen für den Stacked-Bar-Chart verfügbar.");
      return;
    }

    const traces = series.map((item) => ({
      type: "bar",
      name: item.category,
      x: months,
      y: item.values || [],
      marker: { color: item.color || "#5d967f" },
      hovertemplate: `%{x}<br>${item.category}: %{y:.2f} €<extra></extra>`,
    }));

    window.Plotly.react(
      incomeStackedChart,
      traces,
      {
        barmode: "stack",
        margin: { l: 50, r: 18, t: 8, b: 60 },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        yaxis: { title: "Einnahmen (€)" },
      },
      { displayModeBar: false, responsive: true }
    );
    ensureChartExportButton(incomeStackedChart, { filenameBase: "einnahmen-stacked", exportTitle: "Monatliche Einnahmen nach Kategorie" });
  }

  function renderSankeyChart(el, sankey) {
    if (!window.Plotly || !el) {
      return;
    }
    const normalized = normalizeSankeyForOverviewStyle(sankey);
    if (!normalized || !Array.isArray(normalized.nodes) || !Array.isArray(normalized.links) || normalized.links.length === 0) {
      renderEmpty(el, "Keine ausreichenden Daten für den Sankey.");
      setChartExportButtonVisibility(el, false);
      return;
    }

    const orderedNodes = orderSankeyNodesForDisplay(normalized.nodes);
    const index = new Map();
    orderedNodes.forEach((label, idx) => index.set(label, idx));
    const orderedLinks = orderSankeyLinksForDisplay(normalized.links, index);

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
    orderedLinks.forEach((link) => {
      if (!index.has(link.source) || !index.has(link.target)) {
        return;
      }
      source.push(index.get(link.source));
      target.push(index.get(link.target));
      value.push(Number(link.value || 0));
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

    const providedNodeColors = normalized.node_colors || {};
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
    ensureChartExportButton(el, { filenameBase: "sankey", exportTitle: "Sankey-Diagramm" });
  }

  function renderYearlyAverageSankeys(items) {
    if (!yearlyAverageSankeyGrid) {
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      yearlyAverageSankeyGrid.innerHTML = "<small>Keine Jahresdaten für Ø-Monat-Sankey verfügbar.</small>";
      return;
    }

    yearlyAverageSankeyGrid.innerHTML = "";
    items
      .slice()
      .sort((a, b) => Number(b.year) - Number(a.year))
      .forEach((item) => {
      const card = document.createElement("article");
      card.className = "planning-yearly-sankey-card";
      const title = document.createElement("h4");
      const monthsCovered = Number(item.months_covered || 0);
      title.textContent = `${item.year} · Ø Monat (${monthsCovered} ${monthsCovered === 1 ? "Monat" : "Monate"})`;

      const chartWrap = document.createElement("div");
      chartWrap.className = "planning-yearly-sankey-chart";
      card.appendChild(title);
      card.appendChild(chartWrap);
      yearlyAverageSankeyGrid.appendChild(card);
      renderSankeyChart(chartWrap, item.sankey || {});
      });
  }

  async function loadPlanningData() {
    const topN = Number(topNSelect?.value || 8);
    refreshBtn.disabled = true;
    try {
      const payload = await window.Buchnancials.jsonFetch(`/reports/planning?top_n_categories=${topN}`);
      renderOverview(payload.overview || {});
      renderViolinChart(payload.violin_series || []);
      renderStackedBarChart(payload.stacked_bar || { months: [], series: [] });
      renderCashflowChart(payload.monthly_totals || []);
      renderIncomeStackedBarChart(payload.income_stacked_bar || { months: [], series: [] });
      renderYearlyAverageSankeys(payload.yearly_average_sankey || []);
    } catch (err) {
      window.Buchnancials.notify(err.message, "error");
      renderEmpty(violinChart, "Fehler beim Laden der Planungsdaten.");
      renderEmpty(stackedChart, "Fehler beim Laden der Planungsdaten.");
      renderEmpty(cashflowChart, "Fehler beim Laden der Planungsdaten.");
      renderEmpty(incomeStackedChart, "Fehler beim Laden der Planungsdaten.");
      if (yearlyAverageSankeyGrid) {
        yearlyAverageSankeyGrid.innerHTML = "<small>Fehler beim Laden der Planungsdaten.</small>";
      }
    } finally {
      refreshBtn.disabled = false;
    }
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", loadPlanningData);
  }
  if (topNSelect) {
    topNSelect.addEventListener("change", loadPlanningData);
  }

  loadPlanningData();
})();
