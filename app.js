const COLORS = ["#e94f5d", "#f27b72", "#cf3044", "#f3a286", "#b9456e", "#fa655f", "#b34c56", "#f4b4a4", "#824c60"];
const CATEGORIES = {
  expense: ["Moradia", "Alimentação", "Transporte", "Saúde", "Educação", "Lazer", "Contas", "Cartão Nubank", "Cartão Atacadão", "Outros"],
  income: ["UBER", "FREELANCE", "SERVIÇO", "VENDAS", "SUPORTE/CUIDADOS", "EXTRAS"]
};
const state = {transactions: [], extraWork: [], uberSettings: {}, vehicleCosts: [], month: "", filter: "all"};
const money = new Intl.NumberFormat("pt-BR", {style: "currency", currency: "BRL"});
const monthFormat = new Intl.DateTimeFormat("pt-BR", {month: "long", year: "numeric"});
const monthNameFormat = new Intl.DateTimeFormat("pt-BR", {month: "long"});
const dateFormat = new Intl.DateTimeFormat("pt-BR", {day: "2-digit", month: "short"});
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
const currentMonth = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

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
  $(".balance-card").classList.toggle("balance-positive", incomeTotal > expenseTotal);
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
    state.vehicleCosts.find((item) => item.month === state.month)?.amount || 0
  );
  renderUberMileage(income);
  renderVehicleCostForm();
  renderUberSettingsForm();
  renderExtraWorkList(state.extraWork.filter((item) => item.date.startsWith(state.month)));
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
    ctx.fillStyle = COLORS[index % COLORS.length];
    ctx.fill();
    start = end;
    const row = document.createElement("div");
    row.className = "legend-item";
    const label = document.createElement("span");
    label.className = "legend-name";
    const dot = document.createElement("i");
    dot.className = "legend-dot";
    dot.style.backgroundColor = COLORS[index % COLORS.length];
    const name = document.createElement("span");
    name.textContent = category;
    label.append(dot, name);
    const amount = document.createElement("span");
    amount.className = "legend-value";
    amount.textContent = money.format(value);
    row.append(label, amount);
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
    const color = value >= 0 ? "#777d38" : "#e94f5d";
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
      {value: week.income, x: center - barWidth - 2, color: "#777d38"},
      {value: week.expense, x: center + 2, color: "#e94f5d"}
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
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  $("#transaction-list").replaceChildren(...filtered.map((item) => transactionRow(item, true)));
  $("#transactions-empty").style.display = filtered.length ? "none" : "block";
  $("#results-count").textContent = `${filtered.length} ${filtered.length === 1 ? "lançamento" : "lançamentos"}`;
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
  date.textContent = dateFormat.format(new Date(`${item.date}T12:00:00`));
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
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Excluir ${item.description}`);
    remove.addEventListener("click", () => deleteTransaction(item));
    actions.append(remove);
    row.append(type, amount, actions);
  } else {
    const amount = document.createElement("td");
    amount.className = `align-right amount-${item.type}`;
    amount.textContent = `${item.type === "income" ? "+" : "−"} ${money.format(amountOf(item))}`;
    row.append(amount);
  }
  return row;
}

function renderWork(income, expenses, extraWork, uberSettings, monthlyMaintenance) {
  const uberTransactions = income.filter((item) => item.category.toUpperCase() === "UBER");
  const weekdayRate = Number(uberSettings.weekday_hourly_rate) || 0;
  const weekendRate = Number(uberSettings.weekend_hourly_rate) || 0;
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
  $("#work-uber-weekly-hours").textContent = hourlyRatesConfigured ? `${weeklyAverage.toLocaleString("pt-BR", {maximumFractionDigits: 1})} h` : "—";
  $("#work-extra-hours").textContent = `${extraHours.toLocaleString("pt-BR", {maximumFractionDigits: 1})} h`;
  $("#work-expenses-total").textContent = money.format(expenseTotal);
  $("#work-required-hours").textContent = hourlyRatesConfigured ? `${requiredHours.toLocaleString("pt-BR", {maximumFractionDigits: 1})} h` : "—";
  const totalDistance = uberTransactions.reduce((sum, item) => sum + Number(item.distance_km || 0), 0);
  $("#uber-distance-total").textContent = `${totalDistance.toLocaleString("pt-BR", {maximumFractionDigits: 1})} km`;
  const allDistanceEntered = uberTransactions.length > 0 && uberTransactions.every((item) => Number(item.distance_km) > 0);
  const costsConfigured = uberSettings.fuel_cost_per_km != null && uberSettings.vehicle_cost_per_km != null;
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
    if (uberSettings.fuel_cost_per_km == null) missing.push("configure o custo de combustível por km");
    if (uberSettings.vehicle_cost_per_km == null) missing.push("configure o custo-base do carro por km");
    marginStatus.textContent = `Estimativa indisponível: ${missing.join(" e ")}.`;
  } else {
    const variableCosts = totalDistance * (Number(uberSettings.fuel_cost_per_km) + Number(uberSettings.vehicle_cost_per_km));
    const estimatedCosts = variableCosts + Number(monthlyMaintenance || 0);
    const netProfit = uberIncome - estimatedCosts;
    const margin = uberIncome ? netProfit / uberIncome * 100 : 0;
    $("#uber-estimated-costs").textContent = money.format(estimatedCosts);
    $("#uber-estimated-profit").textContent = money.format(netProfit);
    $("#uber-margin").textContent = `${margin.toLocaleString("pt-BR", {maximumFractionDigits: 1})}%`;
    const target = uberSettings.target_margin_percent;
    marginStatus.textContent = target == null
      ? "Estimativa: ganhos UBER − (km × custos configurados por km) − manutenção mensal."
      : `Meta configurada: ${Number(target).toLocaleString("pt-BR", {maximumFractionDigits: 1})}%. ${margin >= Number(target) ? "Meta atingida." : "Abaixo da meta."}`;
  }
  $("#work-hours-progress").style.width = requiredHours ? `${Math.min(100, totalHours / requiredHours * 100)}%` : (totalHours ? "100%" : "0%");
  const status = $("#work-hours-status");
  if (!hourlyRatesConfigured) status.textContent = "Configure as taxas por hora para estimar as horas Uber e a meta para cobrir as despesas.";
  else if (!requiredHours && !totalHours) status.textContent = "Registre os ganhos Uber e serviços extras para acompanhar suas horas.";
  else if (!requiredHours) status.textContent = "Não há despesas neste mês. As horas de Uber e serviços extras estão contabilizadas.";
  else if (totalHours < requiredHours) status.textContent = `Somando Uber e extras, faltam ${(requiredHours - totalHours).toLocaleString("pt-BR", {maximumFractionDigits: 1})} h para a meta estimada do mês.`;
  else status.textContent = `Meta mensal de horas alcançada; ${(totalHours - requiredHours).toLocaleString("pt-BR", {maximumFractionDigits: 1})} h acima da meta.`;
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
    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "button button-secondary mileage-save";
    saveButton.textContent = "Salvar";
    saveButton.addEventListener("click", async () => {
      const distance = parseBrazilianAmount(input.value);
      if (!Number.isFinite(distance) || distance <= 0) {
        toast("Informe uma quilometragem maior que zero.");
        input.focus();
        return;
      }
      saveButton.disabled = true;
      try {
        await request(`/api/transactions/${transaction.id}/distance`, {
          method: "PATCH",
          body: JSON.stringify({distance_km: distance})
        });
        await refresh(true);
        toast("Quilometragem do dia salva.");
      } catch (error) {
        toast(error.message);
      } finally {
        saveButton.disabled = false;
      }
    });
    actionCell.append(saveButton);
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
  for (const name of ["fuel_cost_per_km", "vehicle_cost_per_km", "target_margin_percent", "weekday_hourly_rate", "weekend_hourly_rate"]) {
    const input = form.elements[name];
    if (document.activeElement === input) continue;
    const value = state.uberSettings[name];
    input.value = value == null ? "" : Number(value).toLocaleString("pt-BR", {maximumFractionDigits: 2});
  }
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

function switchTab(name) {
  $$(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `${name}-view`));
  const titles = {dashboard: "Dashboard", transactions: "Lançamentos", work: "Meus trabalhos"};
  $("#page-title").textContent = titles[name];
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
    const [transactions, extraWork, uberSettings, vehicleCosts] = await Promise.all([
      request("/api/transactions"),
      request("/api/extra-work"),
      request("/api/uber-settings"),
      request("/api/vehicle-costs")
    ]);
    state.transactions = transactions;
    state.extraWork = extraWork;
    state.uberSettings = uberSettings;
    state.vehicleCosts = vehicleCosts;
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
  form.elements.date.value = formatDateInput(new Date());
  form.elements.distance_km.value = "";
  $("#date-picker").value = formatIsoDateInput(new Date());
  $("#form-error").textContent = "";
  updateCategories();
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
  $$(".tab").forEach((tab) => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));
  $$("[data-open-tab]").forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.openTab)));
  $("#new-transaction").addEventListener("click", openDialog);
  $$("[data-new-transaction]").forEach((button) => button.addEventListener("click", openDialog));
  $("#close-dialog").addEventListener("click", () => $("#transaction-dialog").close());
  $("#cancel-dialog").addEventListener("click", () => $("#transaction-dialog").close());
  $("#transaction-type").addEventListener("change", updateCategories);
  $("#category-select").addEventListener("change", updateUberDistanceField);
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
  $("#transaction-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const transaction = Object.fromEntries(form.entries());
    transaction.amount = parseBrazilianAmount(transaction.amount);
    transaction.distance_km = transaction.distance_km.trim() ? parseBrazilianAmount(transaction.distance_km) : 0;
    transaction.date = parseBrazilianDate(transaction.date);
    if (!Number.isFinite(transaction.amount) || transaction.amount <= 0) {
      $("#form-error").textContent = "Informe um valor válido. Exemplo: 1.234,56.";
      return;
    }
    if (!transaction.date) {
      $("#form-error").textContent = "Informe uma data válida no formato DD/MM/AAAA.";
      return;
    }
    if (!Number.isFinite(transaction.distance_km) || transaction.distance_km < 0 ||
        (transaction.distance_km > 0 && (transaction.type !== "income" || transaction.category !== "UBER"))) {
      $("#form-error").textContent = "A quilometragem deve ser válida e só pode ser informada em ganhos UBER.";
      return;
    }
    try {
      await request("/api/transactions", {method: "POST", body: JSON.stringify(transaction)});
      $("#transaction-dialog").close();
      await refresh(true);
      toast("Lançamento salvo.");
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
    for (const key of ["fuel_cost_per_km", "vehicle_cost_per_km", "target_margin_percent", "weekday_hourly_rate", "weekend_hourly_rate"]) {
      const value = form.elements[key].value.trim();
      settings[key] = value ? parseBrazilianAmount(value) : null;
    }
    if (Object.values(settings).some((value) => value != null && (!Number.isFinite(value) || value < 0))) {
      $("#uber-cost-error").textContent = "Informe valores válidos, iguais ou maiores que zero.";
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
