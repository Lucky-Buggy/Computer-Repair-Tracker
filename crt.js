
const REPAIRS_KEY = "computer-repair-tracker-repairs";
const NEXT_ID_KEY = "computer-repair-tracker-next-id";
const TICKET_NUMBER_OFFSET = 1000;
const REPAIR_STATUSES = ["Pending", "Diagnosing", "Repairing", "Ready", "Completed"];

function readRepairs() {
  try {
    const raw = localStorage.getItem(REPAIRS_KEY);
    if (raw === null) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeRepairs(repairs, nextId) {
  try {
    localStorage.setItem(REPAIRS_KEY, JSON.stringify(repairs));
    if (nextId) localStorage.setItem(NEXT_ID_KEY, String(nextId));
  } catch {
    throw new Error("Your browser is blocking storage, so the ticket could not be saved.");
  }
}

function nextRepairId(repairs) {
  const saved = Number(localStorage.getItem(NEXT_ID_KEY));
  const highest = repairs.reduce((max, repair) => Math.max(max, repair.id), 0);
  return Math.max(saved || 0, highest + 1);
}

function withTicketNumber(repair) {
  return { ...repair, ticketNumber: repair.id + TICKET_NUMBER_OFFSET };
}

function cleanRepairInput(input, requireAll) {
  const text = (value) => (typeof value === "string" ? value.trim() : value);
  const required = { customerName: "Customer name", deviceType: "Device type", problem: "Problem description" };

  for (const [key, label] of Object.entries(required)) {
    if (key in input || requireAll) {
      if (!text(input[key])) throw new Error(`${label} is required.`);
    }
  }
  if ((requireAll || "status" in input) && !REPAIR_STATUSES.includes(input.status)) {
    throw new Error("Choose a valid status.");
  }
  if ((requireAll || "dateReceived" in input) && !/^\d{4}-\d{2}-\d{2}$/.test(input.dateReceived || "")) {
    throw new Error("Enter a valid date received.");
  }

  const clean = {};
  for (const key of ["customerName", "contact", "deviceType", "brand", "model", "dateReceived", "problem", "status"]) {
    if (key in input) clean[key] = text(input[key]) || (["contact", "brand", "model"].includes(key) ? null : text(input[key]));
  }
  return clean;
}

// Same functions the original API file had, now backed by localStorage.
async function listRepairs(search = "", status = "") {
  let repairs = readRepairs();
  if (status) repairs = repairs.filter((repair) => repair.status === status);

  const term = search.trim().replace(/^#/, "").trim().toLowerCase();
  if (term) {
    repairs = repairs.filter((repair) => {
      const text = [repair.customerName, repair.contact, repair.deviceType, repair.brand, repair.model, repair.problem]
        .filter(Boolean).join("\n").toLowerCase();
      const matchesTicket = /^\d+$/.test(term) && repair.id + TICKET_NUMBER_OFFSET === Number(term);
      return text.includes(term) || matchesTicket;
    });
  }

  return repairs
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : b.id - a.id))
    .map(withTicketNumber);
}

async function getRepair(id) {
  const repair = readRepairs().find((item) => item.id === Number(id));
  if (!repair) throw new Error("Repair ticket not found");
  return withTicketNumber(repair);
}

async function createRepair(input) {
  const repairs = readRepairs();
  const id = nextRepairId(repairs);
  const now = new Date().toISOString();
  const repair = { id, contact: null, brand: null, model: null, ...cleanRepairInput(input, true), createdAt: now, updatedAt: now };
  writeRepairs([...repairs, repair], id + 1);
  return withTicketNumber(repair);
}

async function updateRepair(id, input) {
  const repairs = readRepairs();
  const index = repairs.findIndex((item) => item.id === Number(id));
  if (index === -1) throw new Error("Repair ticket not found");
  const changes = cleanRepairInput(input, false);
  if (!Object.keys(changes).length) throw new Error("At least one repair field is required");
  repairs[index] = { ...repairs[index], ...changes, updatedAt: new Date().toISOString() };
  writeRepairs(repairs);
  return withTicketNumber(repairs[index]);
}

async function deleteRepair(id) {
  const repairs = readRepairs();
  if (!repairs.some((item) => item.id === Number(id))) throw new Error("Repair ticket not found");
  writeRepairs(repairs.filter((item) => item.id !== Number(id)));
  return { deleted: true, id: Number(id) };
}

async function getRepairStats() {
  const stats = { total: 0, pending: 0, diagnosing: 0, repairing: 0, ready: 0, completed: 0 };
  for (const repair of readRepairs()) {
    stats[repair.status.toLowerCase()] += 1;
    stats.total += 1;
  }
  return stats;
}

// =====================================================================
// App (same interface code as the original)
// =====================================================================
const app = document.querySelector("#app");
const sidebar = document.querySelector("#sidebar");
const menuBackdrop = document.querySelector("#menu-backdrop");
const modalRoot = document.querySelector("#modal-root");
const toastRoot = document.querySelector("#toast-root");
const repairRows = document.querySelector("#repair-rows");
const searchInput = document.querySelector("#repair-search");
const statusFilter = document.querySelector("#status-filter");
const clearFiltersButton = document.querySelector("#clear-filters");
const backToTopButton = document.querySelector("#back-to-top");

const statusClasses = {
  Pending: "pending",
  Diagnosing: "diagnosing",
  Repairing: "repairing",
  Ready: "ready",
  Completed: "completed",
};

const iconPaths = {
  plus: '<path d="M12 5v14M5 12h14"></path>',
  close: '<path d="m18 6-12 12M6 6l12 12"></path>',
  moon: '<path d="M20.8 13A8.5 8.5 0 0 1 11 3.2 8.5 8.5 0 1 0 20.8 13Z"></path>',
  sun: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"></path>',
  ticket: '<path d="M3 8a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a3 3 0 0 1 0-6V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2zM13 4v3m0 4v2m0 4v3"></path>',
  clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
  wrench: '<path d="M14.7 6.3a5 5 0 0 0-6.4 6.4L3 18a2.1 2.1 0 0 0 3 3l5.3-5.3a5 5 0 0 0 6.4-6.4l-3 3-3-3z"></path>',
  check: '<path d="m5 12 4 4L19 6"></path>',
  search: '<circle cx="11" cy="11" r="7"></circle><path d="m16 16 4 4"></path>',
  chevron: '<path d="m7 10 5 5 5-5"></path>',
  arrowRight: '<path d="M5 12h14m-7-7 7 7-7 7"></path>',
  arrowUp: '<path d="m18 15-6-6-6 6m6-6v12"></path>',
  user: '<circle cx="12" cy="8" r="4"></circle><path d="M5 21a7 7 0 0 1 14 0"></path>',
  computer: '<rect x="3" y="4" width="18" height="13" rx="2"></rect><path d="M8 21h8m-4-4v4"></path>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"></path>',
  trash: '<path d="M3 6h18m-2 0-.9 14H5.9L5 6m4 0V4h6v2m-5 4v6m4-6v6"></path>',
  pencil: '<path d="m15 5 4 4M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15z"></path>',
  alert: '<circle cx="12" cy="12" r="9"></circle><path d="M12 8v5m0 3h.01"></path>',
};

const savedTheme = localStorage.getItem("repair-tracker-theme");
const state = {
  repairs: [],
  stats: null,
  search: "",
  status: "",
  theme: savedTheme === "dark" ? "dark" : "light",
  menuOpen: false,
  modal: null,
  listRequest: 0,
};

let searchTimer;
let toastTimer;

function icon(name, className = "", strokeWidth = 2.2) {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || ""}</svg>`;
}

// Show customer text safely in the page.
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return replacements[character];
  });
}

function localDateString() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function formatDate(value, includeYear = false) {
  if (!value) return "—";
  const dateText = String(value).slice(0, 10);
  const [year, month, day] = dateText.split("-").map(Number);
  if (!year || !month || !day) return escapeHtml(dateText);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
  }).format(new Date(year, month - 1, day));
}

function statusPill(status) {
  const knownStatus = statusClasses[status] ? status : "Pending";
  const label = escapeHtml(status);
  return `<span class="status-pill status-${statusClasses[knownStatus]}"><span class="status-dot"></span>${label}</span>`;
}

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem("repair-tracker-theme", theme);

  const button = document.querySelector("#theme-toggle");
  const nextMode = theme === "dark" ? "light" : "dark";
  button.innerHTML = icon(theme === "dark" ? "sun" : "moon");
  button.setAttribute("aria-label", `Switch to ${nextMode} mode`);
  button.title = `Switch to ${nextMode} mode`;
}

function renderStats() {
  const stats = state.stats;
  document.querySelector("#stat-total").textContent = stats?.total ?? "—";
  document.querySelector("#stat-attention").textContent = stats
    ? stats.pending + stats.diagnosing
    : "—";
  document.querySelector("#stat-repairing").textContent = stats?.repairing ?? "—";
  document.querySelector("#stat-ready").textContent = stats?.ready ?? "—";
  document.querySelector("#completed-count").textContent = stats?.completed ?? "—";
}

function renderRepairRows(repairs = state.repairs, error = "") {
  const count = repairs.length;
  document.querySelector("#ticket-count").textContent = count;
  document.querySelector("#showing-count").innerHTML = `Showing <strong>${count}</strong> ticket${count === 1 ? "" : "s"}`;

  if (error) {
    repairRows.innerHTML = `
      <div class="empty-state error-state" data-testid="error-repairs">
        ${icon("alert", "large-icon")}
        <h3>Could not load the workboard</h3>
        <p>${escapeHtml(error)}</p>
        <button class="primary-button" type="button" data-action="retry-list">Try again</button>
      </div>`;
    return;
  }

  if (!repairs.length) {
    const hasFilters = state.search.trim() || state.status;
    repairRows.innerHTML = `
      <div class="empty-state" data-testid="empty-repairs">
        ${icon("ticket", "large-icon")}
        <h3>${hasFilters ? "No matching tickets" : "Your workboard is clear"}</h3>
        <p>${hasFilters ? "Try another search or clear the filters." : "Open the first ticket when a customer is ready."}</p>
        ${hasFilters ? "" : '<button class="primary-button" type="button" data-action="new-ticket">Open a ticket</button>'}
      </div>`;
    return;
  }

  repairRows.innerHTML = repairs.map((repair) => {
    const brand = repair.brand ? ` · ${escapeHtml(repair.brand)}` : "";
    const date = formatDate(repair.dateReceived);
    const customer = escapeHtml(repair.customerName);
    const number = escapeHtml(repair.ticketNumber);
    const accessibleName = escapeHtml(`View ticket ${repair.ticketNumber} for ${repair.customerName}`);

    return `
      <button class="ticket-row" type="button" data-action="view-ticket" data-id="${Number(repair.id)}" aria-label="${accessibleName}" data-testid="row-repair-${Number(repair.id)}">
        <span class="ticket-cell ticket-number-cell">
          <strong class="ticket-number">#${number}</strong>
          <span class="mobile-date">${date}</span>
        </span>
        <span class="ticket-cell customer-cell">
          <span class="customer-icon">${icon("user")}</span>
          <span class="customer-copy"><strong>${customer}</strong><small>${escapeHtml(repair.contact || "No contact provided")}</small></span>
        </span>
        <span class="ticket-cell device-cell">${icon("computer", "mobile-device-icon")}<span>${escapeHtml(repair.deviceType)}${brand}</span></span>
        <span class="ticket-cell status-cell">${statusPill(repair.status)}</span>
        <span class="ticket-cell received-cell">${date}</span>
        <span class="ticket-cell arrow-cell">${icon("arrowRight")}</span>
      </button>`;
  }).join("");
}

function updateClearButton() {
  clearFiltersButton.hidden = !searchInput.value.trim() && !statusFilter.value;
}

async function loadRepairs() {
  const requestNumber = ++state.listRequest;
  state.search = searchInput.value;
  state.status = statusFilter.value;
  updateClearButton();
  repairRows.innerHTML = '<div class="loading-state">Loading repair tickets…</div>';

  try {
    const repairs = await listRepairs(state.search, state.status);
    if (requestNumber !== state.listRequest) return;
    state.repairs = repairs;
    renderRepairRows(repairs);
  } catch (error) {
    if (requestNumber !== state.listRequest) return;
    renderRepairRows([], error.message || "The repair list is unavailable right now.");
  }
}

async function loadStats() {
  try {
    state.stats = await getRepairStats();
    renderStats();
  } catch (error) {
    showToast(`Could not load repair totals: ${error.message}`, "error");
  }
}

async function refreshDashboard() {
  await Promise.all([loadRepairs(), loadStats()]);
}

function setMenuOpen(open) {
  state.menuOpen = open;
  sidebar.classList.toggle("open", open);
  menuBackdrop.hidden = !open;
  document.body.classList.toggle("menu-open", open);
  updateBackToTop();
}

function updateBackToTop() {
  backToTopButton.hidden =
    window.scrollY <= 400 ||
    state.menuOpen ||
    Boolean(state.modal) ||
    !toastRoot.hidden;
}

function showToast(message, type = "success") {
  window.clearTimeout(toastTimer);
  toastRoot.className = `toast-root toast-${type}`;
  toastRoot.innerHTML = `${icon(type === "error" ? "alert" : "check")}<span>${escapeHtml(message)}</span>`;
  toastRoot.hidden = false;
  updateBackToTop();

  toastTimer = window.setTimeout(() => {
    toastRoot.hidden = true;
    updateBackToTop();
  }, 3500);
}

function closeModal() {
  state.modal = null;
  modalRoot.innerHTML = "";
  updateBackToTop();
}

function showForm(mode, repair = null) {
  state.modal = { type: "form", mode, repair };
  const isEdit = mode === "edit";
  const values = repair || {};
  const dateReceived = values.dateReceived
    ? String(values.dateReceived).slice(0, 10)
    : localDateString();
  const statusOptions = ["Pending", "Diagnosing", "Repairing", "Ready", "Completed"];

  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal-card form-modal" role="dialog" aria-modal="true" aria-labelledby="repair-form-title" data-testid="dialog-${mode}-repair">
        <header class="modal-header">
          <div>
            <p class="eyebrow accent-text">${isEdit ? `Ticket #${escapeHtml(values.ticketNumber)}` : "New intake"}</p>
            <h2 id="repair-form-title">${isEdit ? "Update repair ticket" : "Open a repair ticket"}</h2>
          </div>
          <button class="icon-button" type="button" data-action="close-modal" aria-label="Close form">${icon("close")}</button>
        </header>
        <form id="repair-form" class="repair-form">
          <section class="form-section">
            <h3><span>01</span>Customer &amp; device</h3>
            <div class="form-grid">
              <label class="form-field">
                <span>Customer name <b>*</b></span>
                <input name="customerName" value="${escapeHtml(values.customerName)}" maxlength="160" required placeholder="e.g. Juan Dela Cruz" data-testid="input-customer-name" />
              </label>
              <label class="form-field">
                <span>Contact <small>optional</small></span>
                <input name="contact" value="${escapeHtml(values.contact)}" maxlength="200" placeholder="Phone or email" data-testid="input-contact" />
              </label>
              <label class="form-field">
                <span>Device type <b>*</b></span>
                <input name="deviceType" value="${escapeHtml(values.deviceType)}" maxlength="80" required placeholder="e.g. Laptop" data-testid="input-device-type" />
              </label>
              <label class="form-field">
                <span>Brand &amp; model <small>optional</small></span>
                <span class="paired-fields">
                  <input name="brand" value="${escapeHtml(values.brand)}" maxlength="100" placeholder="Brand" data-testid="input-brand" />
                  <input name="model" value="${escapeHtml(values.model)}" maxlength="120" placeholder="Model" data-testid="input-model" />
                </span>
              </label>
            </div>
          </section>
          <section class="form-section">
            <h3><span>02</span>Repair brief</h3>
            <div class="form-grid">
              <label class="form-field">
                <span>Date received <b>*</b></span>
                <input name="dateReceived" type="date" value="${escapeHtml(dateReceived)}" max="${localDateString()}" required data-testid="input-date-received" />
              </label>
              <label class="form-field">
                <span>Current status <b>*</b></span>
                <select name="status" required data-testid="select-status">
                  ${statusOptions.map((status) => `<option value="${status}" ${values.status === status ? "selected" : ""}>${status}</option>`).join("")}
                </select>
              </label>
              <label class="form-field full-width">
                <span>Problem description <b>*</b><small class="character-count"><span id="problem-length">${String(values.problem || "").length}</span>/4000</small></span>
                <textarea name="problem" maxlength="4000" required rows="4" placeholder="What brought the device in? Include symptoms, damage, or customer notes." data-testid="input-problem">${escapeHtml(values.problem)}</textarea>
              </label>
            </div>
          </section>
          <p id="form-error" class="form-error" role="alert" hidden></p>
          <footer class="form-actions">
            <button class="secondary-button" type="button" data-action="close-modal" data-testid="button-cancel-form">Cancel</button>
            <button class="primary-button" type="submit" data-testid="button-submit-repair">
              ${icon(isEdit ? "check" : "plus")}
              ${isEdit ? "Save changes" : "Create ticket"}
            </button>
          </footer>
        </form>
      </section>
    </div>`;

  modalRoot.querySelector('[name="customerName"]').focus();
  updateBackToTop();
}

function showLoadingDetails() {
  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal-card small-modal" role="dialog" aria-modal="true" aria-label="Loading ticket details">
        <div class="loading-state">Loading latest ticket details…</div>
      </section>
    </div>`;
  updateBackToTop();
}

function renderDetails(repair, error = "") {
  state.modal = { type: "details", repair };
  const device = [repair.deviceType, repair.brand, repair.model].filter(Boolean).map(escapeHtml).join(" · ");

  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal-card detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title" data-testid="dialog-view-repair-${Number(repair.id)}">
        <header class="detail-header">
          <div class="detail-header-content">
            <div>
              <p class="eyebrow accent-text">Ticket #${escapeHtml(repair.ticketNumber)}</p>
              <h2 id="detail-title">${escapeHtml(repair.customerName)}</h2>
              <p>${device}</p>
            </div>
            <button class="icon-button detail-close" type="button" data-action="close-modal" aria-label="Close ticket details">${icon("close")}</button>
          </div>
          <div class="detail-meta">${statusPill(repair.status)}<span>Received ${formatDate(repair.dateReceived)}</span></div>
        </header>
        <div class="detail-content">
          ${error ? `<p class="detail-warning">${escapeHtml(error)} Showing the last available details.</p>` : ""}
          <div class="detail-facts">
            <div><span>Contact</span><strong>${escapeHtml(repair.contact || "Not provided")}</strong></div>
            <div><span>Opened</span><strong>${formatDate(repair.createdAt, true)}</strong></div>
          </div>
          <div class="problem-block">
            <span>Problem description</span>
            <p data-testid="text-problem-${Number(repair.id)}">${escapeHtml(repair.problem)}</p>
          </div>
          <footer class="detail-actions">
            <button class="danger-text-button" type="button" data-action="delete-ticket">${icon("trash")}Delete ticket</button>
            <div>
              <button class="secondary-button" type="button" data-action="close-modal">Close</button>
              <button class="primary-button" type="button" data-action="edit-ticket" data-testid="button-edit-repair-${Number(repair.id)}">${icon("pencil")}Edit ticket</button>
            </div>
          </footer>
        </div>
      </section>
    </div>`;
  updateBackToTop();
}

async function openDetails(id) {
  const repairId = Number(id);
  const fallback = state.repairs.find((repair) => repair.id === repairId);
  state.modal = { type: "loading", id: repairId };
  showLoadingDetails();

  try {
    const repair = await getRepair(repairId);
    if (state.modal?.type !== "loading" || state.modal.id !== repairId) return;
    renderDetails(repair);
  } catch (error) {
    if (state.modal?.type !== "loading" || state.modal.id !== repairId) return;
    if (fallback) renderDetails(fallback, error.message);
    else {
      closeModal();
      showToast(error.message, "error");
    }
  }
}

function showDeleteConfirm(repair) {
  state.modal = { type: "delete", repair };
  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal-card small-modal delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" data-testid="dialog-confirm-delete">
        <div class="delete-icon">${icon("trash")}</div>
        <h2 id="delete-title">Delete ticket #${escapeHtml(repair.ticketNumber)}?</h2>
        <p>This will permanently remove the repair record for <strong>${escapeHtml(repair.customerName)}</strong>. This cannot be undone.</p>
        <footer class="form-actions">
          <button class="secondary-button" type="button" data-action="close-modal" data-testid="button-cancel-delete">Keep ticket</button>
          <button class="danger-button" type="button" data-action="confirm-delete" data-testid="button-confirm-delete">${icon("trash")}Delete permanently</button>
        </footer>
      </section>
    </div>`;
  updateBackToTop();
}

function showFormError(message) {
  const error = modalRoot.querySelector("#form-error");
  error.textContent = message;
  error.hidden = false;
}

async function saveForm(form) {
  const dateReceived = form.elements.dateReceived.value;
  if (dateReceived > localDateString()) {
    showFormError("Date received cannot be in the future.");
    return;
  }

  const repair = {
    customerName: form.elements.customerName.value.trim(),
    contact: form.elements.contact.value.trim() || null,
    deviceType: form.elements.deviceType.value.trim(),
    brand: form.elements.brand.value.trim() || null,
    model: form.elements.model.value.trim() || null,
    dateReceived,
    problem: form.elements.problem.value.trim(),
    status: form.elements.status.value,
  };

  const submitButton = form.querySelector('[type="submit"]');
  const isEdit = state.modal?.mode === "edit";
  const repairId = state.modal?.repair?.id;
  submitButton.disabled = true;
  submitButton.textContent = "Saving ticket…";

  try {
    // Saves the form in this browser (localStorage).
    if (isEdit) await updateRepair(repairId, repair);
    else await createRepair(repair);
    closeModal();
    await refreshDashboard();
    showToast(isEdit ? "Ticket updated" : "New ticket created");
  } catch (error) {
    showFormError(error.message || "Could not save this ticket.");
    submitButton.disabled = false;
    submitButton.innerHTML = `${icon(isEdit ? "check" : "plus")}${isEdit ? "Save changes" : "Create ticket"}`;
  }
}

async function confirmDelete(button) {
  const repair = state.modal?.repair;
  if (!repair) return;

  button.disabled = true;
  button.textContent = "Deleting…";
  try {
    await deleteRepair(repair.id);
    closeModal();
    await refreshDashboard();
    showToast(`Ticket #${repair.ticketNumber} deleted`);
  } catch (error) {
    button.disabled = false;
    button.innerHTML = `${icon("trash")}Delete permanently`;
    showToast(error.message || "Could not delete this ticket.", "error");
  }
}

app.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  switch (button.dataset.action) {
    case "open-menu":
      setMenuOpen(true);
      break;
    case "close-menu":
      setMenuOpen(false);
      break;
    case "dashboard":
      setMenuOpen(false);
      break;
    case "new-ticket":
      setMenuOpen(false);
      showForm("create");
      break;
    case "toggle-theme":
      setTheme(state.theme === "dark" ? "light" : "dark");
      break;
    case "refresh":
      await refreshDashboard();
      break;
    case "retry-list":
      await loadRepairs();
      break;
    case "clear-filters":
      searchInput.value = "";
      statusFilter.value = "";
      state.search = "";
      state.status = "";
      updateClearButton();
      await loadRepairs();
      break;
    case "view-ticket":
      await openDetails(button.dataset.id);
      break;
    case "close-modal":
      closeModal();
      break;
    case "edit-ticket": {
      const repair = state.modal?.repair;
      if (repair) showForm("edit", repair);
      break;
    }
    case "delete-ticket":
      if (state.modal?.repair) showDeleteConfirm(state.modal.repair);
      break;
    case "confirm-delete":
      await confirmDelete(button);
      break;
  }
});

app.addEventListener("submit", async (event) => {
  if (event.target.id !== "repair-form") return;
  event.preventDefault();
  await saveForm(event.target);
});

app.addEventListener("click", (event) => {
  if (event.target.classList.contains("modal-backdrop")) closeModal();
});

searchInput.addEventListener("input", () => {
  updateClearButton();
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(loadRepairs, 250);
});

statusFilter.addEventListener("change", loadRepairs);

modalRoot.addEventListener("input", (event) => {
  if (event.target.name !== "problem") return;
  modalRoot.querySelector("#problem-length").textContent = event.target.value.length;
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (state.modal) closeModal();
  else if (state.menuOpen) setMenuOpen(false);
});

backToTopButton.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

menuBackdrop.addEventListener("click", () => setMenuOpen(false));
window.addEventListener("scroll", updateBackToTop, { passive: true });

document.querySelector("#weekday").textContent = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
}).format(new Date());

setTheme(state.theme);
renderStats();
updateBackToTop();
refreshDashboard();
