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
