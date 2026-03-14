import { requireAuth } from "./sessionGuard.js";
import { supabase } from "./supabaseClient.js";

// ─── Card pools per categoria ─────────────────────────────────────────────────
const CARD_POOLS = {
  jtbd: [
    "/cards/jobs/community.webp",
    "/cards/jobs/discovery.webp",
    "/cards/jobs/filtering.webp",
    "/cards/jobs/interactive.webp",
    "/cards/jobs/zapping.webp",
  ],
  agency: [
    "/cards/jobs/community.webp",
    "/cards/jobs/discovery.webp",
    "/cards/jobs/filtering.webp",
    "/cards/jobs/interactive.webp",
    "/cards/jobs/zapping.webp",
  ],
  behavior: [
    "/cards/jobs/community.webp",
    "/cards/jobs/discovery.webp",
    "/cards/jobs/filtering.webp",
    "/cards/jobs/interactive.webp",
    "/cards/jobs/zapping.webp",
  ],
  sensor: [
    "/cards/jobs/community.webp",
    "/cards/jobs/discovery.webp",
    "/cards/jobs/filtering.webp",
    "/cards/jobs/interactive.webp",
    "/cards/jobs/zapping.webp",
  ],
  actuator: [
    "/cards/jobs/community.webp",
    "/cards/jobs/discovery.webp",
    "/cards/jobs/filtering.webp",
    "/cards/jobs/interactive.webp",
    "/cards/jobs/zapping.webp",
  ],
  brand: [
    "/cards/jobs/community.webp",
    "/cards/jobs/discovery.webp",
    "/cards/jobs/filtering.webp",
    "/cards/jobs/interactive.webp",
    "/cards/jobs/zapping.webp",
  ],
};

const PACKETS = {
  jtbd: "/assets/packets/jtbd.webp",
  agency: "/assets/packets/agency.webp",
  behavior: "/assets/packets/behavior.webp",
  sensor: "/assets/packets/sensors.webp",
  actuator: "/assets/packets/actuators.webp",
  brand: "/assets/packets/brands.webp",
};

const INITIALLY_BLOCKED = new Set(["behavior", "sensor", "actuator", "brand"]);

const unlockedCardSrc = {};
const cardStates = {};

// ─── UI State machine ─────────────────────────────────────────────────────────
// idle | pack-open | opening | card-visible | card-viewing
let uiState = "idle";
let activeItem = null; // item griglia con pack aperto
let activeCardId = null; // cardId corrente nell'overlay
let sunraysTimeout = null;
let ctaTimeout = null;

let groupId = null;

// ─── DOM ──────────────────────────────────────────────────────────────────────
const overlay = document.createElement("div");
overlay.className = "packet-overlay";

const ctaText = document.createElement("p");
ctaText.className = "packet-cta text-logo-header";
ctaText.innerText = "Click on packet to open it!";

const sunrays = document.createElement("div");
sunrays.className = "sunrays";

const cardStage = document.createElement("div");
cardStage.className = "card-stage";

const enlarged = document.createElement("div");
enlarged.className = "packet-enlarged";

overlay.appendChild(ctaText);
overlay.appendChild(sunrays);
overlay.appendChild(cardStage);
overlay.appendChild(enlarged);
document.body.appendChild(overlay);

// ─── Click: pack ingrandito → apri ───────────────────────────────────────────
enlarged.addEventListener("click", (e) => {
  e.stopPropagation();
  if (uiState === "pack-open") startOpeningAnimation();
});

// ─── Click: card stage → centra ──────────────────────────────────────────────
cardStage.addEventListener("click", (e) => {
  e.stopPropagation();
  if (uiState === "card-visible" || uiState === "card-viewing") {
    cardStage.classList.add("is-centered");
  }
});

// ─── Click: overlay (fuori) → chiudi ─────────────────────────────────────────
overlay.addEventListener("click", (e) => {
  if (uiState === "opening") return;
  if (enlarged.contains(e.target)) return;
  if (cardStage.contains(e.target)) return;
  closeAll();
});

// ─── Init ─────────────────────────────────────────────────────────────────────
async function initDashboard() {
  const student = await requireAuth();
  if (!student) return;

  document.getElementById("userName").innerText = student.name ?? "Stranger";

  if (student.group_id) {
    groupId = student.group_id;
    const { data: group } = await supabase
      .from("groups")
      .select("group_number")
      .eq("id", groupId)
      .maybeSingle();
    document.getElementById("groupName").innerText = group?.group_number ?? "—";
    await loadCardStates();
  } else {
    for (const id of Object.keys(PACKETS)) {
      cardStates[id] = INITIALLY_BLOCKED.has(id) ? "blocked" : "locked";
    }
  }

  renderAllCards();
  attachItemListeners();
}

// ─── Carica stati dal DB ──────────────────────────────────────────────────────
async function loadCardStates() {
  const { data } = await supabase
    .from("group_cards")
    .select("unlocked")
    .eq("group_id", groupId)
    .maybeSingle();

  const unlockedInDB = data?.unlocked || {};
  for (const id of Object.keys(PACKETS)) {
    if (INITIALLY_BLOCKED.has(id)) {
      cardStates[id] = "blocked";
    } else if (unlockedInDB[id]) {
      cardStates[id] = "unlocked";
      if (!unlockedCardSrc[id]) unlockedCardSrc[id] = pickCard(id);
    } else {
      cardStates[id] = "locked";
    }
  }
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderAllCards() {
  for (const id of Object.keys(PACKETS)) renderCardState(id);
}

function renderCardState(id, withEntryAnimation = false) {
  const el = document.getElementById(id);
  if (!el) return;

  const state = cardStates[id] ?? "locked";
  el.classList.remove(
    "state-blocked",
    "state-locked",
    "state-unlocked",
    "is-active",
    "card-entering",
  );
  el.classList.add(`state-${state}`);
  el.innerHTML = "";

  if (state === "unlocked") {
    const src = unlockedCardSrc[id];
    if (src) {
      el.appendChild(buildHoverTilt(src, id));
      if (withEntryAnimation) {
        el.getBoundingClientRect();
        el.classList.add("card-entering");
        el.addEventListener(
          "animationend",
          () => el.classList.remove("card-entering"),
          { once: true },
        );
      }
    }
  } else {
    const img = document.createElement("img");
    img.src = PACKETS[id];
    img.alt = id;
    el.appendChild(img);
  }
}

function buildHoverTilt(src, alt = "card") {
  const tilt = document.createElement("hover-tilt");
  tilt.setAttribute("glare-intensity", "2.5");
  tilt.setAttribute("scale-factor", "1.02");
  tilt.setAttribute("shadow", "");
  tilt.setAttribute("glare-hue", "210");
  tilt.setAttribute("tilt-factor", "1.5");
  const img = document.createElement("img");
  img.src = src;
  img.alt = alt;
  tilt.appendChild(img);
  return tilt;
}

// ─── Listener click sulla griglia ────────────────────────────────────────────
function attachItemListeners() {
  for (const id of Object.keys(PACKETS)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener("click", () => {
      // Blocca qualsiasi interazione se l'overlay è occupato
      if (uiState !== "idle") return;

      const state = cardStates[id];
      if (state === "locked") {
        openPacket(el);
      } else if (state === "unlocked") {
        openUnlockedCard(id);
      }
    });
  }
}

// ─── Apri pack ingrandito ─────────────────────────────────────────────────────
function openPacket(item) {
  uiState = "pack-open";
  activeItem = item;
  activeCardId = item.id;
  item.classList.add("is-active");

  enlarged.innerHTML = "";
  enlarged.classList.remove("is-dismissed");
  enlarged.dataset.cardId = item.id;
  enlarged.innerHTML = `
    <div class="pack-wrapper">
      <div class="pack-top">
        <img src="${PACKETS[item.id]}" alt="${item.id}">
        <div class="cut-line-top"></div>
      </div>
      <div class="pack-body">
        <img src="${PACKETS[item.id]}" alt="${item.id}">
        <div class="cut-line-bottom"></div>
      </div>
    </div>
  `;

  overlay.classList.remove("is-closing");
  overlay.getBoundingClientRect();
  overlay.classList.add("is-open");

  activateSunrays();

  ctaTimeout = setTimeout(() => {
    const rect = enlarged.getBoundingClientRect();
    ctaText.style.top = Math.max(16, rect.top - 48) + "px";
    ctaText.classList.add("is-visible");
  }, 1200);
}

// ─── Apri carta già sbloccata ─────────────────────────────────────────────────
function openUnlockedCard(id) {
  const src = unlockedCardSrc[id];
  if (!src) return;

  uiState = "card-viewing";
  activeCardId = id;

  // Enlarged vuoto e fuori schermo
  enlarged.innerHTML = "";
  enlarged.classList.add("is-dismissed");

  overlay.classList.remove("is-closing");
  overlay.getBoundingClientRect();
  overlay.classList.add("is-open");

  showCard(src);

  // Due rAF per assicurarsi che is-visible sia applicato prima di is-centered
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      cardStage.classList.add("is-centered");
    }),
  );
}

// ─── Animazione apertura pack ─────────────────────────────────────────────────
async function startOpeningAnimation() {
  uiState = "opening";

  clearTimeout(ctaTimeout);
  ctaText.classList.remove("is-visible");

  const cardId = activeCardId;
  const cardSrc = pickCard(cardId);
  unlockedCardSrc[cardId] = cardSrc;

  // 1. Split
  enlarged.getBoundingClientRect();
  enlarged.classList.add("is-opening");

  // 2. Carta sale da sotto
  setTimeout(() => showCard(cardSrc), 300);

  // 3. Attendi fine split
  await new Promise((r) => setTimeout(r, 950));

  // 4. Pack dismissed
  enlarged.classList.add("is-dismissed");
  enlarged.classList.remove("is-opening");

  // 5. Sunrays timer da adesso
  clearTimeout(sunraysTimeout);
  sunraysTimeout = setTimeout(() => {
    sunrays.classList.remove("is-active");
    sunrays.classList.add("is-fading");
  }, 6000);

  // 6. DB + stato locale
  await unlockCard(cardId);
  cardStates[cardId] = "unlocked";

  // 7. Ripristina item griglia (solo visivamente: la card unlocked verrà
  //    renderizzata dopo closeAll, per ora torna allo stato neutro)
  if (activeItem) {
    activeItem.classList.remove("is-active");
    activeItem = null;
  }

  // 8. Ora la carta è visibile, aspetta il click dell'utente per chiudere
  uiState = "card-visible";
}

// ─── Mostra carta nel card stage ─────────────────────────────────────────────
function showCard(src) {
  cardStage.innerHTML = "";
  cardStage.classList.remove("is-centered", "is-closing");
  cardStage.appendChild(buildHoverTilt(src, "card"));
  cardStage.getBoundingClientRect();
  cardStage.classList.add("is-visible");
}

// ─── Sunrays ──────────────────────────────────────────────────────────────────
function activateSunrays() {
  clearTimeout(sunraysTimeout);
  sunrays.classList.remove("is-fading");
  sunrays.getBoundingClientRect();
  sunrays.classList.add("is-active");
}

function deactivateSunrays() {
  clearTimeout(sunraysTimeout);
  sunrays.classList.remove("is-active");
  sunrays.classList.add("is-fading");
}

// ─── Chiudi tutto ─────────────────────────────────────────────────────────────
function closeAll() {
  if (uiState === "opening") return;

  clearTimeout(ctaTimeout);
  ctaText.classList.remove("is-visible");
  deactivateSunrays();

  // Cattura l'id da rendere PRIMA di resettare lo stato
  const cardToRender = uiState === "card-visible" ? activeCardId : null;

  uiState = "idle";
  activeCardId = null;
  if (activeItem) {
    activeItem.classList.remove("is-active");
    activeItem = null;
  }

  // Chiudi card stage
  cardStage.classList.remove("is-visible", "is-centered");
  if (cardStage.innerHTML !== "") {
    cardStage.classList.add("is-closing");
    const onCardEnd = () => {
      cardStage.classList.remove("is-closing");
      cardStage.innerHTML = "";
      cardStage.removeEventListener("transitionend", onCardEnd);
      if (cardToRender) renderCardState(cardToRender, true);
    };
    cardStage.addEventListener("transitionend", onCardEnd);
  } else {
    if (cardToRender) renderCardState(cardToRender, true);
  }

  // Chiudi overlay
  overlay.classList.remove("is-open");
  overlay.classList.add("is-closing");
  const onOverlayEnd = () => {
    overlay.classList.remove("is-closing");
    enlarged.classList.remove("is-opening", "is-dismissed");
    enlarged.innerHTML = "";
    sunrays.classList.remove("is-fading");
    overlay.removeEventListener("transitionend", onOverlayEnd);
  };
  overlay.addEventListener("transitionend", onOverlayEnd);
}

// ─── DB ───────────────────────────────────────────────────────────────────────
async function unlockCard(cardId) {
  if (!groupId) return;
  const { data } = await supabase
    .from("group_cards")
    .select("unlocked")
    .eq("group_id", groupId)
    .maybeSingle();
  const updated = { ...(data?.unlocked || {}), [cardId]: true };
  await supabase
    .from("group_cards")
    .upsert({ group_id: groupId, unlocked: updated });
}

function pickCard(cardId) {
  const pool = CARD_POOLS[cardId] ?? CARD_POOLS.jtbd;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── [TEST] R: reset ──────────────────────────────────────────────────────────
document.addEventListener("keydown", async (e) => {
  if (e.key !== "r" && e.key !== "R") return;
  if (uiState === "opening") return;

  closeAll();

  for (const id of Object.keys(PACKETS)) {
    if (cardStates[id] === "blocked") continue;
    cardStates[id] = "locked";
    delete unlockedCardSrc[id];
  }
  renderAllCards();

  if (groupId) {
    await supabase
      .from("group_cards")
      .upsert({ group_id: groupId, unlocked: {} });
  }
});

// ─── Logout ───────────────────────────────────────────────────────────────────
initDashboard();

document.getElementById("logoutArr").addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.href = "/";
});
