function requestShutdown() {
  navigator.sendBeacon("/shutdown");
}

window.addEventListener("pagehide", requestShutdown);
window.addEventListener("beforeunload", requestShutdown);

const form = document.getElementById("pipeline-form");
const submitBtn = document.getElementById("submit-btn");

const progressCard = document.getElementById("progress-card");
const errorCard = document.getElementById("error-card");
const resultsCard = document.getElementById("results-card");

const statusBadge = document.getElementById("status-badge");
const statusDetail = document.getElementById("status-detail");
const stepperItems = Array.from(document.querySelectorAll("#stepper li"));

const STEP_ORDER = ["1", "2", "2b", "3", "4-6"];

const historySelect = document.getElementById("historySelect");
const excelContentField = document.getElementById("excelContentField");
const gmailDraftsLink = document.getElementById("gmail-drafts-link");
const excelDownloadLink = document.getElementById("excel-download-link");
const statDraftsLabel = document.getElementById("stat-drafts-label");
const activeProjectNote = document.getElementById("activeProjectNote");
const newProjectBtn = document.getElementById("newProjectBtn");

let pollTimer = null;
let currentJobId = null;
let lastOutputType = "draft";
// Kullanıcı mevcut bir projede sektör/arama alanını değiştirip tekrar aradığında aynı proje
// kaydının güncellenmesi (yeni bir proje açılmaması) için hangi projenin "açık" olduğunu tutar.
// Geçmişten seçilince veya bir arama başarıyla başlatılınca set edilir; "Yeni Proje Başlat" ile
// veya boş geçmiş seçeneğiyle sıfırlanır (bkz. PROJE GÜNCELLEMESİ isteği).
let activeProjectId = null;

function setActiveProject(projectId) {
  activeProjectId = projectId;
  if (activeProjectId) {
    activeProjectNote.classList.remove("hidden");
  } else {
    activeProjectNote.classList.add("hidden");
  }
}

newProjectBtn.addEventListener("click", () => {
  historySelect.value = "";
  setActiveProject(null);
});

function getOutputTypeMode() {
  return form.querySelector('input[name="outputTypeMode"]:checked')?.value ?? "draft";
}

function updateExcelContentVisibility() {
  if (getOutputTypeMode() === "excel") {
    showCard(excelContentField);
  } else {
    hideCard(excelContentField);
  }
}

form.querySelectorAll('input[name="outputTypeMode"]').forEach((radio) => {
  radio.addEventListener("change", updateExcelContentVisibility);
});

function formatHistoryLabel(project) {
  const date = new Date(project.createdAt);
  const dateLabel = Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const shortDescription =
    project.projectDescription.length > 60 ? project.projectDescription.slice(0, 60) + "…" : project.projectDescription;
  return `${dateLabel} — ${shortDescription}`;
}

async function loadSearchHistory() {
  try {
    const res = await fetch("/projects");
    if (!res.ok) return;
    const { projects } = await res.json();
    // Sadece geçmişten dinamik eklenen seçenekleri temizle, ilk (boş/"yeni") seçeneği koru —
    // bir proje güncellendikten sonra listeyi tazelemek için de çağrılır (bkz. submit handler).
    Array.from(historySelect.options)
      .slice(1)
      .forEach((option) => option.remove());
    for (const project of projects ?? []) {
      const option = document.createElement("option");
      option.value = project.id;
      option.textContent = formatHistoryLabel(project);
      option.dataset.project = JSON.stringify(project);
      historySelect.appendChild(option);
    }
  } catch {
    // Geçmiş yüklenemezse formu boş bırak; bu kritik bir hata değil.
  }
}

historySelect.addEventListener("change", () => {
  const selectedOption = historySelect.selectedOptions[0];
  if (!selectedOption || !selectedOption.dataset.project) {
    setActiveProject(null);
    return;
  }
  const project = JSON.parse(selectedOption.dataset.project);
  setActiveProject(project.id);

  document.getElementById("projectDescription").value = project.projectDescription ?? "";
  document.getElementById("targetSectorHint").value = project.targetSectorHint ?? "";
  document.getElementById("targetLocationHint").value = project.targetLocationHint ?? "";
  document.getElementById("maxResultsPerLocation").value = project.maxResultsPerLocation ?? 10;

  const scaleValue = project.scaleFilter ?? "all";
  const scaleRadio = form.querySelector(`input[name="scaleFilter"][value="${scaleValue}"]`);
  if (scaleRadio) scaleRadio.checked = true;

  const outputType = project.outputType ?? "draft";
  const outputModeRadio = form.querySelector(`input[name="outputTypeMode"][value="${outputType === "draft" ? "draft" : "excel"}"]`);
  if (outputModeRadio) outputModeRadio.checked = true;
  if (outputType !== "draft") {
    const excelContentRadio = form.querySelector(`input[name="excelContentType"][value="${outputType}"]`);
    if (excelContentRadio) excelContentRadio.checked = true;
  }
  updateExcelContentVisibility();
});

loadSearchHistory();

function showCard(el) {
  el.classList.remove("hidden");
}

function hideCard(el) {
  el.classList.add("hidden");
}

function resetProgressUI() {
  hideCard(errorCard);
  hideCard(resultsCard);
  showCard(progressCard);
  stepperItems.forEach((li) => li.classList.remove("active", "done"));
  setStatusBadge("active", "Kuyrukta");
  statusDetail.textContent = "";
}

function setStatusBadge(kind, text) {
  statusBadge.textContent = text;
  statusBadge.className = "badge " + (kind === "success" ? "badge-success" : kind === "error" ? "badge-error" : "badge-active");
}

function updateStepper(progress) {
  if (!progress || typeof progress !== "object" || !("step" in progress)) return;
  const currentStep = String(progress.step);
  const currentIndex = STEP_ORDER.indexOf(currentStep);

  stepperItems.forEach((li) => {
    const step = li.dataset.step;
    const stepIndex = STEP_ORDER.indexOf(step);
    li.classList.remove("active", "done");
    if (stepIndex < currentIndex) {
      li.classList.add("done");
    } else if (stepIndex === currentIndex) {
      li.classList.add("active");
    }
  });

  if (progress.label) {
    statusDetail.textContent = progress.label;
  }
}

function scaleLabel(scale) {
  return scale === "large" ? "Büyük" : "Küçük";
}

function renderResults(result) {
  document.getElementById("stat-found").textContent = result.totalLeadsFound ?? 0;
  document.getElementById("stat-known").textContent = result.totalLeadsAlreadyKnown ?? 0;
  document.getElementById("stat-matching").textContent = result.totalLeadsMatchingScale ?? 0;
  document.getElementById("stat-drafts").textContent = result.totalDraftsCreated ?? 0;
  statDraftsLabel.textContent = lastOutputType === "draft" ? "Oluşturulan Taslak" : "Oluşturulan Satır";

  const tbody = document.getElementById("leads-tbody");
  tbody.innerHTML = "";

  const leads = result.leads ?? [];
  if (leads.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="4" style="color: var(--text-muted); text-align: center;">Sonuç oluşturulan lead bulunamadı.</td>';
    tbody.appendChild(row);
  }

  for (const lead of leads) {
    const row = document.createElement("tr");

    const contact = lead.linkedin
      ? `${escapeHtml(lead.linkedin.fullName)} — ${escapeHtml(lead.linkedin.title || "")}`
      : lead.contactEmail
        ? escapeHtml(lead.contactEmail)
        : "Web sitesi üzerinden";

    row.innerHTML = `
      <td>${escapeHtml(lead.title)}</td>
      <td><span class="scale-badge ${lead.scale}">${scaleLabel(lead.scale)}</span></td>
      <td>${contact}</td>
      <td>${escapeHtml(lead.email?.subject ?? "")}</td>
    `;
    tbody.appendChild(row);
  }

  if (lastOutputType === "draft") {
    showCard(gmailDraftsLink);
    hideCard(excelDownloadLink);
  } else {
    hideCard(gmailDraftsLink);
    excelDownloadLink.href = `/pipeline/${currentJobId}/download-excel`;
    showCard(excelDownloadLink);
  }

  showCard(resultsCard);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function pollJob(jobId) {
  try {
    const res = await fetch(`/pipeline/${jobId}`);
    if (!res.ok) throw new Error(`Durum sorgusu başarısız: ${res.status}`);
    const data = await res.json();

    updateStepper(data.progress);

    if (data.state === "completed") {
      stopPolling();
      setStatusBadge("success", "Tamamlandı");
      statusDetail.textContent = "";
      stepperItems.forEach((li) => li.classList.add("done"));
      renderResults(data.result ?? {});
      submitBtn.disabled = false;
    } else if (data.state === "failed") {
      stopPolling();
      setStatusBadge("error", "Başarısız");
      document.getElementById("error-message").textContent = data.failedReason || "Bilinmeyen bir hata oluştu.";
      showCard(errorCard);
      submitBtn.disabled = false;
    } else {
      setStatusBadge("active", data.state === "active" ? "Çalışıyor" : "Kuyrukta");
    }
  } catch (err) {
    stopPolling();
    setStatusBadge("error", "Bağlantı hatası");
    document.getElementById("error-message").textContent = err instanceof Error ? err.message : String(err);
    showCard(errorCard);
    submitBtn.disabled = false;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitBtn.disabled = true;
  resetProgressUI();

  const formData = new FormData(form);
  const payload = {
    projectDescription: formData.get("projectDescription").trim(),
  };

  const sectorHint = formData.get("targetSectorHint")?.trim();
  if (sectorHint) payload.targetSectorHint = sectorHint;

  const locationHint = formData.get("targetLocationHint")?.trim();
  if (locationHint) payload.targetLocationHint = locationHint;

  const scaleFilter = formData.get("scaleFilter");
  if (scaleFilter && scaleFilter !== "all") payload.scaleFilter = scaleFilter;

  const maxResults = Number(formData.get("maxResultsPerLocation"));
  if (Number.isFinite(maxResults) && maxResults > 0) payload.maxResultsPerLocation = maxResults;

  const outputTypeMode = formData.get("outputTypeMode");
  const outputType = outputTypeMode === "excel" ? formData.get("excelContentType") || "excel_info" : "draft";
  if (outputType !== "draft") payload.outputType = outputType;
  lastOutputType = outputType;

  // Mevcut bir proje düzenleniyorsa (geçmişten seçildi ya da bu oturumda daha önce başlatıldı),
  // sektör/arama alanları değişmiş olsa bile yeni bir proje kaydı açılmaması için id gönderilir
  // (bkz. PROJE GÜNCELLEMESİ isteği, projects.service.ts → upsertSearchProject).
  if (activeProjectId) payload.projectId = activeProjectId;

  try {
    const res = await fetch("/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody?.error?.formErrors?.join(", ") || `İstek başarısız: ${res.status}`);
    }

    const { jobId, projectId } = await res.json();
    currentJobId = jobId;
    if (projectId) {
      setActiveProject(projectId);
      loadSearchHistory().then(() => {
        historySelect.value = projectId;
      });
    }
    pollTimer = setInterval(() => pollJob(jobId), 3000);
    pollJob(jobId);
  } catch (err) {
    setStatusBadge("error", "Başlatılamadı");
    document.getElementById("error-message").textContent = err instanceof Error ? err.message : String(err);
    showCard(errorCard);
    submitBtn.disabled = false;
  }
});
