const form = document.getElementById("pipeline-form");
const submitBtn = document.getElementById("submit-btn");

const progressCard = document.getElementById("progress-card");
const errorCard = document.getElementById("error-card");
const resultsCard = document.getElementById("results-card");

const statusBadge = document.getElementById("status-badge");
const statusDetail = document.getElementById("status-detail");
const stepperItems = Array.from(document.querySelectorAll("#stepper li"));

const STEP_ORDER = ["1", "2", "3", "4-6"];

let pollTimer = null;

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
  document.getElementById("stat-matching").textContent = result.totalLeadsMatchingScale ?? 0;
  document.getElementById("stat-drafts").textContent = result.totalDraftsCreated ?? 0;

  const tbody = document.getElementById("leads-tbody");
  tbody.innerHTML = "";

  const leads = result.leads ?? [];
  if (leads.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="4" style="color: var(--text-muted); text-align: center;">Taslak oluşturulan lead bulunamadı.</td>';
    tbody.appendChild(row);
  }

  for (const lead of leads) {
    const row = document.createElement("tr");

    const contact = lead.linkedin ? `${escapeHtml(lead.linkedin.fullName)} — ${escapeHtml(lead.linkedin.title || "")}` : "Web sitesi üzerinden";

    row.innerHTML = `
      <td>${escapeHtml(lead.title)}</td>
      <td><span class="scale-badge ${lead.scale}">${scaleLabel(lead.scale)}</span></td>
      <td>${contact}</td>
      <td>${escapeHtml(lead.email?.subject ?? "")}</td>
    `;
    tbody.appendChild(row);
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

    const { jobId } = await res.json();
    pollTimer = setInterval(() => pollJob(jobId), 3000);
    pollJob(jobId);
  } catch (err) {
    setStatusBadge("error", "Başlatılamadı");
    document.getElementById("error-message").textContent = err instanceof Error ? err.message : String(err);
    showCard(errorCard);
    submitBtn.disabled = false;
  }
});
