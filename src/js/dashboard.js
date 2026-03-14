import { requireAuth } from "./sessionGuard.js";
import { supabase } from "./supabaseClient.js";

// ─── Constants ───────────────────────────────────────────────────────────────
const PACKETS = {
  jtbd: "/assets/packets/jtbd.webp",
  agency: "/assets/packets/agency.webp",
  behavior: "/assets/packets/behavior.webp",
  sensor: "/assets/packets/tech.webp",
  actuator: "/assets/packets/tech.webp",
  brand: "/assets/packets/brands.webp",
};

// Hardcoded: queste card partono come blocked.
// In futuro sarà controllato dall'admin tramite DB.
const INITIALLY_BLOCKED = new Set(["behavior", "sensor", "actuator", "brand"]);

// ─── State ───────────────────────────────────────────────────────────────────
const cardStates = {}; // { id: 'blocked' | 'locked' | 'unlocked' }
let groupId = null;
let activeItem = null;
let isOpening = false;
let ctaTimeout = null;

// ─── DOM: overlay, enlarged, CTA ─────────────────────────────────────────────
const overlay = document.createElement("div");
overlay.className = "packet-overlay";

const ctaText = document.createElement("p");
ctaText.className = "packet-cta text-logo-header";
ctaText.innerText = "Click on packet to open it!";

const enlarged = document.createElement("div");
enlarged.className = "packet-enlarged";

overlay.appendChild(ctaText);
overlay.appendChild(enlarged);
document.body.appendChild(overlay);

// ─── Click fuori dal pacchetto ingrandito: chiudi ────────────────────────────
overlay.addEventListener("click", (e) => {
  if (isOpening) return;
  if (!enlarged.contains(e.target)) closePacket();
});

// ─── Click sul pacchetto ingrandito: spacchetta ──────────────────────────────
enlarged.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!isOpening) startOpeningAnimation();
});

// ─── Init ────────────────────────────────────────────────────────────────────
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
    } else {
      cardStates[id] = "locked";
    }
  }
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderAllCards() {
  for (const id of Object.keys(PACKETS)) renderCardState(id);
}

function renderCardState(id) {
  const el = document.getElementById(id);
  if (!el) return;

  const state = cardStates[id] ?? "locked";
  el.classList.remove("state-blocked", "state-locked", "state-unlocked");
  el.classList.add(`state-${state}`);
  el.innerHTML = "";

  if (state === "unlocked") {
    const card = document.createElement("div");
    card.className = "card-placeholder";
    el.appendChild(card);
  } else {
    const img = document.createElement("img");
    img.src = PACKETS[id];
    img.alt = id;
    el.appendChild(img);
  }
}

// ─── Click listener sugli item ────────────────────────────────────────────────
function attachItemListeners() {
  for (const id of Object.keys(PACKETS)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener("click", () => {
      if (cardStates[id] !== "locked") return;
      if (activeItem === el) {
        closePacket();
      } else {
        openPacket(el);
      }
    });
  }
}

// ─── Apri pacchetto ingrandito ────────────────────────────────────────────────
function openPacket(item) {
  if (activeItem) return;

  const id = item.id;
  const src = PACKETS[id];

  activeItem = item;
  item.classList.add("is-active");

  enlarged.classList.remove("is-opening");
  enlarged.dataset.cardId = id;
  enlarged.innerHTML = `
    <div class="pack-wrapper">
      <div class="pack-top">
        <img src="${src}" alt="${id}">
        <div class="cut-line-top"></div>
      </div>
      <div class="pack-body">
        <img src="${src}" alt="${id}">
        <div class="cut-line-bottom"></div>
      </div>
    </div>
  `;

  overlay.classList.remove("is-closing");
  overlay.getBoundingClientRect();
  overlay.classList.add("is-open");

  // Mostra CTA dopo l'arrivo del pacchetto (transizione 550ms + buffer)
  ctaTimeout = setTimeout(() => {
    const rect = enlarged.getBoundingClientRect();
    ctaText.style.top = Math.max(16, rect.top - 48) + "px";
    ctaText.classList.add("is-visible");
  }, 720);
}

// ─── Animazione apertura ──────────────────────────────────────────────────────
async function startOpeningAnimation() {
  if (isOpening || !activeItem) return;
  isOpening = true;

  clearTimeout(ctaTimeout);
  ctaText.classList.remove("is-visible");

  const cardId = enlarged.dataset.cardId;

  enlarged.getBoundingClientRect();
  enlarged.classList.add("is-opening");

  await new Promise((r) => setTimeout(r, 950));

  await unlockCard(cardId);

  cardStates[cardId] = "unlocked";
  isOpening = false;
  closePacket();
  renderCardState(cardId);
}

// ─── Chiudi overlay ───────────────────────────────────────────────────────────
function closePacket() {
  if (!activeItem) return;

  clearTimeout(ctaTimeout);
  ctaText.classList.remove("is-visible");

  overlay.classList.remove("is-open");
  overlay.classList.add("is-closing");

  const onEnd = () => {
    overlay.classList.remove("is-closing");
    enlarged.classList.remove("is-opening");
    overlay.removeEventListener("transitionend", onEnd);
  };
  overlay.addEventListener("transitionend", onEnd);

  activeItem.classList.remove("is-active");
  activeItem = null;
}

// ─── Sblocca card nel DB ──────────────────────────────────────────────────────
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

// ─── [TEST] Reset con tasto R ─────────────────────────────────────────────────
document.addEventListener("keydown", (e) => {
  if (e.key !== "r" && e.key !== "R") return;

  // Chiudi l'overlay se aperto
  if (activeItem) closePacket();

  // Rimetti tutte le non-blocked a locked
  for (const id of Object.keys(PACKETS)) {
    if (cardStates[id] === "blocked") continue;
    cardStates[id] = "locked";
    renderCardState(id);
  }
});

// ─── Logout ───────────────────────────────────────────────────────────────────
initDashboard();

document.getElementById("logoutArr").addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.href = "/";
});
