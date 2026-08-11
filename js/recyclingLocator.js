// PlasticDetect AI — Nearby Recycling Centers locator
//
// Self-contained module: owns the #screen-recycling DOM, the Leaflet map,
// geolocation, manual address search (Nominatim), and the Overpass API
// fetch/cache. Public surface is a single entry point:
//   RecyclingLocator.open({ materialHint } = {})
// app.js calls this from the home-screen tab (no hint) and from the
// classification result screen's "Find Nearby Recycling Centers" row
// (materialHint: "plastic" so matching centers sort first).
//
// No dependency on data.js / PLASTIC_DB — this module only needs a coords
// pair and an optional material hint string, so it stays reusable and
// doesn't couple the classifier's data model to a mapping feature.

const RecyclingLocator = (() => {
  const STORAGE_LAST_LOC = "plasticdetect.lastLocation";
  const CACHE_PREFIX = "plasticdetect.recyclingCache.";
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
  const DEFAULT_RADIUS_KM = 5;
  const RADIUS_OPTIONS_KM = [5, 10, 15];

  // Ordered — first failure/timeout falls through to the next mirror.
  const OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter"
  ];
  const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
  const FETCH_TIMEOUT_MS = 12000;

  let map = null;
  let userMarker = null;
  let centerMarkers = []; // [{ marker, id }]
  let currentCenters = [];
  let currentCoords = null;
  let currentRadiusKm = DEFAULT_RADIUS_KM;
  let currentMaterialHint = null;
  let selectedCenterId = null;
  let initialized = false;

  function $(sel) { return document.querySelector(sel); }
  function t(key, vars) { return (typeof I18N !== "undefined") ? I18N.t(key, vars) : key; }

  // ---------------------------------------------------------------------
  // Geometry
  // ---------------------------------------------------------------------
  function distanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ---------------------------------------------------------------------
  // Location caching (so the screen shows something useful even offline
  // or when permission is later denied)
  // ---------------------------------------------------------------------
  function saveLastLocation(coords) {
    try {
      localStorage.setItem(STORAGE_LAST_LOC, JSON.stringify({ ...coords, timestamp: Date.now() }));
    } catch { /* storage full/unavailable — non-fatal */ }
  }
  function loadLastLocation() {
    try {
      const raw = localStorage.getItem(STORAGE_LAST_LOC);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  // ---------------------------------------------------------------------
  // Overpass result caching — keyed by rounded coords + radius, 24h TTL
  // ---------------------------------------------------------------------
  function cacheKey(lat, lng, radiusKm) {
    return `${CACHE_PREFIX}${lat.toFixed(2)}_${lng.toFixed(2)}_${radiusKm}`;
  }
  function loadCenterCache(lat, lng, radiusKm) {
    try {
      const raw = localStorage.getItem(cacheKey(lat, lng, radiusKm));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.timestamp > CACHE_TTL_MS) return null;
      return parsed.centers;
    } catch { return null; }
  }
  function saveCenterCache(lat, lng, radiusKm, centers) {
    try {
      localStorage.setItem(cacheKey(lat, lng, radiusKm), JSON.stringify({ timestamp: Date.now(), centers }));
    } catch { /* storage full/unavailable — non-fatal */ }
  }

  // ---------------------------------------------------------------------
  // Geolocation
  // ---------------------------------------------------------------------
  function detectLocation() {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) {
        reject({ code: "unsupported" });
        return;
      }
      setStatus("requesting");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          saveLastLocation(coords);
          resolve(coords);
        },
        (err) => {
          // err.code: 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
          reject({ code: err.code === 1 ? "denied" : "unavailable", raw: err });
        },
        { enableHighAccuracy: true, timeout: FETCH_TIMEOUT_MS, maximumAge: 60000 }
      );
    });
  }

  function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
  }

  // ---------------------------------------------------------------------
  // Manual address search (Nominatim) — always reachable, not just on
  // geolocation failure, since indoor/unfamiliar-network geolocation is
  // unreliable.
  // ---------------------------------------------------------------------
  async function geocodeAddress(query) {
    const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetchWithTimeout(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("geocode_failed");
    const data = await res.json();
    if (!data.length) throw new Error("no_results");
    const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    saveLastLocation(coords);
    return coords;
  }

  // ---------------------------------------------------------------------
  // Overpass fetch, mirror fallback, cache
  // ---------------------------------------------------------------------
  function buildOverpassQuery(lat, lng, radiusKm) {
    const radiusM = Math.round(radiusKm * 1000);
    return `[out:json][timeout:25];(node["amenity"="recycling"](around:${radiusM},${lat},${lng});way["amenity"="recycling"](around:${radiusM},${lat},${lng}););out center tags;`;
  }

  function parseOverpassResponse(data) {
    return (data.elements || [])
      .map((el) => {
        const tags = el.tags || {};
        const lat = el.lat ?? (el.center && el.center.lat);
        const lng = el.lon ?? (el.center && el.center.lon);
        if (lat == null || lng == null) return null;
        const recyclingType =
          tags.recycling_type === "centre" ? "centre" : tags.recycling_type === "container" ? "container" : "unspecified";
        return {
          id: `${el.type}/${el.id}`,
          name: tags.name || null, // resolved to "Recycling Point" at render time via i18n
          lat,
          lng,
          recyclingType,
          materials: {
            plastic: tags["recycling:plastic"] === "yes",
            plasticPackaging: tags["recycling:plastic_packaging"] === "yes"
          }
        };
      })
      .filter(Boolean);
  }

  async function fetchCenters(lat, lng, radiusKm, { forceRefresh = false } = {}) {
    if (!forceRefresh) {
      const cached = loadCenterCache(lat, lng, radiusKm);
      if (cached) return { centers: cached, fromCache: true };
    }

    const query = buildOverpassQuery(lat, lng, radiusKm);
    let lastErr = null;
    for (const endpoint of OVERPASS_MIRRORS) {
      try {
        const res = await fetchWithTimeout(endpoint, {
          method: "POST",
          body: "data=" + encodeURIComponent(query),
          headers: { "Content-Type": "application/x-www-form-urlencoded" }
        });
        if (!res.ok) throw new Error("http_" + res.status);
        const data = await res.json();
        const centers = parseOverpassResponse(data);
        saveCenterCache(lat, lng, radiusKm, centers);
        return { centers, fromCache: false };
      } catch (err) {
        lastErr = err;
        // try next mirror
      }
    }
    // All mirrors failed — fall back to stale cache if we have any, rather
    // than a hard failure.
    const stale = loadCenterCache(lat, lng, radiusKm) || loadStaleIgnoringTTL(lat, lng, radiusKm);
    if (stale) return { centers: stale, fromCache: true, stale: true };
    throw lastErr || new Error("all_mirrors_failed");
  }

  function loadStaleIgnoringTTL(lat, lng, radiusKm) {
    try {
      const raw = localStorage.getItem(cacheKey(lat, lng, radiusKm));
      return raw ? JSON.parse(raw).centers : null;
    } catch { return null; }
  }

  // ---------------------------------------------------------------------
  // Sorting: nearest first; when a materialHint is active and at least one
  // center carries material tags, matching centers sort ahead of others
  // within the same ~1km distance tier. Degrades silently (plain
  // nearest-first) when no centers have material tags at all.
  // ---------------------------------------------------------------------
  function sortCenters(centers, userCoords, materialHint) {
    const withDistance = centers.map((c) => ({
      ...c,
      distance: distanceKm(userCoords.lat, userCoords.lng, c.lat, c.lng)
    }));
    const anyMaterialTagged = withDistance.some((c) => c.materials.plastic || c.materials.plasticPackaging);
    withDistance.sort((a, b) => {
      if (materialHint && anyMaterialTagged) {
        const aMatch = a.materials.plastic || a.materials.plasticPackaging;
        const bMatch = b.materials.plastic || b.materials.plasticPackaging;
        const aTier = Math.floor(a.distance);
        const bTier = Math.floor(b.distance);
        if (aTier === bTier && aMatch !== bMatch) return aMatch ? -1 : 1;
      }
      return a.distance - b.distance;
    });
    return withDistance;
  }

  // ---------------------------------------------------------------------
  // UI: status banner
  // ---------------------------------------------------------------------
  function setStatus(state, extra) {
    const banner = $("#recycling-status-banner");
    const text = $("#recycling-status-text");
    if (!banner || !text) return;
    banner.className = "recycling-status-banner status-" + state;
    const map2 = {
      idle: "recycling_status_idle",
      requesting: "recycling_status_requesting",
      granted: "recycling_status_granted",
      denied: "recycling_status_denied",
      unavailable: "recycling_status_unavailable",
      unsupported: "recycling_status_unsupported",
      loading_centers: "recycling_status_loading",
      error: "recycling_status_error",
      empty: "recycling_status_empty"
    };
    text.textContent = t(map2[state] || "recycling_status_idle", extra);
  }

  // ---------------------------------------------------------------------
  // UI: list rendering
  // ---------------------------------------------------------------------
  function renderSkeleton() {
    const list = $("#recycling-list");
    if (!list) return;
    list.innerHTML = Array.from({ length: 3 }).map(() => `
      <div class="card recycling-card">
        <div class="skeleton skeleton-line" style="width:60%;"></div>
        <div class="skeleton skeleton-line" style="width:40%;"></div>
      </div>
    `).join("");
  }

  function directionsUrl(center) {
    // geo: URI for native map apps, with a Google Maps web fallback baked
    // into the same anchor via a second link isn't possible in one <a>, so
    // we use the universal Google Maps search URL — it opens the native
    // app on mobile when installed, and the web app otherwise.
    return `https://www.google.com/maps/dir/?api=1&destination=${center.lat},${center.lng}`;
  }

  function renderList(sorted) {
    const list = $("#recycling-list");
    if (!list) return;
    if (!sorted.length) {
      list.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21c-4-4-7-7.5-7-11a7 7 0 0 1 14 0c0 3.5-3 7-7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>
          <div>${t("recycling_no_results")}</div>
        </div>`;
      return;
    }
    list.innerHTML = sorted.map((c, i) => {
      const isNearest = i === 0;
      const name = c.name || t("recycling_unnamed_point");
      const typeLabel = c.recyclingType === "centre" ? t("recycling_type_centre")
        : c.recyclingType === "container" ? t("recycling_type_container")
        : t("recycling_type_unspecified");
      const matchesMaterial = currentMaterialHint && (c.materials.plastic || c.materials.plasticPackaging);
      return `
        <div class="card recycling-card ${isNearest ? "recycling-card-nearest" : ""}" data-center-id="${c.id}">
          <div class="recycling-card-top">
            <div>
              <div class="recycling-card-name">${name}</div>
              <div class="recycling-card-meta">
                <span class="recycling-type-chip recycling-type-${c.recyclingType}">${typeLabel}</span>
                ${isNearest ? `<span class="recycling-type-chip recycling-nearest-chip">${t("recycling_nearest_badge")}</span>` : ""}
                ${matchesMaterial ? `<span class="recycling-type-chip recycling-material-chip">${t("recycling_accepts_material")}</span>` : ""}
              </div>
            </div>
            <div class="recycling-card-distance">${c.distance.toFixed(1)} km</div>
          </div>
          <a class="recycling-directions-link" href="${directionsUrl(c)}" target="_blank" rel="noopener">
            ${t("recycling_get_directions")} →
          </a>
        </div>
      `;
    }).join("");

    list.querySelectorAll(".recycling-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest(".recycling-directions-link")) return;
        selectCenter(card.dataset.centerId, true);
      });
    });
  }

  // ---------------------------------------------------------------------
  // UI: Leaflet map
  // ---------------------------------------------------------------------
  function ensureMap() {
    if (map || typeof L === "undefined") return;
    map = L.map("recycling-map", { zoomControl: true, attributionControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);
  }

  function userIcon() {
    return L.divIcon({
      className: "recycling-user-marker",
      html: '<div class="recycling-user-dot"></div>',
      iconSize: [18, 18]
    });
  }
  function centerIcon(isNearest, recyclingType) {
    const cls = "recycling-pin" + (isNearest ? " recycling-pin-nearest" : "") + (recyclingType === "container" ? " recycling-pin-container" : "");
    return L.divIcon({ className: cls, html: "", iconSize: isNearest ? [22, 22] : [16, 16] });
  }

  function renderMap(sorted, userCoords) {
    if (typeof L === "undefined") return; // Leaflet failed to load (offline, first visit) — list still works
    ensureMap();
    if (!map) return;

    centerMarkers.forEach((m) => map.removeLayer(m.marker));
    centerMarkers = [];
    if (userMarker) map.removeLayer(userMarker);

    userMarker = L.marker([userCoords.lat, userCoords.lng], { icon: userIcon() }).addTo(map);

    const bounds = [[userCoords.lat, userCoords.lng]];
    sorted.forEach((c, i) => {
      const marker = L.marker([c.lat, c.lng], { icon: centerIcon(i === 0, c.recyclingType) }).addTo(map);
      marker.on("click", () => selectCenter(c.id, false));
      centerMarkers.push({ marker, id: c.id });
      bounds.push([c.lat, c.lng]);
    });

    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
  }

  function selectCenter(id, scrollList) {
    selectedCenterId = id;
    document.querySelectorAll(".recycling-card").forEach((el) => {
      el.classList.toggle("recycling-card-selected", el.dataset.centerId === id);
    });
    const match = centerMarkers.find((m) => m.id === id);
    if (match && map) {
      map.panTo(match.marker.getLatLng());
      match.marker.openPopup?.();
    }
    if (scrollList) {
      const cardEl = document.querySelector(`.recycling-card[data-center-id="${id}"]`);
      if (cardEl) cardEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  // ---------------------------------------------------------------------
  // Orchestration
  // ---------------------------------------------------------------------
  async function loadAndRender(coords, radiusKm, { forceRefresh = false } = {}) {
    currentCoords = coords;
    currentRadiusKm = radiusKm;
    setStatus("loading_centers");
    renderSkeleton();
    try {
      const { centers } = await fetchCenters(coords.lat, coords.lng, radiusKm, { forceRefresh });
      currentCenters = centers;
      const sorted = sortCenters(centers, coords, currentMaterialHint);
      if (!sorted.length) {
        setStatus("empty");
      } else {
        setStatus("granted");
      }
      renderList(sorted);
      renderMap(sorted, coords);
    } catch (err) {
      setStatus("error");
      renderList([]);
    }
  }

  async function useDeviceLocation(forceRefresh) {
    try {
      const coords = await detectLocation();
      await loadAndRender(coords, currentRadiusKm, { forceRefresh });
    } catch (err) {
      const code = err && err.code;
      if (code === "denied") setStatus("denied");
      else if (code === "unsupported") setStatus("unsupported");
      else setStatus("unavailable");
      // Fall back to the last known cached location, if any, so the
      // screen still shows something useful.
      const last = loadLastLocation();
      if (last) {
        await loadAndRender({ lat: last.lat, lng: last.lng }, currentRadiusKm, {});
      }
    }
  }

  function wireControls() {
    const backBtn = $("#recycling-back");
    if (backBtn) backBtn.addEventListener("click", () => {
      document.dispatchEvent(new CustomEvent("plasticdetect:recycling-back"));
    });

    const refreshBtn = $("#recycling-refresh");
    if (refreshBtn) refreshBtn.addEventListener("click", () => useDeviceLocation(true));

    const useLocationBtn = $("#recycling-use-location");
    if (useLocationBtn) useLocationBtn.addEventListener("click", () => useDeviceLocation(false));

    const radiusSelect = $("#recycling-radius-select");
    if (radiusSelect) {
      radiusSelect.innerHTML = RADIUS_OPTIONS_KM.map((km) => `<option value="${km}">${km} km</option>`).join("");
      radiusSelect.value = String(currentRadiusKm);
      radiusSelect.addEventListener("change", () => {
        const km = Number(radiusSelect.value);
        if (currentCoords) loadAndRender(currentCoords, km, {});
        else currentRadiusKm = km;
      });
    }

    const searchBtn = $("#recycling-search-btn");
    const addressInput = $("#recycling-address-input");
    const runSearch = async () => {
      const query = addressInput ? addressInput.value.trim() : "";
      if (!query) return;
      setStatus("requesting");
      try {
        const coords = await geocodeAddress(query);
        await loadAndRender(coords, currentRadiusKm, {});
      } catch {
        setStatus("error");
      }
    };
    if (searchBtn) searchBtn.addEventListener("click", runSearch);
    if (addressInput) addressInput.addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch(); });
  }

  // ---------------------------------------------------------------------
  // Public entry point
  // ---------------------------------------------------------------------
  function open(opts = {}) {
    currentMaterialHint = opts.materialHint || null;
    currentRadiusKm = DEFAULT_RADIUS_KM;

    if (!initialized) {
      wireControls();
      initialized = true;
    }
    const radiusSelect = $("#recycling-radius-select");
    if (radiusSelect) radiusSelect.value = String(currentRadiusKm);

    // Screen switch is owned by app.js (goToScreen) — this module only
    // owns what happens once the screen is visible. app.js calls
    // RecyclingLocator.open() right after goToScreen("recycling").
    setStatus("idle");
    renderSkeleton();

    const last = loadLastLocation();
    if (last) {
      // Show cached location immediately (works offline / while the fresh
      // GPS fix is still pending) and refine with a live fix in the
      // background.
      loadAndRender({ lat: last.lat, lng: last.lng }, currentRadiusKm, {});
      detectLocation()
        .then((coords) => loadAndRender(coords, currentRadiusKm, {}))
        .catch(() => { /* keep showing the cached-location results */ });
    } else {
      useDeviceLocation(false);
    }
  }

  return { open };
})();
