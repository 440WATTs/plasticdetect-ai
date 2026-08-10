(() => {
  const STORAGE_KEY = "plasticdetect.history.v1";
  const THEME_KEY = "plasticdetect.theme";

  let state = {
    screen: "home",
    stream: null,
    facingMode: "environment",
    flashOn: false,
    lastCapture: null, // {image, classId, confidence, allScores, source, timestamp}
    modelStatus: "loading" // "loading" | "ready" | "error"
  };

  // ---------- Utilities ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch { return []; }
  }
  function saveHistory(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 200)));
  }
  function addHistoryEntry(entry) {
    const list = loadHistory();
    list.unshift(entry);
    saveHistory(list);
  }

  function showSnackbar(text) {
    const bar = $("#snackbar");
    bar.textContent = text;
    bar.classList.add("show");
    clearTimeout(showSnackbar._t);
    showSnackbar._t = setTimeout(() => bar.classList.remove("show"), 2200);
  }

  function openSheet(html) {
    $("#sheet-content").innerHTML = html;
    $("#sheet-backdrop").classList.add("show");
    $("#bottom-sheet").classList.add("show");
  }
  function closeSheet() {
    $("#sheet-backdrop").classList.remove("show");
    $("#bottom-sheet").classList.remove("show");
  }
  $("#sheet-backdrop").addEventListener("click", closeSheet);

  // ---------- Theme ----------
  function applyTheme(mode) {
    document.documentElement.setAttribute("data-theme", mode);
    $("#dark-mode-toggle").checked = mode === "dark";
    localStorage.setItem(THEME_KEY, mode);
  }
  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    applyTheme(current === "dark" ? "light" : "dark");
  }
  (function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(saved || (prefersDark ? "dark" : "light"));
  })();
  $("#theme-toggle-home").addEventListener("click", toggleTheme);
  $("#dark-mode-toggle").addEventListener("change", (e) => applyTheme(e.target.checked ? "dark" : "light"));

  // ---------- Navigation ----------
  function goToScreen(name) {
    $$(".screen").forEach((s) => s.classList.remove("active"));
    $(`#screen-${name}`).classList.add("active");
    $$(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.screen === name));
    state.screen = name;

    if (name === "scan") startCamera(); else stopCamera();
    if (name === "history") renderHistory();
    if (name === "home") renderRecentScan();
  }
  $$(".nav-item").forEach((btn) => btn.addEventListener("click", () => goToScreen(btn.dataset.screen)));

  $("#home-take-photo").addEventListener("click", () => goToScreen("scan"));
  $("#home-scan-ring").addEventListener("click", () => goToScreen("scan"));
  $("#home-choose-gallery").addEventListener("click", () => $("#file-input").click());
  $("#btn-gallery-scan").addEventListener("click", () => $("#file-input").click());

  // ---------- Camera ----------
  async function startCamera() {
    const video = $("#camera-video");
    const placeholder = $("#camera-placeholder");
    try {
      if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: state.facingMode },
        audio: false
      });
      video.srcObject = state.stream;
      video.classList.remove("hidden");
      placeholder.classList.add("hidden");
      $("#captured-preview").classList.add("hidden");
    } catch (err) {
      video.classList.add("hidden");
      placeholder.classList.remove("hidden");
      placeholder.querySelector("span").textContent = "Camera unavailable — use Gallery instead";
    }
  }
  function stopCamera() {
    if (state.stream) {
      state.stream.getTracks().forEach((t) => t.stop());
      state.stream = null;
    }
  }

  $("#btn-switch-camera").addEventListener("click", () => {
    state.facingMode = state.facingMode === "environment" ? "user" : "environment";
    startCamera();
  });
  $("#btn-flash").addEventListener("click", (e) => {
    state.flashOn = !state.flashOn;
    e.currentTarget.classList.toggle("active", state.flashOn);
    showSnackbar(state.flashOn ? "Flash on" : "Flash off");
  });

  $("#btn-shutter").addEventListener("click", () => {
    const video = $("#camera-video");
    if (!video.srcObject) { startCamera(); return; }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 480;
    canvas.height = video.videoHeight || 640;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    runCapture(dataUrl);
  });

  $("#file-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => runCapture(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  });

  // ---------- Capture -> Classify -> Result ----------
  function runCapture(dataUrl) {
    goToScreen("scan");
    stopCamera();
    $("#camera-video").classList.add("hidden");
    $("#camera-placeholder").classList.add("hidden");
    const preview = $("#captured-preview");
    preview.src = dataUrl;
    preview.classList.remove("hidden");
    $("#camera-wrap").classList.add("scanning");

    const img = new Image();
    img.onload = () => {
      // slight delay so the scanning sweep animation is visible
      setTimeout(async () => {
        const { classId, confidence, allScores, source } = await Classifier.classify(img);
        $("#camera-wrap").classList.remove("scanning");
        const entry = {
          id: Date.now(),
          image: dataUrl,
          classId,
          confidence,
          allScores,
          source,
          timestamp: Date.now()
        };
        state.lastCapture = entry;
        addHistoryEntry(entry);
        renderResult(entry, { fresh: true });
        goToScreen("result");
      }, 1100);
    };
    img.src = dataUrl;
  }

  // ---------- Result rendering ----------
  function renderResult(entry, opts = {}) {
    const info = PLASTIC_DB[entry.classId];
    const pct = Math.round(entry.confidence * 100);
    const circumference = 2 * Math.PI * 30;
    const offset = circumference * (1 - entry.confidence);

    const recyclableBadge = info.recyclable === true
      ? `<span class="badge badge-yes">✓ Recyclable</span>`
      : info.recyclable === false
        ? `<span class="badge badge-no">✕ Not curbside recyclable</span>`
        : `<span class="badge badge-unknown">? Unclear</span>`;

    const usesTags = (info.uses || []).map((u) => `<span class="tag">${u}</span>`).join("") || `<span class="tag">—</span>`;
    const disposalItems = (info.disposal || []).map((d) => `
      <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>${d}</li>
    `).join("");

    const breakdownRows = (entry.allScores || []).map((s) => {
      const rowInfo = PLASTIC_DB[s.classId];
      const rowPct = Math.round(s.confidence * 100);
      return `
        <div class="breakdown-row">
          <div class="breakdown-label">${rowInfo ? rowInfo.name : s.classId}</div>
          <div class="breakdown-bar-track">
            <div class="breakdown-bar-fill" style="width:${rowPct}%; background:${rowInfo ? rowInfo.color : "var(--primary)"}"></div>
          </div>
          <div class="breakdown-pct">${rowPct}%</div>
        </div>
      `;
    }).join("");

    const sourceNote = entry.source === "heuristic"
      ? `<div class="heuristic-note">⚠ AI model unavailable for this scan — estimated with an on-device fallback. Results may be less reliable.</div>`
      : "";

    $("#result-body").innerHTML = `
      <div class="result-image-wrap"><img src="${entry.image}" alt="${info.example}" /></div>

      <div class="result-header">
        <div>
          <div class="result-title">${info.example}</div>
          <div class="result-sub">${info.fullName}</div>
          ${recyclableBadge}
        </div>
        <div class="gauge-wrap">
          <svg width="74" height="74" viewBox="0 0 74 74">
            <circle class="gauge-track" cx="37" cy="37" r="30" />
            <circle class="gauge-fill" cx="37" cy="37" r="30"
              stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}" />
          </svg>
          <div class="gauge-label">${pct}%</div>
        </div>
      </div>

      ${sourceNote}

      <div class="info-grid">
        <div class="card info-tile">
          <div class="label">Plastic Number</div>
          <div class="value" style="color:${info.color}">♳ ${info.name} (${info.symbol})</div>
        </div>
        <div class="card info-tile">
          <div class="label">Category</div>
          <div class="value">${info.category}</div>
        </div>
      </div>

      ${breakdownRows ? `
      <div class="section-label">Confidence Breakdown</div>
      <div class="card" style="padding:16px;">
        ${breakdownRows}
      </div>
      ` : ""}

      <div class="section-label">Common Uses</div>
      <div class="card" style="padding:14px;">
        <div class="tag-list">${usesTags}</div>
      </div>

      <div class="section-label">Disposal</div>
      <div class="card" style="padding:16px;">
        <ul class="check-list">${disposalItems}</ul>
      </div>

      <div class="section-label">Environmental Facts</div>
      <div class="card fact-card" style="padding:16px;">
        <div class="info-tile" style="padding:0;margin-bottom:10px;">
          <div class="label">Average Decomposition</div>
          <div class="value">${info.decomposition}</div>
        </div>
        <div style="font-size:14px;line-height:1.5;color:var(--text);">${info.fact}</div>
      </div>

      <div class="btn-row" style="margin-top:20px;">
        <button class="btn btn-secondary" id="btn-scan-again">Scan Again</button>
        <button class="btn btn-primary" id="btn-save-result">Save</button>
      </div>
    `;

    // animate gauge fill
    requestAnimationFrame(() => {
      const fill = $(".gauge-fill");
      if (fill) fill.style.strokeDashoffset = String(offset);
    });

    $("#btn-scan-again").addEventListener("click", () => goToScreen("scan"));
    $("#btn-save-result").addEventListener("click", () => showSnackbar("Scan saved to history"));

    if (opts.fresh && entry.confidence > 0.95) {
      launchConfetti();
    }
  }

  $("#result-back").addEventListener("click", () => goToScreen("home"));
  $("#result-share").addEventListener("click", () => {
    if (navigator.share && state.lastCapture) {
      const info = PLASTIC_DB[state.lastCapture.classId];
      navigator.share({ title: "PlasticDetect AI", text: `I scanned a ${info.example} — ${info.recyclable ? "recyclable" : "not curbside recyclable"}.` }).catch(() => {});
    } else {
      showSnackbar("Sharing not supported on this device");
    }
  });

  // ---------- Recent scan (home) ----------
  function renderRecentScan() {
    const list = loadHistory();
    const slot = $("#recent-scan-slot");
    if (!list.length) {
      slot.innerHTML = `<div class="card" style="padding:16px;color:var(--text-muted);font-size:14px;">No scans yet — take your first photo above.</div>`;
      return;
    }
    const entry = list[0];
    const info = PLASTIC_DB[entry.classId];
    slot.innerHTML = `
      <div class="card card-row" id="recent-scan-card" style="cursor:pointer;">
        <img src="${entry.image}" class="history-thumb" alt="${info.example}" />
        <div class="history-info">
          <div class="history-title">${info.example}</div>
          <div class="history-meta">${Math.round(entry.confidence * 100)}% confidence · ${timeAgo(entry.timestamp)}</div>
        </div>
        <svg class="chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
    `;
    $("#recent-scan-card").addEventListener("click", () => {
      state.lastCapture = entry;
      renderResult(entry);
      goToScreen("result");
    });
  }

  // ---------- History screen ----------
  function timeAgo(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString();
  }

  function renderHistory(filter = "") {
    const list = loadHistory().filter((e) => {
      if (!filter) return true;
      const info = PLASTIC_DB[e.classId];
      return info.example.toLowerCase().includes(filter.toLowerCase()) || info.name.toLowerCase().includes(filter.toLowerCase());
    });
    const container = $("#history-list");
    if (!list.length) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 5v5h5M12 7v5l4 2"/></svg>
          <div>No scans found</div>
        </div>`;
      return;
    }
    container.innerHTML = list.map((entry) => {
      const info = PLASTIC_DB[entry.classId];
      return `
        <div class="card history-item" data-id="${entry.id}">
          <img src="${entry.image}" class="history-thumb" alt="${info.example}" />
          <div class="history-info">
            <div class="history-title">${info.example}</div>
            <div class="history-meta">${Math.round(entry.confidence * 100)}% · ${timeAgo(entry.timestamp)}</div>
          </div>
          <button class="history-delete" data-delete="${entry.id}" aria-label="Delete">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0-1 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 6"/></svg>
          </button>
        </div>
      `;
    }).join("");

    $$("[data-delete]").forEach((btn) => btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.delete);
      const updated = loadHistory().filter((x) => x.id !== id);
      saveHistory(updated);
      renderHistory($("#history-search").value);
      showSnackbar("Scan deleted");
    }));

    $$(".history-item").forEach((row) => row.addEventListener("click", () => {
      const id = Number(row.dataset.id);
      const entry = loadHistory().find((x) => x.id === id);
      if (!entry) return;
      state.lastCapture = entry;
      renderResult(entry);
      goToScreen("result");
    }));
  }
  $("#history-search").addEventListener("input", (e) => renderHistory(e.target.value));

  // ---------- Settings actions ----------
  $("#row-clear-history").addEventListener("click", () => {
    openSheet(`
      <h3 style="margin:0 0 6px;">Clear scan history?</h3>
      <p style="color:var(--text-muted);font-size:14px;margin:0 0 18px;">This removes all saved scans from this device. This can't be undone.</p>
      <div class="btn-row">
        <button class="btn btn-secondary" id="cancel-clear">Cancel</button>
        <button class="btn btn-primary" id="confirm-clear" style="background:linear-gradient(135deg,#FF5252,#FF8A65)">Clear</button>
      </div>
    `);
    $("#confirm-clear").addEventListener("click", () => {
      saveHistory([]);
      closeSheet();
      renderHistory();
      renderRecentScan();
      showSnackbar("History cleared");
    });
    $("#cancel-clear").addEventListener("click", closeSheet);
  });
  $("#row-about").addEventListener("click", () => openSheet(`
    <h3 style="margin:0 0 8px;">About PlasticDetect AI</h3>
    <p style="color:var(--text-muted);font-size:14px;line-height:1.5;">
      Version 1 of a larger Smart Waste Management platform. Plastic type identification (PET, HDPE,
      PVC, LDPE, PP, PS) runs on a MobileNetV2 model trained on-device in your browser — no photo is
      ever uploaded anywhere. If the model can't load, a simpler on-device estimate is used instead,
      and you'll see a notice when that happens.
    </p>
  `));
  $("#row-privacy").addEventListener("click", () => openSheet(`
    <h3 style="margin:0 0 8px;">Privacy</h3>
    <p style="color:var(--text-muted);font-size:14px;line-height:1.5;">
      Photos are processed on your device and saved only to local storage on this device. Nothing is uploaded to a server in this build.
    </p>
  `));
  $("#row-language").addEventListener("click", () => showSnackbar("English is the only language available right now"));

  // ---------- Guide sheet ----------
  $("#open-guide").addEventListener("click", () => {
    const rows = PLASTIC_ORDER.map((id) => {
      const info = PLASTIC_DB[id];
      return `
        <div class="card-row" style="padding:10px 0;border-bottom:1px solid var(--border);">
          <div class="resin-chip" style="color:${info.color}">${info.symbol}</div>
          <div>
            <div style="font-weight:700;font-size:14px;">${info.name} <span style="color:var(--text-muted);font-weight:500;">— ${info.fullName}</span></div>
            <div style="font-size:12.5px;color:var(--text-muted);">${info.recyclable === true ? "Widely recyclable" : info.recyclable === false ? "Limited / specialty recycling" : "Varies"}</div>
          </div>
        </div>
      `;
    }).join("");
    openSheet(`<h3 style="margin:0 0 10px;">Plastic Resin Codes</h3>${rows}`);
  });

  // ---------- Eco tip ----------
  (function setEcoTip() {
    const dayIndex = Math.floor(Date.now() / 86400000) % ECO_TIPS.length;
    $("#eco-tip-text").textContent = ECO_TIPS[dayIndex];
  })();

  // ---------- Confetti ----------
  function launchConfetti() {
    const canvas = $("#confetti-canvas");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext("2d");
    const colors = ["#00C853", "#2979FF", "#00A876", "#FFD54F", "#FF7043"];
    const particles = Array.from({ length: 90 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.3,
      r: 4 + Math.random() * 5,
      c: colors[Math.floor(Math.random() * colors.length)],
      vy: 2 + Math.random() * 3,
      vx: -1.5 + Math.random() * 3,
      rot: Math.random() * 360,
      vr: -8 + Math.random() * 16
    }));
    let frame = 0;
    const maxFrames = 130;
    function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
        ctx.restore();
      });
      frame++;
      if (frame < maxFrames) requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    tick();
  }

  // ---------- Model status banner ----------
  // classifier.js dispatches this event; app.js owns all DOM/UI updates so
  // the two modules stay decoupled.
  function updateModelStatusBanner(status) {
    state.modelStatus = status;
    const banner = $("#model-status-banner");
    const text = $("#model-status-text");
    banner.classList.remove("status-ready", "status-error");
    clearTimeout(updateModelStatusBanner._hideTimer);

    if (status === "loading") {
      text.textContent = "Loading AI model…";
      banner.classList.remove("hidden");
    } else if (status === "ready") {
      text.textContent = "AI model ready";
      banner.classList.add("status-ready");
      banner.classList.remove("hidden");
      updateModelStatusBanner._hideTimer = setTimeout(() => banner.classList.add("hidden"), 1600);
    } else if (status === "error") {
      text.textContent = "AI model unavailable — using fallback mode";
      banner.classList.add("status-error");
      banner.classList.remove("hidden");
      // stays visible for the session so the user knows results are estimated
    }
  }
  window.addEventListener("plasticdetect:model-status", (e) => updateModelStatusBanner(e.detail.status));

  // ---------- Init ----------
  renderRecentScan();
  renderHistory();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    });
  }
})();
