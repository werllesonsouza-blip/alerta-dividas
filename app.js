const STORAGE_KEY = "alerta-dividas-v1";
const SETTINGS_KEY = "alerta-dividas-settings-v1";
const $ = (id) => document.getElementById(id);
const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const todayISO = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
};
const parseLocalDate = (iso) => {
  const [y,m,d] = iso.split("-").map(Number);
  return new Date(y, m-1, d, 12, 0, 0, 0);
};
const dayDiff = (iso) => Math.round((parseLocalDate(iso) - parseLocalDate(todayISO())) / 86400000);
let debts = loadJSON(STORAGE_KEY, []);
let settings = { days: "1", time: "09:00", repeatDaily: false, ...loadJSON(SETTINGS_KEY, {}) };
let toastTimer;

function loadJSON(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; }
  catch { return fallback; }
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(debts));
  render();
}
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}
function formatDate(iso) {
  if (!iso) return "";
  const [y,m,d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function statusOf(debt) {
  if (debt.paid) return { text: "Paga", className: "paid" };
  const diff = dayDiff(debt.date);
  if (diff < 0) return { text: `Atrasada há ${Math.abs(diff)} dia(s)`, className: "overdue" };
  if (diff === 0) return { text: "Vence hoje", className: "today" };
  if (diff === 1) return { text: "Vence amanhã", className: "pending" };
  return { text: `Vence em ${diff} dias`, className: "pending" };
}
function render() {
  const pending = debts.filter(d => !d.paid);
  const overdue = pending.filter(d => dayDiff(d.date) < 0);
  const upcoming = pending.filter(d => dayDiff(d.date) >= 0 && dayDiff(d.date) <= 7);
  $("totalPending").textContent = money(pending.reduce((sum,d) => sum + Number(d.amount), 0));
  $("overdueCount").textContent = overdue.length;
  $("upcomingCount").textContent = upcoming.length;
  $("paidCount").textContent = debts.filter(d => d.paid).length;

  const filter = $("filterSelect").value;
  const shown = debts.filter(d => {
    if (filter === "pending") return !d.paid;
    if (filter === "overdue") return !d.paid && dayDiff(d.date) < 0;
    if (filter === "paid") return d.paid;
    return true;
  }).sort((a,b) => a.paid - b.paid || a.date.localeCompare(b.date));
  $("debtList").innerHTML = "";
  $("emptyState").classList.toggle("hidden", shown.length > 0);
  for (const debt of shown) {
    const status = statusOf(debt);
    const card = document.createElement("article");
    card.className = "debt-card";
    const top = document.createElement("div");
    top.className = "debt-top";
    const main = document.createElement("div");
    main.className = "debt-main";
    const name = document.createElement("div");
    name.className = "debt-name";
    name.textContent = debt.name;
    const amount = document.createElement("div");
    amount.className = "debt-amount";
    amount.textContent = money(debt.amount);
    const meta = document.createElement("div");
    meta.className = "debt-meta";
    meta.textContent = `Vencimento: ${formatDate(debt.date)}${debt.notes ? " · " + debt.notes : ""}`;
    const badge = document.createElement("span");
    badge.className = `status ${status.className}`;
    badge.textContent = status.text;
    main.append(name, amount, meta, badge);
    top.append(main);
    card.append(top);

    const actions = document.createElement("div");
    actions.className = "debt-actions";
    const payBtn = makeButton(debt.paid ? "Reabrir conta" : "✓ Marcar como paga", "small-button pay", () => {
      debt.paid = !debt.paid;
      debt.paidAt = debt.paid ? new Date().toISOString() : null;
      save();
      showToast(debt.paid ? "Conta marcada como paga." : "Conta voltou para pendentes.");
    });
    const editBtn = makeButton("Editar", "small-button", () => startEdit(debt));
    const deleteBtn = makeButton("Excluir", "small-button delete", () => {
      if (confirm(`Excluir a conta "${debt.name}"?`)) {
        debts = debts.filter(d => d.id !== debt.id);
        save();
        showToast("Conta excluída.");
      }
    });
    actions.append(payBtn, editBtn, deleteBtn);
    card.append(actions);
    $("debtList").append(card);
  }
}
function makeButton(label, className, callback) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", callback);
  return button;
}
function resetForm() {
  $("debtForm").reset();
  $("debtId").value = "";
  $("formHeading").textContent = "Adicionar uma conta";
  $("saveBtn").textContent = "＋ Adicionar conta";
  $("cancelEditBtn").classList.add("hidden");
  $("debtDate").value = todayISO();
}
function startEdit(debt) {
  $("debtId").value = debt.id;
  $("debtName").value = debt.name;
  $("debtAmount").value = debt.amount;
  $("debtDate").value = debt.date;
  $("debtNotes").value = debt.notes || "";
  $("formHeading").textContent = "Editar conta";
  $("saveBtn").textContent = "Salvar alterações";
  $("cancelEditBtn").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$("debtForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("debtName").value.trim();
  const amount = Number($("debtAmount").value);
  const date = $("debtDate").value;
  const notes = $("debtNotes").value.trim();
  if (!name || !Number.isFinite(amount) || amount <= 0 || !date) {
    showToast("Confira o nome, valor e vencimento.");
    return;
  }
  const id = $("debtId").value;
  if (id) {
    const old = debts.find(d => d.id === id);
    if (old) Object.assign(old, { name, amount, date, notes });
    showToast("Alterações salvas.");
  } else {
    debts.push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), name, amount, date, notes, paid: false, createdAt: new Date().toISOString() });
    showToast("Conta adicionada.");
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(debts));
  resetForm();
  render();
  checkDueReminders();
});
$("cancelEditBtn").addEventListener("click", resetForm);
$("filterSelect").addEventListener("change", render);

function saveSettings() {
  settings.days = $("reminderDays").value;
  settings.time = $("reminderTime").value;
  settings.repeatDaily = $("repeatDaily").checked;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  showToast("Preferências salvas neste dispositivo.");
  checkDueReminders();
}
$("reminderDays").addEventListener("change", saveSettings);
$("reminderTime").addEventListener("change", saveSettings);
$("repeatDaily").addEventListener("change", saveSettings);

async function requestNotifications() {
  if (!("Notification" in window)) {
    $("notificationStatus").textContent = "Este navegador não oferece notificações web compatíveis.";
    showToast("Notificações não são suportadas neste navegador.");
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    updateNotificationStatus();
    if (permission === "granted") {
      showToast("Permissão de notificações ativada.");
      checkDueReminders(true);
    } else {
      showToast("Permissão não concedida. Você pode ativá-la nas configurações do navegador.");
    }
  } catch {
    showToast("Não foi possível pedir permissão neste navegador.");
  }
}
function updateNotificationStatus() {
  if (!("Notification" in window)) {
    $("notificationStatus").textContent = "Este navegador não oferece notificações web compatíveis.";
  } else if (Notification.permission === "granted") {
    $("notificationStatus").textContent = "Permissão ativada. Os avisos são verificados quando o site está aberto; o navegador pode limitar a execução em segundo plano.";
  } else if (Notification.permission === "denied") {
    $("notificationStatus").textContent = "Notificações bloqueadas. Altere a permissão do site nas configurações do navegador.";
  } else {
    $("notificationStatus").textContent = "Permita notificações para receber avisos do navegador. Isso não garante alarmes no horário com o site fechado.";
  }
}
$("enableNotifications").addEventListener("click", requestNotifications);

function checkDueReminders(force = false) {
  const now = new Date();
  const today = todayISO();
  const [hh, mm] = settings.time.split(":").map(Number);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const targetMinutes = hh * 60 + mm;
  if (!force && currentMinutes < targetMinutes) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const due = debts.filter(d => !d.paid && dayDiff(d.date) === Number(settings.days));
  const late = settings.repeatDaily ? debts.filter(d => !d.paid && dayDiff(d.date) < 0) : [];
  const candidates = [...new Map([...due, ...late].map(d => [d.id, d])).values()];
  for (const debt of candidates) {
    const key = `alerta-notified-${today}-${debt.id}`;
    if (!force && localStorage.getItem(key)) continue;
    try {
      const title = debt.date < today ? "Conta em atraso" : "Lembrete de vencimento";
      const body = `${debt.name}: ${money(debt.amount)} · vencimento ${formatDate(debt.date)}.`;
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(reg => reg.showNotification(title, {
          body, icon: "./icons/icon-192.png", badge: "./icons/icon-192.png", tag: key,
          data: { url: "./" }
        })).catch(() => new Notification(title, { body }));
      } else {
        new Notification(title, { body });
      }
      localStorage.setItem(key, "1");
    } catch { /* O navegador pode bloquear notificações em algumas situações. */ }
  }
}
setInterval(() => checkDueReminders(), 60 * 1000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkDueReminders(); });
window.addEventListener("focus", checkDueReminders);

let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  $("installBtn").classList.remove("hidden");
});
$("installBtn").addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  $("installBtn").classList.add("hidden");
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
$("debtDate").value = todayISO();
$("reminderDays").value = settings.days;
$("reminderTime").value = settings.time;
$("repeatDaily").checked = Boolean(settings.repeatDaily);
updateNotificationStatus();
render();
checkDueReminders();


// Backup local: exporta contas e preferências em um arquivo JSON.
$("exportBackup").addEventListener("click", () => {
  try {
    const backup = {
      app: "Alerta Dívidas",
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      debts,
      settings
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = todayISO();
    link.href = url;
    link.download = `alerta-dividas-backup-${date}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $("backupStatus").textContent = "Backup criado. Confira a pasta Downloads do seu celular e guarde o arquivo em local seguro.";
    showToast("Backup baixado com sucesso.");
  } catch {
    $("backupStatus").textContent = "Não foi possível criar o backup neste navegador. Tente novamente.";
    showToast("Não foi possível criar o backup.");
  }
});

$("importBackup").addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    const raw = await file.text();
    const backup = JSON.parse(raw);
    const validDebts = Array.isArray(backup.debts) && backup.debts.every(d =>
      d && typeof d.id === "string" &&
      typeof d.name === "string" &&
      Number.isFinite(Number(d.amount)) &&
      typeof d.date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(d.date) &&
      typeof d.paid === "boolean"
    );
    const validSettings = backup.settings && typeof backup.settings === "object" &&
      ["0", "1", "3", "7"].includes(String(backup.settings.days)) &&
      /^\d{2}:\d{2}$/.test(String(backup.settings.time));
    if (backup.app !== "Alerta Dívidas" || backup.formatVersion !== 1 || !validDebts || !validSettings) {
      throw new Error("Formato inválido");
    }
    if (!confirm(`Restaurar ${backup.debts.length} conta(s)? Isso substituirá as contas e preferências atualmente salvas neste navegador.`)) {
      event.target.value = "";
      return;
    }
    debts = backup.debts;
    settings = {
      days: String(backup.settings.days),
      time: String(backup.settings.time),
      repeatDaily: Boolean(backup.settings.repeatDaily)
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(debts));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    $("reminderDays").value = settings.days;
    $("reminderTime").value = settings.time;
    $("repeatDaily").checked = settings.repeatDaily;
    render();
    updateNotificationStatus();
    $("backupStatus").textContent = `Backup restaurado: ${debts.length} conta(s). Confira a lista e os totais.`;
    showToast("Backup restaurado com sucesso.");
  } catch {
    $("backupStatus").textContent = "Não foi possível restaurar. Escolha um arquivo de backup válido do Alerta Dívidas.";
    showToast("Arquivo inválido ou não foi possível ler.");
  } finally {
    event.target.value = "";
  }
});

