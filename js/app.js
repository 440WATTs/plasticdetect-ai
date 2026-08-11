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

  // ---------- Translations ----------
  function applyTranslations() {
    document.title = "PlasticDetect AI";
    $$("[data-i18n]").forEach((el) => { el.textContent = I18N.t(el.dataset.i18n); });
    $$("[data-i18n-placeholder]").forEach((el) => { el.placeholder = I18N.t(el.dataset.i18nPlaceholder); });
    const lang = I18N.LANGS.find((l) => l.code === I18N.getLang()) || I18N.LANGS[0];
    $("#row-language-value").textContent = `${lang.native} ›`;
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
      placeholder.querySelector("span").textContent = I18N.t("scan_camera_unavailable");
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
    showSnackbar(state.flashOn ? I18N.t("scan_flash_on") : I18N.t("scan_flash_off"));
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

    // Three-tier recyclability badge, driven by the same recyclabilityLevel
    // field used for the "recyc_level_*" guidance row — green/yellow/red
    // instead of a misleading recyclable/not-recyclable binary.
    const recyclableBadge = info.recyclabilityLevel === "recyclable"
      ? `<span class="badge badge-yes">${I18N.t("result_recyclable")}</span>`
      : info.recyclabilityLevel === "limited"
        ? `<span class="badge badge-limited">${I18N.t("result_limited_recyclable")}</span>`
        : info.recyclabilityLevel === "difficult"
          ? `<span class="badge badge-no">${I18N.t("result_not_recyclable")}</span>`
          : `<span class="badge badge-unknown">${I18N.t("result_unclear")}</span>`;

    const usesTags = (info.uses || []).map((u) => `<span class="tag">${u}</span>`).join("") || `<span class="tag">—</span>`;
    const disposalItems = (info.disposal || []).map((d) => `
      <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>${d}</li>
    `).join("");

    // Confidence breakdown: if the top prediction rounds to 100%, show only
    // that one bar — otherwise show at most the top 3 classes, not all 9.
    const allScores = entry.allScores || [];
    const topPct = allScores.length ? Math.round(allScores[0].confidence * 100) : 0;
    const shownScores = topPct >= 100 ? allScores.slice(0, 1) : allScores.slice(0, Math.min(3, allScores.length));
    const breakdownRows = shownScores.map((s) => {
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
      ? `<div class="heuristic-note">${I18N.t("result_heuristic_note")}</div>`
      : "";

    // Disposal-guidance group — one iOS-style grouped card instead of loose
    // lines. Rows only render for classes that carry the new guidance
    // fields (PET..PC); MIXED / UNKNOWN fall back gracefully with the whole
    // group omitted. The "Find Nearby Recycling Centers" row is a reserved
    // placeholder — see findNearbyRecycling() below for the future hook.
    const guidanceRows = [
      info.recyclabilityLevel ? `
        <div class="result-group-row">
          <div class="row-text"><div class="row-value">${I18N.t("recyc_level_" + info.recyclabilityLevel)}</div></div>
        </div>` : "",
      info.wasteStreamKey ? `
        <div class="result-group-row">
          <div class="row-icon">🗑️</div>
          <div class="row-text">
            <div class="row-label">${I18N.t("result_put_in")}</div>
            <div class="row-value">${I18N.t(info.wasteStreamKey)}</div>
          </div>
        </div>` : "",
      info.bestActionKey ? `
        <div class="result-group-row">
          <div class="row-icon">♻️</div>
          <div class="row-text">
            <div class="row-label">${I18N.t("result_best_action")}</div>
            <div class="row-value">${I18N.t(info.bestActionKey)}</div>
          </div>
        </div>` : ""
    ].filter(Boolean).join("");
    const guidanceGroup = guidanceRows ? `<div class="result-group">${guidanceRows}</div>` : "";

    const appMessageBox = info.appMessage ? `<div class="app-message-box">${info.appMessage}</div>` : "";

    // Row that jumps into the real Nearby Recycling Centers locator,
    // pre-applying a "plastic" material-match hint so tagged centers sort
    // first (see findNearbyRecycling below / RecyclingLocator.open()).
    const recyclingLocatorRow = info.wasteStreamKey ? `
      <div class="result-group">
        <div class="result-group-row tappable" id="btn-find-recycling">
          <div class="row-icon">📍</div>
          <div class="row-text"><div class="row-value">${I18N.t("result_find_recycling")}</div></div>
          <svg class="row-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
      </div>` : "";

    const doNotNextRows = [
      info.doNot ? `
        <div class="result-group-row">
          <div class="row-icon">🚫</div>
          <div class="row-text">
            <div class="row-label">${I18N.t("result_do_not")}</div>
            <div class="row-value">${info.doNot}</div>
          </div>
        </div>` : "",
      info.whatHappensNext ? `
        <div class="result-group-row">
          <div class="row-icon">➡️</div>
          <div class="row-text">
            <div class="row-label">${I18N.t("result_what_happens_next")}</div>
            <div class="row-value">${info.whatHappensNext}</div>
          </div>
        </div>` : ""
    ].filter(Boolean).join("");
    const doNotNextGroup = doNotNextRows ? `<div class="result-group">${doNotNextRows}</div>` : "";

    const ewasteBox = info.eWasteNote
      ? `<div class="warning-box">⚠️ <strong>${I18N.t("result_ewaste_warning")}</strong><br>${info.eWasteNote}</div>`
      : "";

    $("#result-body").innerHTML = `
      <div class="result-image-wrap"><img src="${entry.image}" alt="${info.name}" /></div>

      <div class="result-header">
        <div>
          <div class="result-title">${info.name}</div>
          <div class="result-sub">${info.fullName}</div>
          ${recyclableBadge}
        </div>
      </div>

      ${guidanceGroup}
      ${appMessageBox}
      ${recyclingLocatorRow}

      ${sourceNote}

      <div class="info-grid">
        <div class="card info-tile">
          <div class="label">${I18N.t("result_plastic_number")}</div>
          <div class="value" style="color:${info.color}">♳ ${info.name} (${info.symbol})</div>
        </div>
        <div class="card info-tile">
          <div class="label">${I18N.t("result_category")}</div>
          <div class="value">${info.category}</div>
        </div>
      </div>

      ${breakdownRows ? `
      <div class="section-label">${I18N.t("result_confidence_breakdown")}</div>
      <div class="card" style="padding:16px;">
        ${breakdownRows}
      </div>
      ` : ""}

      <div class="section-label">${I18N.t("result_common_uses")}</div>
      <div class="card" style="padding:14px;">
        <div class="tag-list">${usesTags}</div>
      </div>

      <div class="section-label">${I18N.t("result_disposal")}</div>
      <div class="card" style="padding:16px;">
        <ul class="check-list">${disposalItems}</ul>
      </div>

      ${doNotNextGroup}
      ${ewasteBox}

      <div class="section-label">${I18N.t("result_environmental_facts")}</div>
      <div class="card fact-card" style="padding:16px;">
        <div class="info-tile" style="padding:0;margin-bottom:10px;">
          <div class="label">${I18N.t("result_avg_decomposition")}</div>
          <div class="value">${info.decomposition}</div>
        </div>
        <div style="font-size:14px;line-height:1.5;color:var(--text);">${info.fact}</div>
      </div>

      <div class="btn-row" style="margin-top:20px;">
        <button class="btn btn-secondary" id="btn-scan-again">${I18N.t("result_scan_again")}</button>
        <button class="btn btn-primary" id="btn-save-result">${I18N.t("result_save")}</button>
      </div>

      <div class="not-plastic-link" id="btn-not-plastic-link">${I18N.t("result_not_plastic_link")} →</div>
    `;

    $("#btn-scan-again").addEventListener("click", () => goToScreen("scan"));
    $("#btn-save-result").addEventListener("click", () => showSnackbar(I18N.t("result_saved")));
    $("#btn-not-plastic-link").addEventListener("click", openNotPlasticSheet);
    const findRecyclingBtn = $("#btn-find-recycling");
    if (findRecyclingBtn) findRecyclingBtn.addEventListener("click", () => findNearbyRecycling(info));

    if (opts.fresh && entry.confidence > 0.95) {
      launchConfetti();
    }
  }

  // ---------- Nearby recycling locator ----------
  // Opens the RecyclingLocator screen with a material hint so centers
  // tagged as accepting plastic sort ahead of non-matching ones nearby.
  function findNearbyRecycling(info) {
    goToScreen("recycling");
    RecyclingLocator.open({ materialHint: "plastic" });
  }

  $("#result-back").addEventListener("click", () => goToScreen("home"));
  $("#result-share").addEventListener("click", () => {
    if (navigator.share && state.lastCapture) {
      const info = PLASTIC_DB[state.lastCapture.classId];
      const status = info.recyclabilityLevel === "recyclable" ? I18N.t("result_share_recyclable")
        : info.recyclabilityLevel === "limited" ? I18N.t("result_share_limited")
        : I18N.t("result_share_not_recyclable");
      navigator.share({ title: "PlasticDetect AI", text: I18N.t("result_share_text", { example: info.name, status }) }).catch(() => {});
    } else {
      showSnackbar(I18N.t("result_share_unsupported"));
    }
  });

  // ---------- Recent scan (home) ----------
  function renderRecentScan() {
    const list = loadHistory();
    const slot = $("#recent-scan-slot");
    if (!list.length) {
      slot.innerHTML = `<div class="card" style="padding:16px;color:var(--text-muted);font-size:14px;">${I18N.t("home_no_scans")}</div>`;
      return;
    }
    const entry = list[0];
    const info = PLASTIC_DB[entry.classId];
    slot.innerHTML = `
      <div class="card card-row" id="recent-scan-card" style="cursor:pointer;">
        <img src="${entry.image}" class="history-thumb" alt="${info.name}" />
        <div class="history-info">
          <div class="history-title">${info.name}</div>
          <div class="history-meta">${Math.round(entry.confidence * 100)}% ${I18N.t("history_confidence_word")} · ${timeAgo(entry.timestamp)}</div>
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
    if (mins < 1) return I18N.t("time_just_now");
    if (mins < 60) return I18N.t("time_m_ago", { n: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return I18N.t("time_h_ago", { n: hrs });
    const days = Math.floor(hrs / 24);
    if (days < 7) return I18N.t("time_d_ago", { n: days });
    return new Date(ts).toLocaleDateString();
  }

  function renderHistory(filter = "") {
    const list = loadHistory().filter((e) => {
      if (!filter) return true;
      const info = PLASTIC_DB[e.classId];
      return info.name.toLowerCase().includes(filter.toLowerCase()) || info.fullName.toLowerCase().includes(filter.toLowerCase());
    });
    const container = $("#history-list");
    if (!list.length) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 5v5h5M12 7v5l4 2"/></svg>
          <div>${I18N.t("history_none_found")}</div>
        </div>`;
      return;
    }
    container.innerHTML = list.map((entry) => {
      const info = PLASTIC_DB[entry.classId];
      return `
        <div class="card history-item" data-id="${entry.id}">
          <img src="${entry.image}" class="history-thumb" alt="${info.name}" />
          <div class="history-info">
            <div class="history-title">${info.name}</div>
            <div class="history-meta">${Math.round(entry.confidence * 100)}% · ${timeAgo(entry.timestamp)}</div>
          </div>
          <button class="history-delete" data-delete="${entry.id}" aria-label="${I18N.t("history_delete_aria")}">
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
      showSnackbar(I18N.t("history_deleted"));
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
      <h3 style="margin:0 0 6px;">${I18N.t("settings_clear_confirm_title")}</h3>
      <p style="color:var(--text-muted);font-size:14px;margin:0 0 18px;">${I18N.t("settings_clear_confirm_body")}</p>
      <div class="btn-row">
        <button class="btn btn-secondary" id="cancel-clear">${I18N.t("common_cancel")}</button>
        <button class="btn btn-primary" id="confirm-clear" style="background:linear-gradient(135deg,#FF5252,#FF8A65)">${I18N.t("common_clear")}</button>
      </div>
    `);
    $("#confirm-clear").addEventListener("click", () => {
      saveHistory([]);
      closeSheet();
      renderHistory();
      renderRecentScan();
      showSnackbar(I18N.t("settings_history_cleared"));
    });
    $("#cancel-clear").addEventListener("click", closeSheet);
  });
  $("#row-about").addEventListener("click", () => openSheet(`
    <h3 style="margin:0 0 8px;">${I18N.t("about_title")}</h3>
    <p style="color:var(--text-muted);font-size:14px;line-height:1.5;">
      ${I18N.t("about_body")}
    </p>
  `));
  $("#row-privacy").addEventListener("click", () => openSheet(`
    <h3 style="margin:0 0 8px;">${I18N.t("privacy_title")}</h3>
    <p style="color:var(--text-muted);font-size:14px;line-height:1.5;">
      ${I18N.t("privacy_body")}
    </p>
  `));

  // ---------- Language picker ----------
  $("#row-language").addEventListener("click", () => {
    const current = I18N.getLang();
    const rows = I18N.LANGS.map((l) => `
      <div class="card-row lang-row" data-lang="${l.code}" style="padding:12px 4px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-weight:700;font-size:14px;">${l.native}${l.code !== "en" ? ` <span style="color:var(--text-muted);font-weight:500;">— ${l.label}</span>` : ""}</div>
          ${l.beta ? `<div style="font-size:11.5px;color:var(--text-muted);">Beta — partial translation</div>` : ""}
        </div>
        ${l.code === current ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.5"><path d="M20 6 9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ""}
      </div>
    `).join("");
    openSheet(`<h3 style="margin:0 0 10px;">${I18N.t("language_sheet_title")}</h3>${rows}`);
    $$(".lang-row").forEach((row) => row.addEventListener("click", () => {
      I18N.setLang(row.dataset.lang);
      closeSheet();
      applyTranslations();
      setEcoTip();
      renderRecentScan();
      renderHistory($("#history-search").value);
      if (state.lastCapture) renderResult(state.lastCapture);
    }));
  });

  // ---------- Guide sheet ----------
  // Renders the true "chasing arrows" resin-identification-code symbol (a
  // triangle of three rounded arrows) with the resin number — or "?" for
  // Unknown — set inside it, colored to match the plastic's accent color.
  function resinCodeIcon(symbolText, color) {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5"/>
        <path d="M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12"/>
        <path d="m14 16-3 3 3 3"/>
        <path d="M8.293 13.596 7.196 9.5 3.1 10.598"/>
        <path d="m9.344 5.811 1.093-1.892A1.83 1.83 0 0 1 11.985 3a1.784 1.784 0 0 1 1.546.888l3.943 6.843"/>
        <path d="m13.378 9.633 4.096 1.098 1.097-4.096"/>
        <text x="12" y="14.6" font-size="6.4" font-weight="800" text-anchor="middle" fill="${color}" stroke="none" font-family="inherit">${symbolText}</text>
      </svg>
    `;
  }

  $("#open-guide").addEventListener("click", () => {
    let sevenFamilyOpened = false;
    const rows = PLASTIC_ORDER.map((id) => {
      const info = PLASTIC_DB[id];
      const recyclabilityLabel = info.recyclabilityLevel === "recyclable" ? I18N.t("guide_recyclable_wide")
        : info.recyclabilityLevel === "limited" ? I18N.t("guide_recyclable_limited")
        : info.recyclabilityLevel === "difficult" ? I18N.t("guide_recyclable_rare")
        : I18N.t("guide_recyclable_varies");

      // ABS / PLA / PC are all resin code #7 — group them under one shared
      // family header + accent color so they read as one family rather than
      // three unrelated entries that happen to share a digit.
      let familyHeader = "";
      if (info.resinFamily === "7" && !sevenFamilyOpened) {
        sevenFamilyOpened = true;
        familyHeader = `<div class="resin-family-label" style="color:${info.color};">Resin Code 7 — Other (Engineering &amp; Bioplastics)</div>`;
      }

      return `
        ${familyHeader}
        <div class="card-row" style="padding:10px 0;border-bottom:1px solid var(--border);">
          <div class="resin-chip">${resinCodeIcon(info.symbol, info.color)}</div>
          <div>
            <div style="font-weight:700;font-size:14px;">${info.name} <span style="color:var(--text-muted);font-weight:500;">— ${info.fullName}</span></div>
            <div style="font-size:12.5px;color:var(--text-muted);">${recyclabilityLabel}</div>
          </div>
        </div>
      `;
    }).join("");

    openSheet(`
      <h3 style="margin:0 0 10px;">${I18N.t("guide_title")}</h3>
      <p class="guide-intro">${I18N.t("guide_intro")}</p>
      <img class="guide-example-img" src="img/resin-code-example.png" alt="${I18N.t("guide_example_alt")}" />
      <div class="guide-example-caption">${I18N.t("guide_example_caption")}</div>
      ${rows}
    `);
  });

  // ---------- Not Plastic? sheet ----------
  // Static reference content — the AI model only classifies plastics, so
  // this is not tied to any classifier output. Reachable from the home
  // screen tab and from the link at the bottom of every result screen.
  function openNotPlasticSheet() {
    const rows = NON_PLASTIC_ORDER.map((id) => {
      const info = NON_PLASTIC_DB[id];
      return `
        <div class="card" style="padding:14px;margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span class="badge badge-no" style="font-size:10.5px;padding:3px 10px;">${I18N.t("non_plastic_tag")}</span>
            <span style="font-weight:700;font-size:14px;">${info.name}</span>
          </div>
          <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;">${I18N.t("recyc_level_" + info.recyclabilityLevel)} · ${I18N.t(info.wasteStreamKey)}</div>
          <div style="font-size:13px;color:var(--text);line-height:1.45;">${info.note}</div>
        </div>
      `;
    }).join("");
    openSheet(`
      <h3 style="margin:0 0 8px;">${I18N.t("not_plastic_sheet_title")}</h3>
      <p class="guide-intro">${I18N.t("not_plastic_sheet_intro")}</p>
      ${rows}
    `);
  }
  $("#open-not-plastic").addEventListener("click", openNotPlasticSheet);

  // ---------- Nearby recycling locator (home entry point) ----------
  $("#open-recycling-locator").addEventListener("click", () => {
    goToScreen("recycling");
    RecyclingLocator.open();
  });
  // recyclingLocator.js owns its screen's DOM but not screen navigation —
  // it dispatches this event on back-button tap and app.js (the owner of
  // goToScreen) handles it, keeping the two modules decoupled.
  document.addEventListener("plasticdetect:recycling-back", () => goToScreen("home"));

  // ---------- Eco tip ----------
  // Named (not auto-invoked) so it can run *after* applyTranslations() in
  // Init below — otherwise the data-i18n placeholder sweep would stomp the
  // real tip text with the "Loading tip…" placeholder.
  function setEcoTip() {
    const dayIndex = Math.floor(Date.now() / 86400000) % ECO_TIPS.length;
    $("#eco-tip-text").textContent = ECO_TIPS[dayIndex];
  }

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
      text.textContent = I18N.t("model_status_loading");
      banner.classList.remove("hidden");
    } else if (status === "ready") {
      text.textContent = I18N.t("model_status_ready");
      banner.classList.add("status-ready");
      banner.classList.remove("hidden");
      updateModelStatusBanner._hideTimer = setTimeout(() => banner.classList.add("hidden"), 1600);
    } else if (status === "error") {
      text.textContent = I18N.t("model_status_error");
      banner.classList.add("status-error");
      banner.classList.remove("hidden");
      // stays visible for the session so the user knows results are estimated
    }
  }
  window.addEventListener("plasticdetect:model-status", (e) => updateModelStatusBanner(e.detail.status));

  // ---------- Init ----------
  applyTranslations();
  setEcoTip();
  renderRecentScan();
  renderHistory();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    });
  }
})();
