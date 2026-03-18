(function () {
  const fileInput = document.getElementById("csv-file");
  const previewBtn = document.getElementById("preview-btn");
  const executeBtn = document.getElementById("execute-import-btn");
  const previewSection = document.getElementById("preview-section");
  const previewMeta = document.getElementById("preview-meta");
  const mappingContainer = document.getElementById("mapping-container");
  const previewTable = document.getElementById("preview-table");
  const resultModal = document.getElementById("import-result-modal");
  const resultTitle = document.getElementById("import-result-title");
  const resultMessage = document.getElementById("import-result-message");
  const resultCloseBtn = document.getElementById("import-result-close-btn");
  const progressSection = document.getElementById("progress-section");
  const progressText = document.getElementById("progress-text");
  const progressFill = document.getElementById("progress-fill");

  const canonicalFields = [
    { key: "booking_date", label: "Buchungsdatum", required: true },
    { key: "amount", label: "Betrag", required: true },
    { key: "description", label: "Beschreibung", required: true },
    { key: "counterparty_name", label: "Gegenpartei", required: false },
    { key: "raw_text", label: "Rohtext", required: false },
  ];

  let latestPreview = null;
  let progressTimer = null;

  function setButtonsBusy(isBusy) {
    previewBtn.disabled = isBusy;
    executeBtn.disabled = isBusy;
  }

  function startProgress(message) {
    progressSection.hidden = false;
    progressText.textContent = message;
    progressFill.style.width = "10%";
    if (progressTimer) {
      window.clearInterval(progressTimer);
    }
    progressTimer = window.setInterval(() => {
      const current = Number(progressFill.style.width.replace("%", "")) || 0;
      if (current >= 92) {
        return;
      }
      const step = Math.floor(Math.random() * 8) + 2;
      progressFill.style.width = `${Math.min(92, current + step)}%`;
    }, 250);
  }

  function finishProgress(message) {
    if (progressTimer) {
      window.clearInterval(progressTimer);
      progressTimer = null;
    }
    progressText.textContent = message;
    progressFill.style.width = "100%";
    window.setTimeout(() => {
      progressSection.hidden = true;
      progressFill.style.width = "0%";
    }, 700);
  }

  function failProgress() {
    if (progressTimer) {
      window.clearInterval(progressTimer);
      progressTimer = null;
    }
    progressSection.hidden = true;
    progressFill.style.width = "0%";
  }

  function assertFile() {
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      throw new Error("Bitte zuerst eine CSV-Datei auswählen.");
    }
    return file;
  }

  function renderPreviewTable(headers, rows) {
    const head = `<thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>`;
    const body = rows
      .map(
        (row) =>
          `<tr>${headers.map((header) => `<td>${row[header] || ""}</td>`).join("")}</tr>`
      )
      .join("");
    previewTable.innerHTML = `${head}<tbody>${body}</tbody>`;
  }

  function renderMapping(headers, suggested) {
    mappingContainer.innerHTML = "";
    canonicalFields.forEach((field) => {
      const wrapper = document.createElement("div");
      wrapper.className = "mapping-item";

      const label = document.createElement("label");
      label.textContent = `${field.label}${field.required ? " *" : ""}`;
      wrapper.appendChild(label);

      const select = document.createElement("select");
      select.dataset.fieldKey = field.key;
      select.innerHTML = [`<option value="">-- nicht zugeordnet --</option>`]
        .concat(headers.map((h) => `<option value="${h}">${h}</option>`))
        .join("");

      if (suggested[field.key]) {
        select.value = suggested[field.key];
      }
      wrapper.appendChild(select);
      mappingContainer.appendChild(wrapper);
    });
  }

  function collectMapping() {
    const mapping = {};
    const fieldLabels = {
      booking_date: "Buchungsdatum",
      amount: "Betrag",
      description: "Beschreibung",
    };
    mappingContainer.querySelectorAll("select[data-field-key]").forEach((sel) => {
      mapping[sel.dataset.fieldKey] = sel.value || "";
    });
    ["booking_date", "amount", "description"].forEach((required) => {
      if (!mapping[required]) {
        throw new Error(`Pflichtzuordnung fehlt: ${fieldLabels[required]}`);
      }
    });
    return mapping;
  }

  function showResultModal(title, message) {
    resultTitle.textContent = title;
    resultMessage.textContent = message;
    resultModal.hidden = false;
  }

  function closeResultModal() {
    resultModal.hidden = true;
  }

  resultCloseBtn.addEventListener("click", closeResultModal);
  resultModal.addEventListener("click", (event) => {
    if (event.target === resultModal) {
      closeResultModal();
    }
  });

  previewBtn.addEventListener("click", async () => {
    try {
      setButtonsBusy(true);
      startProgress("Vorschau wird geladen ...");
      const file = assertFile();
      const formData = new FormData();
      formData.append("file", file);
      latestPreview = await window.Buchnancials.jsonFetch("/import/preview", {
        method: "POST",
        body: formData,
      });

      previewMeta.textContent = `Zeilen: ${latestPreview.row_count} | Trennzeichen: ${latestPreview.delimiter} | Kodierung: ${latestPreview.encoding}`;
      renderMapping(latestPreview.headers, latestPreview.mapping_suggestions || {});
      renderPreviewTable(latestPreview.headers, latestPreview.sample_rows || []);
      previewSection.hidden = false;
      finishProgress("Vorschau bereit.");
    } catch (err) {
      failProgress();
      window.Buchnancials.notify(err.message, "error");
    } finally {
      setButtonsBusy(false);
    }
  });

  executeBtn.addEventListener("click", async () => {
    try {
      setButtonsBusy(true);
      startProgress("Import läuft ...");
      assertFile();
      if (!latestPreview) {
        throw new Error("Bitte zuerst die Vorschau laden.");
      }
      const mapping = collectMapping();
      const formData = new FormData();
      formData.append("file", fileInput.files[0]);
      formData.append("mapping_json", JSON.stringify(mapping));
      const result = await window.Buchnancials.jsonFetch("/import/execute", {
        method: "POST",
        body: formData,
      });
      finishProgress("Import abgeschlossen.");
      showResultModal(
        "Import abgeschlossen",
        `Import abgeschlossen.\nNeu importiert: ${result.imported_new}\nÜbersprungen (Duplikate): ${result.ignored_duplicates}\nFehlgeschlagen: ${result.failed_rows}`,
      );
    } catch (err) {
      failProgress();
      showResultModal("Import fehlgeschlagen", `Der Import konnte nicht abgeschlossen werden:\n${err.message}`);
    } finally {
      setButtonsBusy(false);
    }
  });
})();
