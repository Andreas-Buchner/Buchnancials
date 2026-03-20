window.Buchnancials = window.Buchnancials || {};

window.Buchnancials.jsonFetch = async function jsonFetch(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload.detail || response.statusText || "Request failed";
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return payload;
};

window.Buchnancials.notify = function notify(message, type = "info", timeoutMs = 2800) {
  const safeType = ["info", "success", "error"].includes(type) ? type : "info";
  let container = document.getElementById("app-toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "app-toast-container";
    container.className = "app-toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `app-toast app-toast-${safeType}`;
  toast.textContent = message;
  container.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add("app-toast-hide");
    window.setTimeout(() => toast.remove(), 220);
  }, timeoutMs);
};

window.Buchnancials.sankeyBalanceNodeLabel = "Bilanzsumme";

const sankeyExportCounters = Object.create(null);

function formatGroupedEuro(value, signed = false) {
  const numeric = Number(value || 0);
  const absolute = Math.round(Math.abs(numeric));
  const grouped = String(absolute).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const prefix = signed && numeric < 0 ? "-" : "";
  return `${prefix}${grouped} €`;
}

window.Buchnancials.slugifyFilenamePart = function slugifyFilenamePart(value) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return normalized
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
};

window.Buchnancials.normalizeCategoryLabel = function normalizeCategoryLabel(value, options = {}) {
  const raw = String(value || "");
  if (!raw.trim()) {
    return "Ohne Kategorie";
  }
  const stripInactiveSuffix = options.stripInactiveSuffix !== false;
  const suffixPattern = stripInactiveSuffix
    ? /\s+\((income|expense|einnahme|einnahmen|ausgabe|ausgaben)(,\s*inactive|,\s*inaktiv)?\)$/i
    : /\s+\((income|expense|einnahme|einnahmen|ausgabe|ausgaben)\)$/i;
  return raw.replace(suffixPattern, "").trim();
};

window.Buchnancials.formatMoney = function formatMoney(value, options = {}) {
  const {
    locale = "de-AT",
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
  } = options;
  return `${Number(value || 0).toLocaleString(locale, {
    minimumFractionDigits,
    maximumFractionDigits,
  })} €`;
};

window.Buchnancials.roundMoney = function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
};

window.Buchnancials.parseMoneyInput = function parseMoneyInput(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(",", ".");
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

window.Buchnancials.normalizeSplitItem = function normalizeSplitItem(split) {
  return {
    id: split?.id,
    transaction_id: split?.transaction_id,
    category_id:
      split?.category_id === null || split?.category_id === undefined ? null : Number(split.category_id),
    amount: Number(split?.amount || 0),
    excluded: Boolean(split?.excluded),
    category_name: window.Buchnancials.normalizeCategoryLabel(split?.category_name || "Ohne Kategorie"),
    category_type: split?.category_type || null,
    category_color: split?.category_color || null,
  };
};

window.Buchnancials.getSelectOptionsHtml = function getSelectOptionsHtml(select) {
  if (!select) {
    return "";
  }
  return Array.from(select.options)
    .map(
      (option) =>
        `<option value="${option.value}" data-color="${option.dataset.color || ""}">${option.textContent}</option>`
    )
    .join("");
};

window.Buchnancials.buildSplitLine = function buildSplitLine(categoryOptionsHtml, split = null) {
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
};

window.Buchnancials.updateSplitBalance = function updateSplitBalance(
  lineContainer,
  txAmount,
  balanceEl,
  saveSplitBtn
) {
  const lines = Array.from(lineContainer.querySelectorAll(".split-line"));
  const amounts = lines.map((line) =>
    window.Buchnancials.parseMoneyInput(line.querySelector(".split-amount")?.value)
  );
  const hasInvalidAmount = amounts.some((value) => value === null);
  const validAmounts = amounts.filter((value) => value !== null);
  const total = window.Buchnancials.roundMoney(validAmounts.reduce((sum, value) => sum + value, 0));
  const remaining = window.Buchnancials.roundMoney(txAmount - total);
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
  return valid;
};

window.Buchnancials.renderSplitPreview = function renderSplitPreview(previewList, splitItems) {
  if (!previewList) {
    return;
  }

  previewList.textContent = "";
  if (!Array.isArray(splitItems) || splitItems.length === 0) {
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
    labelText.textContent = split.excluded ? `${split.category_name} (ignoriert)` : split.category_name;
    labelWrap.appendChild(labelText);

    const amount = document.createElement("span");
    amount.className = "split-preview-item-amount";
    amount.textContent = window.Buchnancials.formatMoney(split.amount);

    item.appendChild(labelWrap);
    item.appendChild(amount);
    previewList.appendChild(item);
  });

  previewList.hidden = false;
};

window.Buchnancials.patchTransaction = async function patchTransaction(transactionId, payload) {
  return window.Buchnancials.jsonFetch(`/transactions/${transactionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};

window.Buchnancials.fetchTransactionSplits = async function fetchTransactionSplits(transactionId) {
  const response = await window.Buchnancials.jsonFetch(`/transactions/${transactionId}/splits`);
  const splits = Array.isArray(response.splits)
    ? response.splits
        .map((split) => window.Buchnancials.normalizeSplitItem(split))
        .filter((split) => Number.isFinite(split.amount))
    : [];
  return { ...response, splits };
};

window.Buchnancials.askDecision = function askDecision({ title, message, actions }) {
  const availableActions = Array.isArray(actions) && actions.length > 0
    ? actions
    : [
        { label: "Abbrechen", value: "cancel", variant: "secondary" },
        { label: "Bestätigen", value: "confirm", variant: "primary" },
      ];

  if (!document.body) {
    const fallback = window.confirm(message);
    return Promise.resolve(fallback ? availableActions[availableActions.length - 1].value : availableActions[0].value);
  }

  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "decision-backdrop";

    const modal = document.createElement("div");
    modal.className = "decision-modal";

    const heading = document.createElement("h3");
    heading.textContent = title;
    modal.appendChild(heading);

    const messageEl = document.createElement("p");
    String(message || "").split("\n").forEach((line, index) => {
      if (index > 0) {
        messageEl.appendChild(document.createElement("br"));
      }
      messageEl.appendChild(document.createTextNode(line));
    });
    modal.appendChild(messageEl);

    const actionsWrap = document.createElement("div");
    actionsWrap.className = "decision-actions";
    availableActions.forEach((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = action.variant === "primary" ? "btn-primary" : "btn-secondary";
      button.textContent = action.label;
      button.addEventListener("click", () => {
        teardown();
        resolve(action.value);
      });
      actionsWrap.appendChild(button);
    });
    modal.appendChild(actionsWrap);

    function teardown() {
      document.removeEventListener("keydown", onKeydown);
      backdrop.remove();
    }

    function onKeydown(event) {
      if (event.key === "Escape") {
        teardown();
        resolve(availableActions[0].value);
      }
    }

    backdrop.addEventListener("click", (event) => {
      if (event.target !== backdrop) {
        return;
      }
      teardown();
      resolve(availableActions[0].value);
    });

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    document.addEventListener("keydown", onKeydown);
    const primaryButton = actionsWrap.querySelector(".btn-primary") || actionsWrap.querySelector("button");
    if (primaryButton) {
      primaryButton.focus();
    }
  });
};

window.Buchnancials.confirmAction = async function confirmAction({
  title,
  message,
  confirmLabel = "Bestätigen",
  cancelLabel = "Abbrechen",
}) {
  const decision = await window.Buchnancials.askDecision({
    title,
    message,
    actions: [
      { label: cancelLabel, value: "cancel", variant: "secondary" },
      { label: confirmLabel, value: "confirm", variant: "primary" },
    ],
  });
  return decision === "confirm";
};

window.Buchnancials.isHexColor = function isHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test((value || "").trim());
};

window.Buchnancials.hexToRgba = function hexToRgba(hex, alpha) {
  const normalized = (hex || "").trim();
  if (!window.Buchnancials.isHexColor(normalized)) {
    return null;
  }
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

window.Buchnancials.formatSankeyCompactEuro = function formatSankeyCompactEuro(value) {
  return formatGroupedEuro(value, true);
};

window.Buchnancials.formatSankeyNodeEuro = function formatSankeyNodeEuro(value) {
  return formatGroupedEuro(value, false);
};

window.Buchnancials.normalizeOverviewSankeyLabel = function normalizeOverviewSankeyLabel(label) {
  const raw = String(label || "").trim();
  if (raw === "Net") {
    return window.Buchnancials.sankeyBalanceNodeLabel;
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
  return window.Buchnancials.normalizeCategoryLabel(raw, { stripInactiveSuffix: false });
};

window.Buchnancials.normalizeSankeyForOverviewStyle = function normalizeSankeyForOverviewStyle(sankey) {
  const nodesRaw = Array.isArray(sankey?.nodes) ? sankey.nodes : [];
  const linksRaw = Array.isArray(sankey?.links) ? sankey.links : [];
  const nodeColorsRaw = sankey?.node_colors && typeof sankey.node_colors === "object" ? sankey.node_colors : {};

  const nodes = [];
  const seen = new Set();
  nodesRaw.forEach((node) => {
    const mapped = window.Buchnancials.normalizeOverviewSankeyLabel(node);
    if (!seen.has(mapped)) {
      seen.add(mapped);
      nodes.push(mapped);
    }
  });

  const links = linksRaw.map((link) => ({
    source: window.Buchnancials.normalizeOverviewSankeyLabel(link.source),
    target: window.Buchnancials.normalizeOverviewSankeyLabel(link.target),
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
    nodeColors[window.Buchnancials.normalizeOverviewSankeyLabel(label)] = color;
  });
  return { nodes, links, node_colors: nodeColors };
};

window.Buchnancials.orderSankeyNodesForDisplay = function orderSankeyNodesForDisplay(nodes, links, options = {}) {
  const sourceNodes = Array.isArray(nodes) ? nodes : [];
  return sourceNodes.slice();
};

window.Buchnancials.orderSankeyLinksForDisplay = function orderSankeyLinksForDisplay(links, nodeIndex) {
  const source = Array.isArray(links) ? links.slice() : [];
  return source;
};

window.Buchnancials.exportPlotAsJpg = async function exportPlotAsJpg(chartEl, filename, exportTitle) {
  const width = Math.max(Math.round(chartEl.clientWidth || 900), 640);
  const height = Math.max(Math.round(chartEl.clientHeight || 300), 280);
  const priorPaperBg = chartEl.layout?.paper_bgcolor ?? "rgba(0,0,0,0)";
  const priorPlotBg = chartEl.layout?.plot_bgcolor ?? "rgba(0,0,0,0)";
  const priorTitle = chartEl.layout?.title ?? { text: "" };
  const priorMarginTop = Number(chartEl.layout?.margin?.t ?? 10);
  const titleText = chartEl.dataset.exportTitle || exportTitle || "Diagramm";
  try {
    await window.Plotly.relayout(chartEl, {
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#ffffff",
      title: {
        text: titleText,
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
};

window.Buchnancials.createPlotExportButtonManager = function createPlotExportButtonManager(config = {}) {
  const {
    chartIdPrefix = "plot",
    buttonClassName = "btn-secondary sankey-export-btn",
    buttonText = "JPG exportieren",
    defaultFilename = "buchnancials-sankey.jpg",
    defaultExportTitle = "Diagramm",
    successMessage = "Diagramm als JPG exportiert.",
    errorMessage = "Diagramm-Export fehlgeschlagen.",
    getChartContainer = (el) => el.parentElement,
    getFilename = () => defaultFilename,
    getExportTitle = () => defaultExportTitle,
  } = config;

  function ensureChartId(el) {
    if (!el.id) {
      sankeyExportCounters[chartIdPrefix] = (sankeyExportCounters[chartIdPrefix] || 0) + 1;
      el.id = `${chartIdPrefix}-${sankeyExportCounters[chartIdPrefix]}`;
    }
    return el.id;
  }

  function findHost(el) {
    const chartContainer = getChartContainer(el);
    if (!chartContainer) {
      return null;
    }
    const hostParent = chartContainer.parentElement || chartContainer;
    return { chartContainer, hostParent };
  }

  function setVisibility(el, visible) {
    const chartId = ensureChartId(el);
    const host = findHost(el);
    if (!host) {
      return;
    }
    const button = host.hostParent.querySelector(`.sankey-export-btn[data-target-chart-id="${chartId}"]`);
    if (button) {
      button.hidden = !visible;
    }
  }

  function ensureButton(el, options = {}) {
    const host = findHost(el);
    if (!host) {
      return;
    }
    const chartId = ensureChartId(el);
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
      button.className = buttonClassName;
      button.textContent = buttonText;
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        const targetId = button.dataset.targetChartId;
        const target = targetId ? document.getElementById(targetId) : null;
        if (!target || !window.Plotly) {
          return;
        }
        button.disabled = true;
        try {
          await window.Buchnancials.exportPlotAsJpg(target, button.dataset.filename || defaultFilename, target.dataset.exportTitle || defaultExportTitle);
          window.Buchnancials.notify(successMessage, "success");
        } catch (err) {
          window.Buchnancials.notify(errorMessage, "error");
        } finally {
          button.disabled = false;
        }
      });
      row.appendChild(button);
    }
    button.dataset.targetChartId = chartId;
    button.dataset.filename = getFilename(el, options.filenameBase || "diagramm");
    el.dataset.exportTitle = getExportTitle(el, options.exportTitle || "Diagramm");
    button.hidden = false;
  }

  return {
    ensureButton,
    setVisibility,
  };
};

window.Buchnancials.renderSankeyChart = function renderSankeyChart(el, sankey, options = {}) {
  if (!window.Plotly || !el) {
    return;
  }

  const balanceNodeLabel = window.Buchnancials.sankeyBalanceNodeLabel;
  const normalized = sankey || {};
  const nodes = Array.isArray(normalized.nodes) ? normalized.nodes : [];
  const links = Array.isArray(normalized.links) ? normalized.links : [];
  const isEmpty = typeof options.isEmpty === "function" ? options.isEmpty(normalized) : nodes.length === 0;
  if (isEmpty) {
    el.innerHTML = `<small>${options.emptyMessage || "Keine ausreichenden Daten für den Sankey."}</small>`;
    if (options.exporter) {
      options.exporter.setVisibility(el, false);
    }
    return;
  }

  const orderedNodes = window.Buchnancials.orderSankeyNodesForDisplay(nodes, links, { balanceNodeLabel });
  const index = new Map();
  orderedNodes.forEach((label, idx) => index.set(label, idx));
  const orderedLinks = window.Buchnancials.orderSankeyLinksForDisplay(links, index);
  const source = [];
  const target = [];
  const value = [];
  const color = [];
  const customdata = [];
  const isCompactViewport = window.matchMedia("(max-width: 760px)").matches;

  const incomeNodes = new Set();
  const expenseNodes = new Set();
  orderedLinks.forEach((link) => {
    if (link.target === balanceNodeLabel) {
      incomeNodes.add(link.source);
    } else if (link.source === balanceNodeLabel) {
      expenseNodes.add(link.target);
    }
  });

  const inbound = new Map();
  const outbound = new Map();
  orderedLinks.forEach((link) => {
    const linkValue = Number(link.value || 0);
    outbound.set(link.source, (outbound.get(link.source) || 0) + linkValue);
    inbound.set(link.target, (inbound.get(link.target) || 0) + linkValue);
  });
  const displayLabels = orderedNodes.map((label) => {
    const total = Math.max(inbound.get(label) || 0, outbound.get(label) || 0);
    if (isCompactViewport || total <= 0) {
      return label;
    }
    return `${label} · ${window.Buchnancials.formatSankeyNodeEuro(total)}`;
  });

  const providedNodeColors = normalized.node_colors || {};
  const nodeColors = orderedNodes.map((label) => {
    if (providedNodeColors[label]) {
      return providedNodeColors[label];
    }
    if (label === balanceNodeLabel) {
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
  const nodeCount = Math.max(orderedNodes.length, 1);
  const nodeThickness = isCompactViewport ? 14 : nodeCount > 16 ? 16 : 18;
  const nodePad = isCompactViewport ? 8 : nodeCount > 16 ? 8 : 10;
  const chartHeight = Math.min(
    isCompactViewport ? 380 : 480,
    Math.max(
      isCompactViewport ? 280 : 320,
      nodeCount * nodeThickness + Math.max(0, nodeCount - 1) * nodePad + (isCompactViewport ? 52 : 64)
    )
  );
  const chartContainer =
    el.closest(".planning-yearly-sankey-chart") || el.closest(".sankey-container") || el.parentElement;
  if (chartContainer) {
    chartContainer.style.height = `${chartHeight}px`;
  }
  el.style.height = `${chartHeight}px`;

  orderedLinks.forEach((link) => {
    if (options.skipMissingNodes && (!index.has(link.source) || !index.has(link.target))) {
      return;
    }
    source.push(index.get(link.source));
    target.push(index.get(link.target));
    value.push(Number(link.value || 0));
    customdata.push(window.Buchnancials.formatSankeyCompactEuro(link.value));
    if (link.color) {
      color.push(link.color);
    } else if (link.target === balanceNodeLabel) {
      color.push("rgba(103, 142, 132, 0.35)");
    } else if (link.source === balanceNodeLabel) {
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
        textfont: { size: isCompactViewport ? 9 : nodeCount > 16 ? 10 : 11, color: "#26333a" },
        node: {
          label: displayLabels,
          color: nodeColors,
          pad: nodePad,
          thickness: nodeThickness,
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
      height: chartHeight,
      margin: { l: isCompactViewport ? 12 : 24, r: isCompactViewport ? 16 : 28, t: 14, b: isCompactViewport ? 24 : 28 },
      paper_bgcolor: "rgba(0,0,0,0)",
      font: { size: 12 },
    },
    { displayModeBar: false, responsive: true }
  );

  if (options.exporter) {
    options.exporter.ensureButton(el, {
      filenameBase: options.filenameBase || "diagramm",
      exportTitle: options.exportTitle || "Diagramm",
    });
  }
};

(function setActiveNavigationState() {
  const currentPath = (window.location.pathname || "/").replace(/\/+$/, "") || "/";
  document.querySelectorAll("nav [data-nav-link]").forEach((link) => {
    const href = (link.getAttribute("href") || "").replace(/\/+$/, "") || "/";
    if (href === currentPath) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
})();
