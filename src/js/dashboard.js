import { requireAuth } from "./sessionGuard.js";
import { supabase } from "./supabaseClient.js";

// ─── Mapping tipo carta → cartella asset ──────────────────────────────────────
// Per aggiornare i path: modifica solo questo oggetto
const CARD_FOLDER = {
  jtbd: "jobs",
  agency: "agency",
  behavior: "behavior",
  sensor: "sensors",
  actuator: "actuators",
  brand: "brands",
};

function cardSrc(type, name) {
  return `/cards/${CARD_FOLDER[type]}/${name}.webp`;
}

const PACKETS = {
  jtbd: "/assets/packets/jtbd.webp",
  agency: "/assets/packets/agency.webp",
  behavior: "/assets/packets/behavior.webp",
  sensor: "/assets/packets/sensors.webp",
  actuator: "/assets/packets/actuators.webp",
  brand: "/assets/packets/brands.webp",
};

// assignedCardSrc: cardId → src del file .webp assegnato dal DB
const assignedCardSrc = {};
const cardStates = {};

// ─── UI State machine ─────────────────────────────────────────────────────────
// idle | pack-open | opening | card-visible | card-viewing
let uiState = "idle";
let activeItem = null;
let activeCardId = null;
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

// ─── Click handlers ───────────────────────────────────────────────────────────

enlarged.addEventListener("click", (e) => {
  e.stopPropagation();
  if (uiState === "pack-open") startOpeningAnimation();
});

cardStage.addEventListener("click", (e) => {
  e.stopPropagation();
  if (uiState === "card-viewing") cardStage.classList.add("is-centered");
});

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

  // Bottone back: testo e comportamento diversi per admin vs studente
  const backBtn = document.getElementById("logoutArr");
  if (student.role === "admin") {
    backBtn.innerHTML = "&larr; GO-BACK";
    backBtn.dataset.isAdmin = "true";
  } else {
    backBtn.dataset.isAdmin = "false";
  }

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
    // Nessun gruppo: tutto blocked di default
    for (const id of Object.keys(PACKETS)) cardStates[id] = "blocked";
  }

  renderAllCards();
  attachItemListeners();
}

// ─── Carica stati + carte assegnate dal DB ────────────────────────────────────
async function loadCardStates() {
  const { data, error } = await supabase
    .from("group_cards")
    .select("assigned_cards, unlocked, lock_status")
    .eq("group_id", groupId)
    .maybeSingle();

  console.log("group_cards data:", data);
  console.log("group_cards error:", error);
  console.log("groupId:", groupId);

  const assigned = data?.assigned_cards || {};
  const unlocked = data?.unlocked || {};
  const lockStatus = data?.lock_status || {};

  for (const id of Object.keys(PACKETS)) {
    const status = lockStatus[id] ?? "blocked"; // default: blocked
    const isOpen = unlocked[id] === true;

    if (status === "blocked") {
      cardStates[id] = "blocked";
    } else if (isOpen) {
      cardStates[id] = "unlocked";
    } else {
      cardStates[id] = "locked";
    }

    // Imposta il src dalla carta assegnata nel DB
    if (assigned[id]) {
      assignedCardSrc[id] = cardSrc(id, assigned[id]);
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

  const state = cardStates[id] ?? "blocked";
  el.classList.remove(
    "state-blocked",
    "state-locked",
    "state-unlocked",
    "is-active",
    "is-slot-empty",
    "is-departing",
    "card-entering",
  );
  el.classList.add(`state-${state}`);
  el.innerHTML = "";

  if (state === "unlocked") {
    const src = assignedCardSrc[id];
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
  tilt.setAttribute("glare-intensity", "2");
  tilt.setAttribute("scale-factor", "1.02");
  tilt.setAttribute("shadow", "");
  tilt.setAttribute("glare-hue", "210");
  tilt.setAttribute("tilt-factor", "1.5");
  tilt.classList.add("card-tilt");
  const img = document.createElement("img");
  img.src = src;
  img.alt = alt;
  tilt.appendChild(img);
  return tilt;
}

// ─── Listener sulla griglia ───────────────────────────────────────────────────
function attachItemListeners() {
  for (const id of Object.keys(PACKETS)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener("click", () => {
      if (uiState !== "idle") return;
      const state = cardStates[id];
      if (state === "locked") openPacket(el);
      if (state === "unlocked") openUnlockedCard(id, el);
    });
  }
}

// ─── Apri pack ingrandito ─────────────────────────────────────────────────────
function openPacket(item) {
  uiState = "pack-open";
  activeItem = item;
  activeCardId = item.id;
  item.classList.add("is-active");

  // Reset enlarged senza transizioni per evitare race condition
  enlarged.style.transition = "none";
  enlarged.classList.remove("is-dismissed", "is-opening");
  enlarged.style.display = ""; // ripristina se era hidden da openUnlockedCard
  enlarged.style.top = "100%";
  enlarged.style.transform = "translateX(-50%) translateY(0)";
  enlarged.innerHTML = "";
  enlarged.getBoundingClientRect();
  enlarged.style.transition = "";
  enlarged.style.top = "";
  enlarged.style.transform = "";

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

// ─── Apri carta già sbloccata (slide-down → centrata) ─────────────────────────
function openUnlockedCard(id, el) {
  const src = assignedCardSrc[id];
  if (!src) return;

  uiState = "card-viewing";
  activeCardId = id;
  activeItem = el;

  // Fase 1: la carta nella griglia scende verso il basso
  el.classList.add("is-departing");

  // Fase 2: dopo la slide-down, apri l'overlay con la carta già centrata
  setTimeout(() => {
    el.classList.add("is-slot-empty");

    enlarged.innerHTML = "";
    enlarged.style.display = "none";

    overlay.classList.remove("is-closing");
    overlay.getBoundingClientRect();
    overlay.classList.add("is-open");

    showCard(src);

    // Va direttamente al centro (salta la posizione "riposo")
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        cardStage.classList.add("is-centered");
      }),
    );
  }, 350);
}

// ─── Animazione apertura pack ─────────────────────────────────────────────────
async function startOpeningAnimation() {
  uiState = "opening";

  clearTimeout(ctaTimeout);
  ctaText.classList.remove("is-visible");

  const cardId = activeCardId;
  const src = assignedCardSrc[cardId];

  if (!src) {
    // Carta non ancora assegnata nel DB: impossibile aprire
    uiState = "pack-open";
    return;
  }

  // 1. Split del pack
  enlarged.getBoundingClientRect();
  enlarged.classList.add("is-opening");

  // 2. Carta sale da sotto
  setTimeout(() => showCard(src), 300);

  // 3. Attendi fine split
  await new Promise((r) => setTimeout(r, 950));

  // 4. Pack dismissed
  enlarged.classList.add("is-dismissed");
  enlarged.classList.remove("is-opening");

  // 5. Timer sunrays da adesso
  clearTimeout(sunraysTimeout);
  sunraysTimeout = setTimeout(() => {
    sunrays.classList.remove("is-active");
    sunrays.classList.add("is-fading");
  }, 6000);

  // 6. DB: segna come unlocked
  await unlockCard(cardId);
  cardStates[cardId] = "unlocked";
  // NON rimuovere is-active qui: lo slot deve restare nascosto finché
  // l'utente non clicca fuori e closeAll chiama renderCardState

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

  const wasJustUnlocked = uiState === "card-visible";
  const wasViewing = uiState === "card-viewing";
  const cardToRender = wasJustUnlocked ? activeCardId : null;
  const viewingCardId = wasViewing ? activeCardId : null;
  const itemToRestore = activeItem;

  uiState = "idle";
  activeCardId = null;
  activeItem = null;

  // Chiudi card stage
  cardStage.classList.remove("is-visible", "is-centered");
  if (cardStage.innerHTML !== "") {
    cardStage.classList.add("is-closing");
    const onCardEnd = () => {
      cardStage.classList.remove("is-closing");
      cardStage.innerHTML = "";
      cardStage.removeEventListener("transitionend", onCardEnd);

      if (cardToRender) {
        // Appena sbloccata: mostra carta nello slot con animazione di entrata
        renderCardState(cardToRender, true);
      } else if (viewingCardId) {
        // Carta già sbloccata: ricostruisce lo slot pulito senza animazione
        renderCardState(viewingCardId, false);
      }
    };
    cardStage.addEventListener("transitionend", onCardEnd);
  } else {
    if (itemToRestore)
      itemToRestore.classList.remove("is-slot-empty", "is-departing");
  }

  // Chiudi overlay
  overlay.classList.remove("is-open");
  overlay.classList.add("is-closing");
  const onOverlayEnd = () => {
    overlay.classList.remove("is-closing");
    enlarged.classList.remove("is-opening", "is-dismissed");
    enlarged.style.display = "";
    enlarged.innerHTML = "";
    sunrays.classList.remove("is-fading");
    // Rimuovi is-active dopo che l'overlay è chiuso
    if (itemToRestore && wasJustUnlocked) {
      itemToRestore.classList.remove("is-active");
    }
    overlay.removeEventListener("transitionend", onOverlayEnd);
  };
  overlay.addEventListener("transitionend", onOverlayEnd);
}

// ─── Segna carta come unlocked nel DB ─────────────────────────────────────────
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

// ─── [EASTER EGG] Tasto R: reset unlocked → locked (assigned rimane) ─────────
document.addEventListener("keydown", async (e) => {
  if (e.key !== "r" && e.key !== "R") return;
  if (uiState === "opening") return;

  closeAll();

  // Reset locale: unlocked → locked (blocked rimane blocked)
  for (const id of Object.keys(PACKETS)) {
    if (cardStates[id] === "unlocked") cardStates[id] = "locked";
  }
  renderAllCards();

  // Reset DB: solo il campo unlocked, assigned_cards e lock_status invariati
  if (groupId) {
    const resetUnlocked = {};
    for (const id of Object.keys(PACKETS)) resetUnlocked[id] = false;
    await supabase.from("group_cards").upsert({
      group_id: groupId,
      unlocked: resetUnlocked,
    });
  }
});

// ─── Bottone back: admin → /admin.html, studenti → logout ────────────────────
initDashboard();

document.getElementById("logoutArr").addEventListener("click", async () => {
  // Il ruolo viene letto dopo initDashboard, quindi è già disponibile
  // Usiamo un data-attribute impostato da initDashboard per semplicità
  const isAdmin =
    document.getElementById("logoutArr").dataset.isAdmin === "true";
  if (isAdmin) {
    window.location.href = "/admin.html";
  } else {
    await supabase.auth.signOut();
    window.location.href = "/";
  }
});
