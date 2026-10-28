const EXPENSE_CHART_COLORS = ["#d63849", "#e94f5d", "#bc3042", "#f27b72", "#a92838", "#fa655f", "#b34c56", "#f4b4a4", "#824c60"];
const CATEGORIES = {
  expense: ["Moradia", "Alimentação", "Transporte", "Combustível", "Custos do carro", "Saúde", "Educação", "Lazer", "Contas", "Cartão Nubank", "Cartão Atacadão", "Outros"],
  income: ["UBER", "FREELANCE", "SERVIÇO", "VENDAS", "SUPORTE/CUIDADOS", "EXTRAS"]
};
const state = {
  transactions: [], extraWork: [], uberSettings: {}, vehicleProfile: {}, vehicleCosts: [], month: "", filter: "all",
  transactionSortKey: "date", transactionSortDirection: "desc",
  transactionPopoverAnchor: null, transactionPopoverItemId: null,
  calendarMonth: "", calendarWeekStart: "", calendarSelectedDate: "", calendarTooltipDate: "",
  calendarTooltipElement: null, calendarTooltipTimeout: null, remindedTransactions: new Set()
};
const money = new Intl.NumberFormat("pt-BR", {style: "currency", currency: "BRL"});
const monthFormat = new Intl.DateTimeFormat("pt-BR", {month: "long", year: "numeric"});
const monthNameFormat = new Intl.DateTimeFormat("pt-BR", {month: "long"});
const dateFormat = new Intl.DateTimeFormat("pt-BR", {day: "2-digit", month: "short"});
const brazilianDateFormat = new Intl.DateTimeFormat("pt-BR", {day: "2-digit", month: "2-digit", year: "numeric"});
const DEFAULT_WEEKDAY_HOURLY_RATE = 38;
const DEFAULT_WEEKEND_HOURLY_RATE = 50;
const THEME_STORAGE_KEY = "casa-em-dia-theme";
const REMINDED_TRANSACTIONS_STORAGE_KEY = "casa-em-dia-calendar-reminders";
const THEMES = new Set(["blue", "green", "yellow", "red"]);
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const amountOf = (transaction) => Number(transaction.amount);
const formatDateInput = (date) => `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
const formatIsoDateInput = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function parseBrazilianAmount(value) {
  const input = String(value).trim().replace(/\s|R\$/g, "");
  if (!input) return NaN;
  if (input.includes(",")) {
    if (!/^\d+(?:\.\d{3})*,\d{1,2}$/.test(input)) return NaN;
    return Number(input.replace(/\./g, "").replace(",", "."));
  }
  if (/^\d{1,3}(?:\.\d{3})+$/.test(input)) return Number(input.replace(/\./g, ""));
  if (!/^\d+(?:\.\d{1,2})?$/.test(input)) return NaN;
  return Number(input);
}

function parseBrazilianDate(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  if (parsed.getFullYear() !== Number(year) || parsed.getMonth() !== Number(month) - 1 || parsed.getDate() !== Number(day)) return null;
  return `${year}-${month}-${day}`;
}

function updateDateMask(input) {
  const digits = input.value.replace(/\D/g, "").slice(0, 8);
  input.value = digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2, 4)}${digits.length > 4 ? `/${digits.slice(4)}` : ""}`;
}
function setTheme(themeName, persist = false) {
  const theme = THEMES.has(themeName) ? themeName : "red";
  document.documentElement.dataset.theme = theme;
  $$("[data-theme-option]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.themeOption === theme));
  });
  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
      console.error("Não foi possível salvar a paleta neste navegador:", error);
      toast("A paleta foi aplicada, mas não pôde ser salva neste navegador.");
    }
  }
}

function loadTheme() {
  let savedTheme = "red";
  try {
    savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || savedTheme;
  } catch (error) {
    console.error("Não foi possível ler a paleta salva neste navegador:", error);
  }
  setTheme(savedTheme);
}

const currentMonth = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

function startOfWeek(date) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  return monday;
}

function shiftDate(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  return formatIsoDateInput(date);
}

function shiftMonth(month, offset) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

async function request(path, options = {}) {
  const response = await fetch(path, {headers: {"Content-Type": "application/json"}, ...options});
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(result.error || "Não foi possível concluir a operação.");
  return result;
}

function monthTransactions() {
  return state.transactions.filter((transaction) => transaction.date.startsWith(state.month));
}

function render() {
  const transactions = monthTransactions();
  const income = transactions.filter((item) => item.type === "income");
  const expenses = transactions.filter((item) => item.type === "expense");
  const incomeTotal = income.reduce((sum, item) => sum + amountOf(item), 0);
  const expenseTotal = expenses.reduce((sum, item) => sum + amountOf(item), 0);
  $("#balance-total").textContent = money.format(incomeTotal - expenseTotal);
  $("#income-total").textContent = money.format(incomeTotal);
  $("#expense-total").textContent = money.format(expenseTotal);
  $("#income-count").textContent = `${income.length} ${income.length === 1 ? "lançamento" : "lançamentos"}`;
  $("#expense-count").textContent = `${expenses.length} ${expenses.length === 1 ? "lançamento" : "lançamentos"}`;
  $("#expense-ratio").textContent = incomeTotal ? `${Math.round(expenseTotal / incomeTotal * 100)}%` : "—";
  renderPie(expenses);
  renderBalanceColumns(transactions);
  renderWeeklyFlows(transactions);
  renderRecent();
  renderTransactions(transactions);
  renderWork(
    income,
    expenses,
    state.extraWork.filter((item) => item.date.startsWith(state.month)),
    state.uberSettings,
    state.vehicleCosts.find((item) => item.month === state.month)?.amount || 0,
    state.vehicleProfile
  );
  renderUberMileage(income);
  renderVehicleCostForm();
  renderUberSettingsForm();
  renderVehicleProfileForm();
  renderExtraWorkList(state.extraWork.filter((item) => item.date.startsWith(state.month)));
  renderCalendar();
  notifyDueTransactions();
}

function renderPie(expenses) {
  const totals = new Map();
  for (const item of expenses) totals.set(item.category, (totals.get(item.category) || 0) + amountOf(item));
  const entries = [...totals].sort((a, b) => b[1] - a[1]);
  const canvas = $("#category-chart");
  const ctx = setupCanvas(canvas);
  const total = entries.reduce((sum, entry) => sum + entry[1], 0);
  $("#pie-empty").hidden = total > 0;
  $("#category-legend").replaceChildren();
  if (!total) return;
  let start = -Math.PI / 2;
  entries.forEach(([category, value], index) => {
    const end = start + (value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(canvas.width / devicePixelRatio / 2, canvas.height / devicePixelRatio / 2);
    ctx.arc(canvas.width / devicePixelRatio / 2, canvas.height / devicePixelRatio / 2, Math.min(canvas.width, canvas.height) / devicePixelRatio * .43, start, end);
    ctx.closePath();
    ctx.fillStyle = EXPENSE_CHART_COLORS[index % EXPENSE_CHART_COLORS.length];
    ctx.fill();
    start = end;
    const row = document.createElement("div");
    row.className = "legend-item";
    const label = document.createElement("span");
    label.className = "legend-name";
    const dot = document.createElement("i");
    dot.className = "legend-dot";
    dot.style.backgroundColor = EXPENSE_CHART_COLORS[index % EXPENSE_CHART_COLORS.length];
    const name = document.createElement("span");
    name.textContent = category;
    label.append(dot, name);
    const amount = document.createElement("span");
    amount.className = "legend-value";
    amount.textContent = money.format(value);
    const percentage = document.createElement("span");
    percentage.className = "legend-percentage";
    percentage.textContent = `${(value / total * 100).toLocaleString("pt-BR", {maximumFractionDigits: 1})}%`;
    const values = document.createElement("span");
    values.className = "legend-values";
    values.append(amount, percentage);
    row.append(label, values);
    $("#category-legend").append(row);
  });
}

function renderBalanceColumns(transactions) {
  const canvas = $("#balance-chart");
  const ctx = setupCanvas(canvas);
  const byDay = new Map();
  for (const transaction of transactions) {
    const day = transaction.date;
    byDay.set(day, (byDay.get(day) || 0) + (transaction.type === "income" ? 1 : -1) * amountOf(transaction));
  }
  const days = [...byDay].sort(([a], [b]) => a.localeCompare(b));
  $("#movement-empty").hidden = days.length > 0;
  if (!days.length) return;
  const width = canvas.width / devicePixelRatio;
  const height = canvas.height / devicePixelRatio;
  const padding = {top: 12, right: 12, bottom: 24, left: 12};
  const maxMagnitude = Math.max(...days.map(([, value]) => Math.abs(value)), 1);
  const plotHeight = height - padding.top - padding.bottom;
  const zero = padding.top + plotHeight / 2;
  const y = (value) => zero - value / maxMagnitude * (plotHeight / 2);
  ctx.strokeStyle = "#edf0ed";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, zero);
  ctx.lineTo(width - padding.right, zero);
  ctx.stroke();
  const slot = (width - padding.left - padding.right) / days.length;
  const barWidth = Math.max(3, Math.min(18, slot * .62));
  days.forEach(([date, value], index) => {
    const x = padding.left + slot * (index + .5);
    const color = value >= 0 ? "#21804b" : "#b83242";
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    const end = y(value);
    ctx.beginPath();
    ctx.roundRect(x - barWidth / 2, Math.min(zero, end), barWidth, Math.max(2, Math.abs(zero - end)), [3, 3, 0, 0]);
    ctx.fill();
    if (days.length <= 12 || index % Math.ceil(days.length / 8) === 0) {
      ctx.fillStyle = "#94a098";
      ctx.font = "9px Arial";
      ctx.textAlign = "center";
      ctx.fillText(date.slice(-2), x, height - 6);
    }
  });
}

function renderWeeklyFlows(transactions) {
  const canvas = $("#weekly-chart");
  const ctx = setupCanvas(canvas);
  const [year, month] = state.month.split("-").map(Number);
  const firstDayOffset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const weekCount = Math.ceil((firstDayOffset + daysInMonth) / 7);
  const weeks = Array.from({length: weekCount}, () => ({income: 0, expense: 0}));
  for (const transaction of transactions) {
    const day = Number(transaction.date.slice(-2));
    const week = Math.floor((firstDayOffset + day - 1) / 7);
    weeks[week][transaction.type] += amountOf(transaction);
  }
  const hasTransactions = transactions.length > 0;
  $("#weekly-empty").hidden = hasTransactions;
  if (!hasTransactions) return;
  const width = canvas.width / devicePixelRatio;
  const height = canvas.height / devicePixelRatio;
  const padding = {top: 12, right: 12, bottom: 25, left: 12};
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...weeks.flatMap((week) => [week.income, week.expense]), 1);
  const y = (value) => padding.top + plotHeight - value / maxValue * plotHeight;
  ctx.strokeStyle = "#edf0ed";
  ctx.lineWidth = 1;
  for (let line = 0; line <= 3; line += 1) {
    const lineY = padding.top + plotHeight * line / 3;
    ctx.beginPath();
    ctx.moveTo(padding.left, lineY);
    ctx.lineTo(width - padding.right, lineY);
    ctx.stroke();
  }
  const slot = (width - padding.left - padding.right) / weeks.length;
  const groupWidth = Math.min(slot * .66, 42);
  const barWidth = Math.max(4, (groupWidth - 4) / 2);
  weeks.forEach((week, index) => {
    const center = padding.left + slot * (index + .5);
    const values = [
      {value: week.income, x: center - barWidth - 2, color: "#21804b"},
      {value: week.expense, x: center + 2, color: "#b83242"}
    ];
    for (const bar of values) {
      ctx.fillStyle = bar.color;
      const barTop = y(bar.value);
      ctx.beginPath();
      ctx.roundRect(bar.x, barTop, barWidth, Math.max(2, padding.top + plotHeight - barTop), [3, 3, 0, 0]);
      ctx.fill();
    }
    ctx.fillStyle = "#87928d";
    ctx.font = "9px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`Sem ${index + 1}`, center, height - 6);
  });
}

function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  return ctx;
}

function renderRecent() {
  const latest = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 8);
  const body = $("#recent-list");
  body.replaceChildren(...latest.map((item) => transactionRow(item, false)));
  $("#recent-empty").style.display = latest.length ? "none" : "block";
}

function renderTransactions(transactions) {
  const filtered = transactions.filter((item) => state.filter === "all" || item.type === state.filter)
    .sort(compareTransactions);
  $("#transaction-list").replaceChildren(...filtered.map((item) => transactionRow(item, true)));
  $("#transactions-empty").style.display = filtered.length ? "none" : "block";
  $("#results-count").textContent = `${filtered.length} ${filtered.length === 1 ? "lançamento" : "lançamentos"}`;
  updateTransactionSortHeaders();
}

function compareTransactions(first, second) {
  let comparison;
  if (state.transactionSortKey === "amount") {
    comparison = amountOf(first) - amountOf(second);
  } else if (state.transactionSortKey === "date") {
    comparison = first.date.localeCompare(second.date);
  } else {
    comparison = String(first[state.transactionSortKey]).localeCompare(
      String(second[state.transactionSortKey]),
      "pt-BR",
      {sensitivity: "base", numeric: true}
    );
  }
  if (comparison) return comparison * (state.transactionSortDirection === "asc" ? 1 : -1);
  return second.date.localeCompare(first.date) || second.id - first.id;
}

function updateTransactionSortHeaders() {
  $$("#transaction-table [data-sort-key]").forEach((header) => {
    const active = header.dataset.sortKey === state.transactionSortKey;
    header.setAttribute("aria-sort", active
      ? (state.transactionSortDirection === "asc" ? "ascending" : "descending")
      : "none");
    $("span", header).textContent = active
      ? (state.transactionSortDirection === "asc" ? "↑" : "↓")
      : "↕";
  });
}

function transactionRow(item, includeActions) {
  const row = document.createElement("tr");
  const description = document.createElement("td");
  description.className = "description-cell";
  description.textContent = item.description;
  const category = document.createElement("td");
  category.className = "category-cell";
  category.textContent = item.category;
  const date = document.createElement("td");
  date.textContent = brazilianDateFormat.format(new Date(`${item.date}T12:00:00`));
  row.append(description, category, date);
  if (includeActions) {
    const type = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `type-badge${item.type === "expense" ? " expense" : ""}`;
    badge.textContent = item.type === "income" ? "Entrada" : "Despesa";
    type.append(badge);
    const amount = document.createElement("td");
    amount.className = `align-right amount-${item.type}`;
    amount.textContent = `${item.type === "income" ? "+" : "−"} ${money.format(amountOf(item))}`;
    const actions = document.createElement("td");
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "edit-button";
    edit.textContent = "Ver/editar";
    edit.setAttribute("aria-label", `Visualizar ou editar ${item.description}`);
    edit.addEventListener("click", (event) => openTransactionPopover(item, event.currentTarget));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Excluir ${item.description}`);
    remove.addEventListener("click", () => deleteTransaction(item));
    actions.append(edit, remove);
    row.append(type, amount, actions);
  } else {
    const amount = document.createElement("td");
    amount.className = `align-right amount-${item.type}`;
    amount.textContent = `${item.type === "income" ? "+" : "−"} ${money.format(amountOf(item))}`;
    row.append(amount);
  }
  return row;
}

function updateTransactionEditCategories(category = $("#transaction-edit-category").value) {
  const type = $("#transaction-edit-type").value;
  const existingCategories = state.transactions
    .filter((item) => item.type === type)
    .map((item) => item.category);
  const categories = [...new Set([...CATEGORIES[type], ...existingCategories])];
  $("#transaction-edit-category").replaceChildren(...categories.map((name) => new Option(name, name)));
  if (categories.includes(category)) $("#transaction-edit-category").value = category;
  updateTransactionEditDistanceField();
}

function updateTransactionEditDistanceField() {
  const isUberIncome = $("#transaction-edit-type").value === "income" &&
    $("#transaction-edit-category").value.toUpperCase() === "UBER";
  const field = $("#transaction-edit-distance-field");
  field.hidden = !isUberIncome;
  if (!isUberIncome) $("#transaction-edit-form").elements.distance_km.value = "";
}

function openTransactionPopover(item, anchor) {
  const form = $("#transaction-edit-form");
  const popover = $("#transaction-popover");
  form.reset();
  form.elements.type.value = item.type;
  form.elements.description.value = item.description;
  form.elements.amount.value = amountOf(item).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  form.elements.date.value = item.date;
  updateTransactionEditCategories(item.category);
  form.elements.distance_km.value = Number(item.distance_km) > 0
    ? Number(item.distance_km).toLocaleString("pt-BR", {maximumFractionDigits: 2})
    : "";
  const readOnly = Boolean(item.managed_by_extra || item.managed_by_vehicle_cost);
  form.querySelectorAll("[name]").forEach((input) => {
    input.disabled = readOnly;
  });
  $("#transaction-edit-title").textContent = readOnly ? "Detalhes do lançamento" : "Editar lançamento";
  $("#transaction-edit-note").textContent = "As alterações valem somente para este lançamento.";
  $("#transaction-edit-readonly").textContent = item.managed_by_extra
    ? "Este valor pertence a um serviço extra. Edite-o na aba Meus trabalhos."
    : "Esta despesa é gerenciada pelos custos mensais do carro. Edite-a na aba Meus trabalhos.";
  $("#transaction-edit-readonly").hidden = !readOnly;
  $("#save-transaction-edit").hidden = readOnly;
  $("#transaction-edit-error").textContent = "";
  state.transactionPopoverAnchor = anchor;
  state.transactionPopoverItemId = item.id;
  popover.style.width = `${Math.min(380, window.innerWidth - 24)}px`;
  popover.hidden = false;
  positionTransactionPopover();
  window.requestAnimationFrame(() => popover.classList.add("visible"));
  const firstEditable = form.querySelector("[name]:not(:disabled)");
  (firstEditable || $("#close-transaction-popover")).focus();
}

function positionTransactionPopover() {
  const popover = $("#transaction-popover");
  const anchor = state.transactionPopoverAnchor;
  if (popover.hidden || !anchor?.isConnected) return;
  const anchorBounds = anchor.getBoundingClientRect();
  const popoverBounds = popover.getBoundingClientRect();
  const left = Math.max(12, Math.min(
    anchorBounds.left + anchorBounds.width / 2 - popoverBounds.width / 2,
    window.innerWidth - popoverBounds.width - 12
  ));
  let top = anchorBounds.top - popoverBounds.height - 12;
  let placement = "above";
  if (top < 12) {
    top = anchorBounds.bottom + 12;
    placement = "below";
  }
  if (top + popoverBounds.height > window.innerHeight - 12) {
    top = Math.max(12, window.innerHeight - popoverBounds.height - 12);
  }
  popover.dataset.placement = placement;
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
  popover.style.setProperty(
    "--popover-arrow-left",
    `${Math.max(20, Math.min(popoverBounds.width - 20, anchorBounds.left + anchorBounds.width / 2 - left))}px`
  );
}

function closeTransactionPopover(restoreFocus = true) {
  const popover = $("#transaction-popover");
  if (popover.hidden) return;
  const anchor = state.transactionPopoverAnchor;
  popover.hidden = true;
  popover.classList.remove("visible");
  state.transactionPopoverAnchor = null;
  state.transactionPopoverItemId = null;
  if (restoreFocus && anchor?.isConnected) anchor.focus();
}

function renderWork(income, expenses, extraWork, uberSettings, monthlyMaintenance, vehicleProfile) {
  const uberTransactions = income.filter((item) => item.category.toUpperCase() === "UBER");
  const weekdayRate = Number(uberSettings.weekday_hourly_rate ?? DEFAULT_WEEKDAY_HOURLY_RATE);
  const weekendRate = Number(uberSettings.weekend_hourly_rate ?? DEFAULT_WEEKEND_HOURLY_RATE);
  const hourlyRatesConfigured = weekdayRate > 0 && weekendRate > 0;
  let uberHours = 0;
  for (const transaction of uberTransactions) {
    const [year, month, day] = transaction.date.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay();
    if (hourlyRatesConfigured) {
      uberHours += amountOf(transaction) / (dayOfWeek >= 1 && dayOfWeek <= 4 ? weekdayRate : weekendRate);
    }
  }
  const monthDate = new Date(`${state.month}-15T12:00:00`);
  const firstDayOffset = (new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).getDay() + 6) % 7;
  const weeksInMonth = Math.ceil((firstDayOffset + new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()) / 7);
  const weeklyAverage = uberHours / weeksInMonth;
  const extraHours = extraWork.reduce((sum, item) => sum + Number(item.hours), 0);
  const expenseTotal = expenses.reduce((sum, item) => sum + amountOf(item), 0);
  const requiredHours = hourlyRatesConfigured ? expenseTotal / weekdayRate : 0;
  const totalHours = uberHours + extraHours;
  const uberIncome = uberTransactions.reduce((sum, item) => sum + amountOf(item), 0);
  $("#weekday-rate").textContent = hourlyRatesConfigured ? `${money.format(weekdayRate)} / hora` : "Configure abaixo";
  $("#weekend-rate").textContent = hourlyRatesConfigured ? `${money.format(weekendRate)} / hora` : "Configure abaixo";
  $("#work-uber-income").textContent = money.format(uberIncome);
  $("#work-uber-hours").textContent = hourlyRatesConfigured ? `${uberHours.toLocaleString("pt-BR", {maximumFractionDigits: 1})} h` : "—";
  $("#work-uber-weekly-hours").textContent = `${weeklyAverage.toLocaleString("pt-BR", {maximumFractionDigits: 1})} h`;
  $("#work-extra-hours").textContent = `${extraHours.toLocaleString("pt-BR", {maximumFractionDigits: 1})} h`;
  $("#work-expenses-total").textContent = money.format(expenseTotal);
  $("#work-required-hours").textContent = hourlyRatesConfigured ? `${requiredHours.toLocaleString("pt-BR", {maximumFractionDigits: 1})} h` : "—";
  const totalDistance = uberTransactions.reduce((sum, item) => sum + Number(item.distance_km || 0), 0);
  renderFuelMetrics(uberTransactions, expenses, uberSettings);
  const monthlyOwnershipCost = Number(vehicleProfile.monthly_cost || 0);
  const monthlyInsuranceCost = Number(vehicleProfile.insurance_cost || 0);
  const monthlyFixedCosts = monthlyOwnershipCost + monthlyInsuranceCost + Number(monthlyMaintenance || 0);
  $("#uber-distance-total").textContent = `${totalDistance.toLocaleString("pt-BR", {maximumFractionDigits: 1})} km`;
  $("#uber-fixed-costs").textContent = money.format(monthlyFixedCosts);
  const allDistanceEntered = uberTransactions.length > 0 && uberTransactions.every((item) => Number(item.distance_km) > 0);
  const fuelSettingsConfigured =
    uberSettings.fuel_price_per_liter != null &&
    Number(uberSettings.fuel_efficiency_km_per_liter) > 0;
  const costsConfigured = fuelSettingsConfigured && uberSettings.vehicle_cost_per_km != null;
  const marginStatus = $("#uber-margin-status");
  if (!uberTransactions.length) {
    $("#uber-estimated-costs").textContent = "—";
    $("#uber-estimated-profit").textContent = "—";
    $("#uber-margin").textContent = "—";
    marginStatus.textContent = "Registre ganhos UBER neste mês para acompanhar a estimativa de custos e margem.";
  } else if (!costsConfigured || !allDistanceEntered) {
    $("#uber-estimated-costs").textContent = "—";
    $("#uber-estimated-profit").textContent = "—";
    $("#uber-margin").textContent = "—";
    const missingDistanceCount = uberTransactions.filter((item) => !(Number(item.distance_km) > 0)).length;
    const missing = [];
    if (missingDistanceCount) missing.push(`informe a quilometragem de ${missingDistanceCount} ${missingDistanceCount === 1 ? "dia" : "dias"} na lista abaixo`);
    if (uberSettings.fuel_price_per_liter == null) missing.push("informe o preço final do combustível por litro");
    if (!(Number(uberSettings.fuel_efficiency_km_per_liter) > 0)) missing.push("informe o consumo médio do carro em km/L");
    if (uberSettings.vehicle_cost_per_km == null) missing.push("configure o custo-base do carro por km");
    marginStatus.textContent = `Estimativa indisponível: ${missing.join(" e ")}.`;
  } else {
    const fuelCostPerKm =
      Number(uberSettings.fuel_price_per_liter) / Number(uberSettings.fuel_efficiency_km_per_liter);
    const variableCosts = totalDistance * (fuelCostPerKm + Number(uberSettings.vehicle_cost_per_km));
    const estimatedCosts = variableCosts + monthlyFixedCosts;
    const netProfit = uberIncome - estimatedCosts;
    const margin = uberIncome ? netProfit / uberIncome * 100 : 0;
    $("#uber-estimated-costs").textContent = money.format(estimatedCosts);
    $("#uber-estimated-profit").textContent = money.format(netProfit);
    $("#uber-margin").textContent = `${margin.toLocaleString("pt-BR", {maximumFractionDigits: 1})}%`;
    const target = uberSettings.target_margin_percent;
    marginStatus.textContent = target == null
      ? "Estimativa: ganhos UBER − custos por km − aluguel/financiamento, seguro e manutenção mensais informados."
      : `Meta configurada: ${Number(target).toLocaleString("pt-BR", {maximumFractionDigits: 1})}%. ${margin >= Number(target) ? "Meta atingida." : "Abaixo da meta."}`;
  }
  $("#work-hours-progress").style.width = requiredHours ? `${Math.min(100, totalHours / requiredHours * 100)}%` : (totalHours ? "100%" : "0%");
  const status = $("#work-hours-status");
  if (!requiredHours && !totalHours) status.textContent = "Registre os ganhos Uber e serviços extras para acompanhar suas horas.";
  else if (!requiredHours) status.textContent = "Não há despesas neste mês. As horas de Uber e serviços extras estão contabilizadas.";
  else if (totalHours < requiredHours) status.textContent = `Somando Uber e extras, faltam ${(requiredHours - totalHours).toLocaleString("pt-BR", {maximumFractionDigits: 1})} h para a meta estimada do mês.`;
  else status.textContent = `Meta mensal de horas alcançada; ${(totalHours - requiredHours).toLocaleString("pt-BR", {maximumFractionDigits: 1})} h acima da meta.`;
}

function renderFuelMetrics(uberTransactions, expenses, uberSettings) {
  const [year, month] = state.month.split("-").map(Number);
  const firstDayOffset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const weeksInMonth = Math.ceil((firstDayOffset + daysInMonth) / 7);
  const fuelExpenses = expenses.filter((item) =>
    item.category.trim().toLocaleLowerCase("pt-BR") === "combustível"
  );
  const monthFuelTotal = fuelExpenses.reduce((sum, item) => sum + amountOf(item), 0);
  const monthDistance = uberTransactions.reduce((sum, item) => sum + Number(item.distance_km || 0), 0);
  const weeklyTotals = new Map();
  for (const transaction of [...fuelExpenses, ...uberTransactions]) {
    const weekStart = formatIsoDateInput(startOfWeek(new Date(`${transaction.date}T12:00:00`)));
    if (!weeklyTotals.has(weekStart)) weeklyTotals.set(weekStart, {fuel: 0, distance: 0});
    const week = weeklyTotals.get(weekStart);
    if (transaction.type === "expense") week.fuel += amountOf(transaction);
    else week.distance += Number(transaction.distance_km || 0);
  }
  const weeksWithFuelAndMileage = [...weeklyTotals.values()]
    .filter((week) => week.fuel > 0 && week.distance > 0);
  const weeklyCostPerKmAverage = weeksWithFuelAndMileage.length
    ? weeksWithFuelAndMileage.reduce((sum, week) => sum + week.fuel / week.distance, 0) /
      weeksWithFuelAndMileage.length
    : null;
  const configuredFuelCostPerKm =
    uberSettings.fuel_price_per_liter != null &&
    Number(uberSettings.fuel_efficiency_km_per_liter) > 0 &&
    uberSettings.vehicle_cost_per_km != null
      ? Number(uberSettings.fuel_price_per_liter) / Number(uberSettings.fuel_efficiency_km_per_liter) +
        Number(uberSettings.vehicle_cost_per_km)
      : null;
  $("#work-fuel-month-total").textContent = money.format(monthFuelTotal);
  $("#work-fuel-week-average").textContent = money.format(monthFuelTotal / weeksInMonth);
  $("#work-fuel-distance-total").textContent =
    `${monthDistance.toLocaleString("pt-BR", {maximumFractionDigits: 1})} km`;
  $("#work-fuel-cost-per-km").textContent = monthDistance
    ? `${money.format(monthFuelTotal / monthDistance)} / km`
    : "Informe a KM dos dias Uber";
  $("#work-fuel-weekly-cost-per-km").textContent = weeklyCostPerKmAverage == null
    ? "Informe abastecimento e KM por semana"
    : `${money.format(weeklyCostPerKmAverage)} / km`;
  $("#work-estimated-cost-per-km").textContent = configuredFuelCostPerKm == null
    ? "Configure combustível e custo-base"
    : `${money.format(configuredFuelCostPerKm)} / km`;
}

function renderUberMileage(income) {
  const list = $("#uber-mileage-list");
  if (list.contains(document.activeElement)) return;
  const uberTransactions = income
    .filter((item) => item.category.toUpperCase() === "UBER")
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  $("#uber-mileage-count").textContent = `${uberTransactions.length} ${uberTransactions.length === 1 ? "dia" : "dias"}`;
  $("#uber-mileage-empty").style.display = uberTransactions.length ? "none" : "block";
  list.replaceChildren(...uberTransactions.map((transaction) => {
    const row = document.createElement("tr");
    const dateCell = document.createElement("td");
    dateCell.textContent = dateFormat.format(new Date(`${transaction.date}T12:00:00`));
    const incomeCell = document.createElement("td");
    incomeCell.className = "amount-income";
    incomeCell.textContent = money.format(amountOf(transaction));
    const distanceCell = document.createElement("td");
    const input = document.createElement("input");
    input.className = "mileage-input";
    input.type = "text";
    input.inputMode = "decimal";
    input.placeholder = "KM do dia";
    input.setAttribute("aria-label", `Quilômetros rodados em ${dateFormat.format(new Date(`${transaction.date}T12:00:00`))}`);
    if (Number(transaction.distance_km) > 0) {
      input.value = Number(transaction.distance_km).toLocaleString("pt-BR", {maximumFractionDigits: 2});
    }
    distanceCell.append(input);
    const actionCell = document.createElement("td");
    const saveStatus = document.createElement("span");
    saveStatus.className = "mileage-status";
    saveStatus.setAttribute("role", "status");
    const savedDistance = Number(transaction.distance_km || 0);
    saveStatus.textContent = savedDistance ? "Salvo" : "";
    let saveTimer;
    let saving = false;
    const saveMileage = async (announce = false) => {
      if (saving) return;
      const distance = parseBrazilianAmount(input.value);
      if (!Number.isFinite(distance) || distance <= 0) {
        saveStatus.textContent = "Informe uma KM válida.";
        saveStatus.classList.add("invalid");
        if (announce) toast("Informe uma quilometragem maior que zero.");
        return;
      }
      if (distance === Number(transaction.distance_km || 0)) {
        saveStatus.textContent = "Salvo";
        saveStatus.classList.remove("invalid");
        return;
      }
      saving = true;
      saveButton.disabled = true;
      input.disabled = true;
      saveStatus.textContent = "Salvando...";
      saveStatus.classList.remove("invalid");
      try {
        await request(`/api/transactions/${transaction.id}/distance`, {
          method: "PATCH",
          body: JSON.stringify({distance_km: distance})
        });
        transaction.distance_km = distance;
        input.value = distance.toLocaleString("pt-BR", {maximumFractionDigits: 2});
        saveStatus.textContent = "Salvo";
        render();
        if (announce) toast("Quilometragem do dia salva.");
      } catch (error) {
        saveStatus.textContent = "Falha ao salvar.";
        saveStatus.classList.add("invalid");
        toast(error.message);
      } finally {
        saving = false;
        saveButton.disabled = false;
        input.disabled = false;
      }
    };
    input.addEventListener("input", () => {
      saveStatus.textContent = "Não salvo";
      saveStatus.classList.remove("invalid");
      clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => saveMileage(), 800);
    });
    input.addEventListener("change", () => {
      clearTimeout(saveTimer);
      saveMileage(true);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        clearTimeout(saveTimer);
        saveMileage(true);
      }
    });
    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "button button-secondary mileage-save";
    saveButton.textContent = "Salvar";
    saveButton.addEventListener("click", () => {
      clearTimeout(saveTimer);
      saveMileage(true);
    });
    actionCell.append(saveStatus, saveButton);
    row.append(dateCell, incomeCell, distanceCell, actionCell);
    return row;
  }));
}

function renderVehicleCostForm() {
  const form = $("#vehicle-cost-form");
  const amountInput = form.elements.amount;
  const monthlyCost = state.vehicleCosts.find((item) => item.month === state.month);
  $("#maintenance-month-label").textContent = monthFormat.format(new Date(`${state.month}-15T12:00:00`));
  if (document.activeElement !== amountInput) {
    amountInput.value = monthlyCost ? Number(monthlyCost.amount).toLocaleString("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2}) : "";
  }
}

function renderUberSettingsForm() {
  const form = $("#uber-cost-form");
  const defaults = {
    weekday_hourly_rate: DEFAULT_WEEKDAY_HOURLY_RATE,
    weekend_hourly_rate: DEFAULT_WEEKEND_HOURLY_RATE
  };
  for (const name of ["fuel_price_per_liter", "fuel_efficiency_km_per_liter", "vehicle_cost_per_km", "target_margin_percent", "weekday_hourly_rate", "weekend_hourly_rate"]) {
    const input = form.elements[name];
    if (document.activeElement === input) continue;
    const value = state.uberSettings[name] ?? defaults[name] ?? null;
    input.value = value == null ? "" : Number(value).toLocaleString("pt-BR", {maximumFractionDigits: 2});
  }
}

function updateVehicleProfileFields(profile = state.vehicleProfile) {
  const paymentInput = $("#vehicle-profile-form").elements.monthly_cost;
  const insuranceInput = $("#vehicle-profile-form").elements.insurance_cost;
  const paymentRequired = profile.ownership_type !== "own";
  const insuranceRequired = profile.has_insurance;
  $("#vehicle-payment-field").hidden = !paymentRequired;
  $("#vehicle-insurance-field").hidden = !insuranceRequired;
  paymentInput.required = paymentRequired;
  insuranceInput.required = insuranceRequired;
}

function renderVehicleProfileForm() {
  const form = $("#vehicle-profile-form");
  if (form.dataset.dirty === "true" || form.contains(document.activeElement)) return;
  const profile = {
    ownership_type: state.vehicleProfile.ownership_type || "own",
    monthly_cost: Number(state.vehicleProfile.monthly_cost || 0),
    has_insurance: Boolean(state.vehicleProfile.has_insurance),
    insurance_cost: Number(state.vehicleProfile.insurance_cost || 0)
  };
  form.elements.ownership_type.value = profile.ownership_type;
  form.elements.has_insurance.value = profile.has_insurance ? "yes" : "no";
  form.elements.monthly_cost.value = profile.monthly_cost
    ? profile.monthly_cost.toLocaleString("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2})
    : "";
  form.elements.insurance_cost.value = profile.insurance_cost
    ? profile.insurance_cost.toLocaleString("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2})
    : "";
  updateVehicleProfileFields(profile);
}

function renderExtraWorkList(extraWork) {
  const rows = extraWork.map((item) => {
    const row = document.createElement("tr");
    const values = [
      item.description,
      dateFormat.format(new Date(`${item.date}T12:00:00`)),
      `${Number(item.hours).toLocaleString("pt-BR", {maximumFractionDigits: 2})} h`,
      money.format(Number(item.received)),
      money.format(Number(item.benefit)),
      money.format(Number(item.cost))
    ];
    for (const [index, value] of values.entries()) {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (index === 0) cell.className = "description-cell";
      if (index === 3 || index === 4) cell.className = "amount-income";
      if (index === 5) cell.className = "amount-expense";
      row.append(cell);
    }
    const actions = document.createElement("td");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Excluir serviço ${item.description}`);
    remove.addEventListener("click", () => deleteExtraWork(item));
    actions.append(remove);
    row.append(actions);
    return row;
  });
  $("#extra-work-list").replaceChildren(...rows);
  $("#extra-work-count").textContent = `${extraWork.length} ${extraWork.length === 1 ? "serviço" : "serviços"}`;
  $("#extra-work-empty").style.display = extraWork.length ? "none" : "block";
}

function renderCalendar() {
  const visibleTooltipDate = $("#calendar-tooltip").hidden ? "" : state.calendarTooltipDate;
  if (visibleTooltipDate) hideCalendarTooltip();
  const [year, month] = state.calendarMonth.split("-").map(Number);
  const firstOfMonth = new Date(year, month - 1, 1);
  const formattedMonth = monthFormat.format(firstOfMonth);
  $("#calendar-month-label").textContent = formattedMonth.charAt(0).toLocaleUpperCase("pt-BR") + formattedMonth.slice(1);
  const firstGridDate = startOfWeek(firstOfMonth);
  const transactionsByDate = new Map();
  for (const transaction of state.transactions) {
    if (!transactionsByDate.has(transaction.date)) transactionsByDate.set(transaction.date, []);
    transactionsByDate.get(transaction.date).push(transaction);
  }
  for (const transactions of transactionsByDate.values()) {
    transactions.sort((a, b) => {
      if (a.type !== b.type) return a.type === "expense" ? -1 : 1;
      return amountOf(b) - amountOf(a) || a.id - b.id;
    });
  }
  const days = Array.from({length: 42}, (_, index) => {
    const date = new Date(firstGridDate);
    date.setDate(date.getDate() + index);
    return date;
  });
  const cells = days.map((date) => {
    const isoDate = formatIsoDateInput(date);
    const dayTransactions = transactionsByDate.get(isoDate) || [];
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "calendar-day";
    if (date.getMonth() !== month - 1) cell.classList.add("outside-month");
    if (isoDate === formatIsoDateInput(new Date())) cell.classList.add("is-today");
    if (isoDate === state.calendarSelectedDate) cell.classList.add("is-selected");
    if (formatIsoDateInput(startOfWeek(date)) === state.calendarWeekStart) cell.classList.add("selected-week");
    cell.dataset.date = isoDate;
    const dayNumber = document.createElement("span");
    dayNumber.className = "calendar-day-number";
    dayNumber.textContent = String(date.getDate());
    cell.setAttribute("aria-label", `${dateFormat.format(date)}: ${dayTransactions.length} lançamentos`);
    cell.append(dayNumber);
    const expenseIndices = new Map(
      dayTransactions.filter((item) => item.type === "expense")
        .map((item, index) => [item.id, index + 1])
    );
    for (const transaction of dayTransactions.slice(0, 3)) {
      const event = document.createElement("span");
      event.className = `calendar-event ${transaction.type}`;
      const index = transaction.type === "expense" ? `#${expenseIndices.get(transaction.id)} ` : "+ ";
      event.textContent = `${index}${transaction.category} ${money.format(amountOf(transaction))}`;
      event.title = `${transaction.description} · ${money.format(amountOf(transaction))}`;
      cell.append(event);
    }
    if (dayTransactions.length > 3) {
      const more = document.createElement("span");
      more.className = "calendar-more";
      more.textContent = `+${dayTransactions.length - 3} lançamentos`;
      cell.append(more);
    }
    return cell;
  });
  $("#calendar-grid").replaceChildren(...cells);
  if (visibleTooltipDate) {
    const activeDay = $(`#calendar-grid [data-date="${visibleTooltipDate}"]`);
    if (activeDay) showCalendarTooltip(activeDay);
  }

  const weekEnd = shiftDate(state.calendarWeekStart, 6);
  const weekTransactions = state.transactions
    .filter((item) => item.date >= state.calendarWeekStart && item.date <= weekEnd)
    .sort((a, b) => a.date.localeCompare(b.date) ||
      (a.type === b.type ? amountOf(b) - amountOf(a) : a.type === "expense" ? -1 : 1));
  const expenses = weekTransactions.filter((item) => item.type === "expense");
  const income = weekTransactions.filter((item) => item.type === "income");
  const expenseTotal = expenses.reduce((sum, item) => sum + amountOf(item), 0);
  const incomeTotal = income.reduce((sum, item) => sum + amountOf(item), 0);
  let projectedBalance = state.transactions
    .filter((item) => item.date < state.calendarWeekStart)
    .reduce((balance, item) => balance + (item.type === "income" ? 1 : -1) * amountOf(item), 0);
  const openingBalance = projectedBalance;
  let lowestBalance = projectedBalance;
  const dailyFlows = new Map();
  for (const item of weekTransactions) {
    const flow = (dailyFlows.get(item.date) || 0) + (item.type === "income" ? 1 : -1) * amountOf(item);
    dailyFlows.set(item.date, flow);
  }
  for (const [, flow] of [...dailyFlows].sort(([first], [second]) => first.localeCompare(second))) {
    projectedBalance += flow;
    lowestBalance = Math.min(lowestBalance, projectedBalance);
  }
  const shortfall = Math.max(0, -lowestBalance);
  const weekdayRate = Number(state.uberSettings.weekday_hourly_rate ?? DEFAULT_WEEKDAY_HOURLY_RATE);
  const endDate = new Date(`${weekEnd}T12:00:00`);
  $("#calendar-week-label").textContent =
    `${dateFormat.format(new Date(`${state.calendarWeekStart}T12:00:00`))} a ${dateFormat.format(endDate)}`;
  $("#calendar-week-expenses").textContent = money.format(expenseTotal);
  $("#calendar-expense-count").textContent = `${expenses.length} ${expenses.length === 1 ? "despesa" : "despesas"}`;
  $("#calendar-week-income").textContent = money.format(incomeTotal);
  $("#calendar-income-count").textContent = `${income.length} ${income.length === 1 ? "entrada" : "entradas"}`;
  $("#calendar-week-balance").textContent = money.format(projectedBalance);
  $("#calendar-week-balance").classList.toggle("negative-balance", projectedBalance < 0);
  $("#calendar-opening-balance").textContent = `Saldo projetado antes da semana: ${money.format(openingBalance)}`;
  $("#calendar-shortfall").textContent = money.format(shortfall);
  $("#calendar-shortfall-hours").textContent =
    `${(shortfall / weekdayRate).toLocaleString("pt-BR", {maximumFractionDigits: 1})} h estimadas a ${money.format(weekdayRate)}/h`;
  $("#calendar-week-count").textContent = `${weekTransactions.length} ${weekTransactions.length === 1 ? "LANÇAMENTO" : "LANÇAMENTOS"}`;
  $("#calendar-week-list").replaceChildren(...weekTransactions.map((item, index) => {
    const row = document.createElement("tr");
    const values = [
      dateFormat.format(new Date(`${item.date}T12:00:00`)),
      item.description,
      item.type === "expense"
        ? `${item.category} · #${expenses.filter((expense) => expense.date === item.date)
          .sort((a, b) => amountOf(b) - amountOf(a) || a.id - b.id)
          .findIndex((expense) => expense.id === item.id) + 1}`
        : item.category,
      item.type === "income" ? "Entrada" : "Despesa"
    ];
    for (const [column, value] of values.entries()) {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (column === 1) cell.className = "description-cell";
      if (column === 2) cell.className = "category-cell";
      if (column === 3) {
        const badge = document.createElement("span");
        badge.className = `type-badge${item.type === "expense" ? " expense" : ""}`;
        badge.textContent = value;
        cell.replaceChildren(badge);
      }
      row.append(cell);
    }
    const amount = document.createElement("td");
    amount.className = `align-right amount-${item.type}`;
    amount.textContent = `${item.type === "income" ? "+" : "−"} ${money.format(amountOf(item))}`;
    row.append(amount);
    return row;
  }));
  $("#calendar-week-empty").style.display = weekTransactions.length ? "none" : "block";
}

function showCalendarTooltip(day) {
  const isoDate = day.dataset.date;
  if (state.calendarTooltipDate === isoDate) return;
  const tooltip = $("#calendar-tooltip");
  clearTimeout(state.calendarTooltipTimeout);
  if (state.calendarTooltipElement) state.calendarTooltipElement.removeAttribute("aria-describedby");
  state.calendarTooltipDate = isoDate;
  state.calendarTooltipElement = day;
  day.setAttribute("aria-describedby", "calendar-tooltip");
  const transactions = state.transactions
    .filter((item) => item.date === isoDate)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "expense" ? -1 : 1;
      return amountOf(b) - amountOf(a) || a.id - b.id;
    });
  const expenses = transactions.filter((item) => item.type === "expense");
  const income = transactions.filter((item) => item.type === "income");
  const date = new Date(`${isoDate}T12:00:00`);
  const heading = document.createElement("strong");
  heading.className = "calendar-tooltip-heading";
  heading.textContent = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long", day: "numeric", month: "long"
  }).format(date);
  const totals = document.createElement("div");
  totals.className = "calendar-tooltip-totals";
  for (const [label, items, type] of [
    ["A pagar", expenses, "expense"],
    ["A receber", income, "income"]
  ]) {
    const total = document.createElement("div");
    const caption = document.createElement("span");
    caption.textContent = label;
    const amount = document.createElement("strong");
    amount.className = `amount-${type}`;
    amount.textContent = money.format(items.reduce((sum, item) => sum + amountOf(item), 0));
    total.append(caption, amount);
    totals.append(total);
  }
  const list = document.createElement("div");
  list.className = "calendar-tooltip-list";
  if (!transactions.length) {
    const empty = document.createElement("p");
    empty.className = "calendar-tooltip-empty";
    empty.textContent = "Nenhum lançamento previsto para este dia.";
    list.append(empty);
  } else {
    const expenseIndices = new Map(expenses.map((item, index) => [item.id, index + 1]));
    for (const item of transactions) {
      const row = document.createElement("div");
      row.className = `calendar-tooltip-item ${item.type}`;
      const index = document.createElement("span");
      index.className = "calendar-tooltip-index";
      index.textContent = item.type === "expense" ? `#${expenseIndices.get(item.id)}` : "＋";
      const detail = document.createElement("span");
      detail.className = "calendar-tooltip-detail";
      const description = document.createElement("strong");
      description.textContent = item.description;
      const category = document.createElement("small");
      category.textContent = item.category;
      detail.append(description, category);
      const amount = document.createElement("strong");
      amount.className = `calendar-tooltip-value amount-${item.type}`;
      amount.textContent = `${item.type === "income" ? "+" : "−"} ${money.format(amountOf(item))}`;
      row.append(index, detail, amount);
      list.append(row);
    }
  }
  tooltip.replaceChildren(heading, totals, list);
  tooltip.style.width = `${Math.min(320, window.innerWidth - 24)}px`;
  tooltip.hidden = false;
  tooltip.classList.remove("visible");
  const dayBounds = day.getBoundingClientRect();
  const tooltipBounds = tooltip.getBoundingClientRect();
  const left = Math.max(12, Math.min(
    dayBounds.left + dayBounds.width / 2 - tooltipBounds.width / 2,
    window.innerWidth - tooltipBounds.width - 12
  ));
  let top = dayBounds.top - tooltipBounds.height - 12;
  let placement = "above";
  if (top < 12) {
    top = dayBounds.bottom + 12;
    placement = "below";
  }
  if (top + tooltipBounds.height > window.innerHeight - 12) {
    top = Math.max(12, window.innerHeight - tooltipBounds.height - 12);
  }
  tooltip.dataset.placement = placement;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  window.requestAnimationFrame(() => tooltip.classList.add("visible"));
}

function hideCalendarTooltip() {
  const tooltip = $("#calendar-tooltip");
  if (tooltip.hidden) return;
  tooltip.classList.remove("visible");
  if (state.calendarTooltipElement) state.calendarTooltipElement.removeAttribute("aria-describedby");
  state.calendarTooltipElement = null;
  state.calendarTooltipDate = "";
  clearTimeout(state.calendarTooltipTimeout);
  state.calendarTooltipTimeout = window.setTimeout(() => {
    tooltip.hidden = true;
  }, 180);
}

function updateReminderStatus() {
  const button = $("#enable-reminders");
  const status = $("#reminder-status");
  if (!("Notification" in window)) {
    button.disabled = true;
    status.textContent = "Este navegador não oferece lembretes do sistema. Exporte o calendário para importar eventos e alertas no Google Agenda.";
  } else if (Notification.permission === "granted") {
    button.textContent = "Lembretes ativados";
    status.textContent = "Você receberá um aviso no dia dos lançamentos enquanto o Casa em Dia estiver aberto.";
  } else if (Notification.permission === "denied") {
    button.textContent = "Lembretes bloqueados";
    status.textContent = "As notificações foram bloqueadas no navegador. Você ainda pode exportar os eventos para o Google Agenda.";
  }
}

function notifyDueTransactions() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const today = formatIsoDateInput(new Date());
  const dueTransactions = state.transactions.filter((item) =>
    item.date === today && !state.remindedTransactions.has(`${today}:${item.id}`)
  );
  if (!dueTransactions.length) return;
  for (const item of dueTransactions) {
    new Notification(`${item.type === "expense" ? "Conta vence hoje" : "Entrada prevista hoje"}: ${item.description}`, {
      body: `${money.format(amountOf(item))} · ${item.category}`,
      tag: `casa-em-dia-${today}-${item.id}`
    });
    state.remindedTransactions.add(`${today}:${item.id}`);
  }
  try {
    localStorage.setItem(
      REMINDED_TRANSACTIONS_STORAGE_KEY,
      JSON.stringify([...state.remindedTransactions].slice(-200))
    );
  } catch (error) {
    console.error("Não foi possível salvar o histórico de lembretes:", error);
    toast("O lembrete foi exibido, mas não pôde ser salvo neste navegador.");
  }
}

function downloadCalendar() {
  const transactions = state.transactions.filter((item) => item.date.startsWith(state.calendarMonth));
  if (!transactions.length) {
    toast("Não há lançamentos neste mês para exportar.");
    return;
  }
  const escapeIcsText = (value) => String(value)
    .replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const foldLine = (line) => {
    const lines = [];
    let current = "";
    let byteLength = 0;
    for (const character of line) {
      const characterBytes = new TextEncoder().encode(character).length;
      if (byteLength + characterBytes > 75) {
        lines.push(current);
        current = " ";
        byteLength = 1;
      }
      current += character;
      byteLength += characterBytes;
    }
    lines.push(current);
    return lines.join("\r\n");
  };
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const events = transactions.map((item) => {
    const endDate = shiftDate(item.date, 1).replace(/-/g, "");
    const title = `${item.type === "expense" ? "Vencimento" : "Entrada"}: ${item.description}`;
    const description = `${item.category} · ${money.format(amountOf(item))}`;
    return [
      "BEGIN:VEVENT",
      `UID:${item.id}-${item.date}@casa-em-dia.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${item.date.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${endDate}`,
      `SUMMARY:${escapeIcsText(title)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Lembrete financeiro",
      "TRIGGER:-P1D",
      "END:VALARM",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Vencimento hoje",
      "TRIGGER:PT9H",
      "END:VALARM",
      "END:VEVENT"
    ].join("\r\n");
  });
  const content = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Casa em Dia//Calendario Financeiro//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR"
  ].flatMap((section) => section.split("\r\n")).map(foldLine).join("\r\n") + "\r\n";
  const blob = new Blob([content], {type: "text/calendar;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `casa-em-dia-${state.calendarMonth}.ics`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast("Calendário exportado. Importe o arquivo .ics no Google Agenda.");
}

function loadReminderHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(REMINDED_TRANSACTIONS_STORAGE_KEY) || "[]");
    if (!Array.isArray(saved) || saved.some((key) => typeof key !== "string")) {
      throw new Error("Formato de lembretes inválido.");
    }
    state.remindedTransactions = new Set(saved);
  } catch (error) {
    console.error("Não foi possível ler o histórico de lembretes:", error);
    toast("O histórico de lembretes não pôde ser lido neste navegador.");
  }
}

function populateMonths() {
  const [selectedYear, selectedMonth] = (state.month || currentMonth()).split("-");
  const monthSelect = $("#month-select");
  const yearSelect = $("#year-select");
  monthSelect.replaceChildren(...Array.from({length: 12}, (_, index) => {
    const option = document.createElement("option");
    option.value = String(index + 1).padStart(2, "0");
    option.textContent = monthNameFormat.format(new Date(2026, index, 15));
    return option;
  }));
  const periods = [
    ...state.transactions.map((item) => item.date.slice(0, 7)),
    ...state.extraWork.map((item) => item.date.slice(0, 7)),
    ...state.vehicleCosts.map((item) => item.month)
  ];
  const currentYear = new Date().getFullYear();
  const years = new Set([
    ...Array.from({length: 11}, (_, index) => String(currentYear - 5 + index)),
    selectedYear,
    ...periods.map((period) => period.slice(0, 4))
  ]);
  yearSelect.replaceChildren(...[...years].sort((a, b) => Number(b) - Number(a)).map((year) => {
    const option = document.createElement("option");
    option.value = year;
    option.textContent = year;
    return option;
  }));
  monthSelect.value = selectedMonth;
  yearSelect.value = selectedYear;
}

function updateCategories() {
  const categories = CATEGORIES[$("#transaction-type").value];
  $("#category-select").replaceChildren(...categories.map((category) => new Option(category, category)));
  updateUberDistanceField();
}

function updateUberDistanceField() {
  const isUberIncome = $("#transaction-type").value === "income" && $("#category-select").value === "UBER";
  $("#uber-distance-label").hidden = !isUberIncome;
}

function updateRecurrenceFields() {
  const recurring = $("#transaction-recurring").checked;
  const monthsInput = $("#transaction-recurring-months");
  $("#recurrence-months-field").hidden = !recurring;
  monthsInput.required = recurring;
}

function switchTab(name) {
  if (name !== "calendar") hideCalendarTooltip();
  closeTransactionPopover(false);
  $$(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `${name}-view`));
  const titles = {dashboard: "Dashboard", calendar: "Calendário", transactions: "Lançamentos", work: "Meus trabalhos"};
  $("#page-title").textContent = titles[name];
  $("#dashboard-month-picker").hidden = name === "calendar";
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("visible"), 3000);
}

async function refresh(showError = false) {
  try {
    const [transactions, extraWork, uberSettings, vehicleCosts, vehicleProfile] = await Promise.all([
      request("/api/transactions"),
      request("/api/extra-work"),
      request("/api/uber-settings"),
      request("/api/vehicle-costs"),
      request("/api/vehicle-profile")
    ]);
    state.transactions = transactions;
    state.extraWork = extraWork;
    state.uberSettings = uberSettings;
    state.vehicleCosts = vehicleCosts;
    state.vehicleProfile = vehicleProfile;
    populateMonths();
    render();
  } catch (error) {
    if (showError) toast(error.message);
    else console.error("Falha ao atualizar os dados:", error);
  }
}

function openDialog() {
  const form = $("#transaction-form");
  form.reset();
  const selectedDate = $(".tab.active")?.dataset.tab === "calendar" && state.calendarSelectedDate
    ? new Date(`${state.calendarSelectedDate}T12:00:00`)
    : new Date();
  form.elements.date.value = formatDateInput(selectedDate);
  form.elements.distance_km.value = "";
  form.elements.recurring_months.value = "3";
  $("#date-picker").value = formatIsoDateInput(selectedDate);
  $("#form-error").textContent = "";
  updateCategories();
  updateRecurrenceFields();
  $("#transaction-dialog").showModal();
}

async function deleteTransaction(item) {
  if (!confirm(`Excluir o lançamento "${item.description}"?`)) return;
  try {
    await request(`/api/transactions/${item.id}`, {method: "DELETE"});
    await refresh(true);
    toast("Lançamento excluído.");
  } catch (error) {
    toast(error.message);
  }
}

async function deleteExtraWork(item) {
  if (!confirm(`Excluir o serviço "${item.description}" e seus lançamentos financeiros vinculados?`)) return;
  try {
    await request(`/api/extra-work/${item.id}`, {method: "DELETE"});
    await refresh(true);
    toast("Serviço extra e lançamentos vinculados excluídos.");
  } catch (error) {
    toast(error.message);
  }
}

function init() {
  state.month = currentMonth();
  state.calendarMonth = currentMonth();
  state.calendarSelectedDate = formatIsoDateInput(new Date());
  state.calendarWeekStart = formatIsoDateInput(startOfWeek(new Date()));
  loadTheme();
  loadReminderHistory();
  updateReminderStatus();
  $$(".tab").forEach((tab) => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));
  $("#theme-toggle").addEventListener("click", () => {
    const picker = $("#theme-picker");
    const expanded = $("#theme-toggle").getAttribute("aria-expanded") === "true";
    picker.hidden = expanded;
    $("#theme-toggle").setAttribute("aria-expanded", String(!expanded));
  });
  $$("[data-theme-option]").forEach((button) => {
    button.addEventListener("click", () => {
      setTheme(button.dataset.themeOption, true);
      $("#theme-picker").hidden = true;
      $("#theme-toggle").setAttribute("aria-expanded", "false");
      render();
    });
  });
  $$("[data-open-tab]").forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.openTab)));
  $("#new-transaction").addEventListener("click", openDialog);
  $("#vehicle-profile-form").addEventListener("input", (event) => {
    if (event.target.matches("input")) event.currentTarget.dataset.dirty = "true";
  });
  $("#vehicle-ownership-type").addEventListener("change", (event) => {
    event.currentTarget.form.dataset.dirty = "true";
    updateVehicleProfileFields({
      ownership_type: event.currentTarget.value,
      has_insurance: $("#vehicle-has-insurance").value === "yes"
    });
  });
  $("#vehicle-has-insurance").addEventListener("change", (event) => {
    event.currentTarget.form.dataset.dirty = "true";
    updateVehicleProfileFields({
      ownership_type: $("#vehicle-ownership-type").value,
      has_insurance: event.currentTarget.value === "yes"
    });
  });
  $("#calendar-previous-month").addEventListener("click", () => {
    hideCalendarTooltip();
    state.calendarMonth = shiftMonth(state.calendarMonth, -1);
    state.calendarSelectedDate = `${state.calendarMonth}-01`;
    state.calendarWeekStart = formatIsoDateInput(startOfWeek(new Date(`${state.calendarSelectedDate}T12:00:00`)));
    renderCalendar();
  });
  $("#calendar-next-month").addEventListener("click", () => {
    hideCalendarTooltip();
    state.calendarMonth = shiftMonth(state.calendarMonth, 1);
    state.calendarSelectedDate = `${state.calendarMonth}-01`;
    state.calendarWeekStart = formatIsoDateInput(startOfWeek(new Date(`${state.calendarSelectedDate}T12:00:00`)));
    renderCalendar();
  });
  $("#calendar-today").addEventListener("click", () => {
    hideCalendarTooltip();
    const today = new Date();
    state.calendarMonth = formatIsoDateInput(today).slice(0, 7);
    state.calendarSelectedDate = formatIsoDateInput(today);
    state.calendarWeekStart = formatIsoDateInput(startOfWeek(today));
    renderCalendar();
  });
  $("#calendar-grid").addEventListener("click", (event) => {
    const day = event.target.closest("[data-date]");
    if (!day) return;
    state.calendarSelectedDate = day.dataset.date;
    state.calendarWeekStart = formatIsoDateInput(startOfWeek(new Date(`${day.dataset.date}T12:00:00`)));
    renderCalendar();
  });
  $("#calendar-grid").addEventListener("pointerover", (event) => {
    const day = event.target.closest("[data-date]");
    if (day) showCalendarTooltip(day);
  });
  $("#calendar-grid").addEventListener("pointerout", (event) => {
    const day = event.target.closest("[data-date]");
    const nextDay = event.relatedTarget instanceof Element ? event.relatedTarget.closest("[data-date]") : null;
    if (day && nextDay?.dataset.date !== day.dataset.date) hideCalendarTooltip();
  });
  $("#calendar-grid").addEventListener("focusin", (event) => {
    const day = event.target.closest("[data-date]");
    if (day) showCalendarTooltip(day);
  });
  $("#calendar-grid").addEventListener("focusout", (event) => {
    const day = event.target.closest("[data-date]");
    const nextDay = event.relatedTarget instanceof Element ? event.relatedTarget.closest("[data-date]") : null;
    if (day && nextDay?.dataset.date !== day.dataset.date) hideCalendarTooltip();
  });
  $("#export-calendar").addEventListener("click", downloadCalendar);
  $("#enable-reminders").addEventListener("click", async () => {
    if (!("Notification" in window)) {
      updateReminderStatus();
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      updateReminderStatus();
      if (permission === "granted") {
        notifyDueTransactions();
        toast("Lembretes do navegador ativados.");
      } else if (permission === "denied") {
        toast("Permissão negada. Importe o arquivo .ics no Google Agenda para receber alertas.");
      }
    } catch (error) {
      console.error("Não foi possível ativar os lembretes do navegador:", error);
      toast("Não foi possível ativar os lembretes. Tente novamente no navegador.");
    }
  });
  $$("[data-new-transaction]").forEach((button) => button.addEventListener("click", openDialog));
  $("#close-dialog").addEventListener("click", () => $("#transaction-dialog").close());
  $("#cancel-dialog").addEventListener("click", () => $("#transaction-dialog").close());
  $("#transaction-type").addEventListener("change", updateCategories);
  $("#category-select").addEventListener("change", updateUberDistanceField);
  $("#transaction-recurring").addEventListener("change", updateRecurrenceFields);
  const dateInput = $("#transaction-date");
  dateInput.addEventListener("input", () => updateDateMask(dateInput));
  const extraDateInput = $("#extra-work-date");
  extraDateInput.value = formatDateInput(new Date());
  extraDateInput.addEventListener("input", () => updateDateMask(extraDateInput));
  $("#date-picker-button").addEventListener("click", () => {
    const picker = $("#date-picker");
    if (dateInput.value) picker.value = parseBrazilianDate(dateInput.value) || "";
    if (typeof picker.showPicker === "function") picker.showPicker();
    else picker.click();
  });
  $("#date-picker").addEventListener("change", (event) => {
    if (event.target.value) {
      const [year, month, day] = event.target.value.split("-").map(Number);
      dateInput.value = formatDateInput(new Date(year, month - 1, day));
    }
  });
  $$(".amount-stepper button").forEach((button) => button.addEventListener("click", () => {
    const input = $("#transaction-amount");
    const current = parseBrazilianAmount(input.value);
    const next = Math.max(0, (Number.isFinite(current) ? current : 0) + Number(button.dataset.amountStep));
    input.value = next.toLocaleString("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2});
    input.dispatchEvent(new Event("input", {bubbles: true}));
  }));
  const updateSelectedMonth = () => {
    state.month = `${$("#year-select").value}-${$("#month-select").value}`;
    render();
  };
  $("#month-select").addEventListener("change", updateSelectedMonth);
  $("#year-select").addEventListener("change", updateSelectedMonth);
  $$(".filter").forEach((button) => button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    $$(".filter").forEach((filter) => filter.classList.toggle("active", filter === button));
    renderTransactions(monthTransactions());
  }));
  $$("#transaction-table [data-sort-key] button").forEach((button) => {
    button.addEventListener("click", () => {
      const sortKey = button.closest("[data-sort-key]").dataset.sortKey;
      if (state.transactionSortKey === sortKey) {
        state.transactionSortDirection = state.transactionSortDirection === "asc" ? "desc" : "asc";
      } else {
        state.transactionSortKey = sortKey;
        state.transactionSortDirection = "asc";
      }
      renderTransactions(monthTransactions());
    });
  });
  $("#transaction-edit-type").addEventListener("change", () => updateTransactionEditCategories());
  $("#transaction-edit-category").addEventListener("change", updateTransactionEditDistanceField);
  $("#close-transaction-popover").addEventListener("click", () => closeTransactionPopover());
  $("#cancel-transaction-edit").addEventListener("click", () => closeTransactionPopover());
  document.addEventListener("pointerdown", (event) => {
    if ($("#transaction-popover").hidden ||
        $("#transaction-popover").contains(event.target) ||
        state.transactionPopoverAnchor?.contains(event.target)) return;
    closeTransactionPopover(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeTransactionPopover();
  });
  window.addEventListener("resize", () => {
    positionTransactionPopover();
    hideCalendarTooltip();
  });
  window.addEventListener("scroll", () => {
    closeTransactionPopover(false);
    hideCalendarTooltip();
  }, true);
  $("#transaction-edit-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const distance = data.distance_km.trim() ? parseBrazilianAmount(data.distance_km) : 0;
    const transaction = {
      type: data.type,
      description: data.description.trim(),
      category: data.category,
      amount: parseBrazilianAmount(data.amount),
      date: data.date,
      distance_km: distance
    };
    if (!transaction.description || transaction.description.length > 120 ||
        !transaction.category || !transaction.date ||
        !Number.isFinite(transaction.amount) || transaction.amount <= 0 ||
        !Number.isFinite(transaction.distance_km) || transaction.distance_km < 0 ||
        (transaction.distance_km > 0 &&
          (transaction.type !== "income" || transaction.category.toUpperCase() !== "UBER"))) {
      $("#transaction-edit-error").textContent = "Confira a descrição, categoria, data, valor e quilometragem.";
      return;
    }
    try {
      await request(`/api/transactions/${state.transactionPopoverItemId}`, {
        method: "PATCH",
        body: JSON.stringify(transaction)
      });
      closeTransactionPopover(false);
      await refresh(true);
      toast("Lançamento atualizado.");
    } catch (error) {
      $("#transaction-edit-error").textContent = error.message;
    }
  });
  $("#transaction-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const transaction = Object.fromEntries(form.entries());
    transaction.amount = parseBrazilianAmount(transaction.amount);
    transaction.distance_km = transaction.distance_km.trim() ? parseBrazilianAmount(transaction.distance_km) : 0;
    transaction.date = parseBrazilianDate(transaction.date);
    transaction.is_recurring = $("#transaction-recurring").checked;
    transaction.recurring_months = transaction.is_recurring
      ? Number($("#transaction-recurring-months").value)
      : 1;
    if (!Number.isFinite(transaction.amount) || transaction.amount <= 0) {
      $("#form-error").textContent = "Informe um valor válido. Exemplo: 1.234,56.";
      return;
    }
    if (!transaction.date) {
      $("#form-error").textContent = "Informe uma data válida no formato DD/MM/AAAA.";
      return;
    }
    if (transaction.is_recurring &&
        (!Number.isInteger(transaction.recurring_months) ||
          transaction.recurring_months < 2 || transaction.recurring_months > 120)) {
      $("#form-error").textContent = "Informe uma duração entre 2 e 120 meses, incluindo este lançamento.";
      return;
    }
    if (!Number.isFinite(transaction.distance_km) || transaction.distance_km < 0 ||
        (transaction.distance_km > 0 && (transaction.type !== "income" || transaction.category !== "UBER"))) {
      $("#form-error").textContent = "A quilometragem deve ser válida e só pode ser informada em ganhos UBER.";
      return;
    }
    try {
      const result = await request("/api/transactions", {method: "POST", body: JSON.stringify(transaction)});
      $("#transaction-dialog").close();
      await refresh(true);
      toast(result.created > 1
        ? `Lançamento salvo e repetido por ${result.created} meses.`
        : "Lançamento salvo.");
    } catch (error) {
      $("#form-error").textContent = error.message;
    }
  });
  $("#extra-work-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const service = Object.fromEntries(new FormData(form).entries());
    service.date = parseBrazilianDate(service.date);
    service.hours = parseBrazilianAmount(service.hours);
    for (const key of ["received", "benefit", "cost"]) {
      service[key] = service[key].trim() ? parseBrazilianAmount(service[key]) : 0;
    }
    if (!service.date || !Number.isFinite(service.hours) || service.hours < 0 ||
        ["received", "benefit", "cost"].some((key) => !Number.isFinite(service[key]) || service[key] < 0)) {
      $("#extra-work-error").textContent = "Confira a data, as horas e os valores informados.";
      return;
    }
    try {
      await request("/api/extra-work", {method: "POST", body: JSON.stringify(service)});
      form.reset();
      extraDateInput.value = formatDateInput(new Date());
      $("#extra-work-error").textContent = "";
      await refresh(true);
      toast("Serviço extra e valores financeiros registrados.");
    } catch (error) {
      $("#extra-work-error").textContent = error.message;
    }
  });
  $("#uber-cost-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const settings = {};
    for (const key of ["fuel_price_per_liter", "fuel_efficiency_km_per_liter", "vehicle_cost_per_km", "target_margin_percent", "weekday_hourly_rate", "weekend_hourly_rate"]) {
      const value = form.elements[key].value.trim();
      settings[key] = value ? parseBrazilianAmount(value) : null;
    }
    if (Object.entries(settings).some(([key, value]) =>
      value != null && (!Number.isFinite(value) || value < 0 ||
        (key === "fuel_efficiency_km_per_liter" && value === 0)))) {
      $("#uber-cost-error").textContent = "Informe valores válidos; o consumo em km/L deve ser maior que zero.";
      return;
    }
    try {
      await request("/api/uber-settings", {method: "PUT", body: JSON.stringify(settings)});
      $("#uber-cost-error").textContent = "";
      await refresh(true);
      toast("Configurações de trabalho salvas.");
    } catch (error) {
      $("#uber-cost-error").textContent = error.message;
    }
  });
  $("#vehicle-profile-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const hasInsurance = form.elements.has_insurance.value === "yes";
    const profile = {
      ownership_type: form.elements.ownership_type.value,
      monthly_cost: form.elements.monthly_cost.value.trim()
        ? parseBrazilianAmount(form.elements.monthly_cost.value)
        : 0,
      has_insurance: hasInsurance,
      insurance_cost: form.elements.insurance_cost.value.trim()
        ? parseBrazilianAmount(form.elements.insurance_cost.value)
        : 0
    };
    if (!Number.isFinite(profile.monthly_cost) || profile.monthly_cost < 0 ||
        (profile.ownership_type !== "own" && profile.monthly_cost <= 0) ||
        (hasInsurance && (!Number.isFinite(profile.insurance_cost) || profile.insurance_cost <= 0))) {
      $("#vehicle-profile-error").textContent =
        "Informe um valor mensal válido para o aluguel/financiamento e para o seguro, quando aplicável.";
      return;
    }
    try {
      await request("/api/vehicle-profile", {method: "PUT", body: JSON.stringify(profile)});
      $("#vehicle-profile-error").textContent = "";
      form.dataset.dirty = "false";
      await refresh(true);
      toast("Custos do carro salvos.");
    } catch (error) {
      $("#vehicle-profile-error").textContent = error.message;
    }
  });
  $("#vehicle-cost-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const amount = form.elements.amount.value.trim() ? parseBrazilianAmount(form.elements.amount.value) : 0;
    if (!Number.isFinite(amount) || amount < 0) {
      $("#vehicle-cost-error").textContent = "Informe um valor válido, igual ou maior que zero.";
      return;
    }
    try {
      await request(`/api/vehicle-costs/${state.month}`, {
        method: "POST",
        body: JSON.stringify({amount})
      });
      $("#vehicle-cost-error").textContent = "";
      await refresh(true);
      toast(amount ? "Manutenção mensal salva como despesa." : "Manutenção mensal removida.");
    } catch (error) {
      $("#vehicle-cost-error").textContent = error.message;
    }
  });
  window.addEventListener("resize", render);
  refresh(true);
  window.setInterval(() => refresh(false), 5000);
}

init();
