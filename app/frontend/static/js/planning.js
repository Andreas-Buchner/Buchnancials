(function () {
  const topNSelect = document.getElementById("planning-top-n");
  const refreshBtn = document.getElementById("planning-refresh");
  const overviewCards = document.getElementById("planning-overview-cards");
  const violinChart = document.getElementById("planning-violin-chart");
  const stackedChart = document.getElementById("planning-stacked-chart");
  const cashflowChart = document.getElementById("planning-cashflow-chart");

  function compactEuro(value) {
    const amount = Number(value || 0);
    return `${Math.round(amount).toLocaleString("de-AT")} €`;
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
    } catch (err) {
      window.Buchnancials.notify(err.message, "error");
      renderEmpty(violinChart, "Fehler beim Laden der Planungsdaten.");
      renderEmpty(stackedChart, "Fehler beim Laden der Planungsdaten.");
      renderEmpty(cashflowChart, "Fehler beim Laden der Planungsdaten.");
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
