import { requireAdmin } from "./sessionGuard.js";
import { supabase } from "./supabaseClient.js";

const CARD_TYPES = [
  "jtbd",
  "agency",
  "behavior",
  "sensor",
  "actuator",
  "brand",
];
const TYPE_LABEL = {
  jtbd: "JTBD",
  agency: "Agency",
  behavior: "Behavior",
  sensor: "Sensor",
  actuator: "Actuator",
  brand: "Brand",
};

let allGroups = [];
let allStudents = [];
let groupCards = {};
let cardsPool = {};

// ─── Init ─────────────────────────────────────────────────────────────────────
async function initAdmin() {
  const admin = await requireAdmin();
  if (!admin) return;

  document.getElementById("userName").innerText = admin.name ?? "Stranger";

  await loadAllData();
  renderCardsTable();
  renderGroupsList();
  bindGlobalActions();
}

// ─── Carica dati ──────────────────────────────────────────────────────────────
async function loadAllData() {
  setStatus("Loading…");
  const [{ data: groups }, { data: students }, { data: gc }, { data: cards }] =
    await Promise.all([
      supabase.from("groups").select("*").order("group_number"),
      supabase.from("students").select("*").order("name"),
      supabase.from("group_cards").select("*"),
      supabase.from("cards").select("*").order("type,name"),
    ]);

  allGroups = groups || [];
  allStudents = students || [];

  groupCards = {};
  for (const row of gc || []) groupCards[row.group_id] = row;

  cardsPool = {};
  for (const card of cards || []) {
    if (!cardsPool[card.type]) cardsPool[card.type] = [];
    cardsPool[card.type].push(card.name);
  }
  setStatus("");
}

// ─── Salva group_cards (merge parziale) ───────────────────────────────────────
async function saveGroupCards(groupId, patch) {
  const existing = groupCards[groupId] || {};
  const merged = {
    group_id: groupId,
    assigned_cards: {
      ...(existing.assigned_cards || {}),
      ...(patch.assigned_cards || {}),
    },
    unlocked: { ...(existing.unlocked || {}), ...(patch.unlocked || {}) },
    lock_status: {
      ...(existing.lock_status || {}),
      ...(patch.lock_status || {}),
    },
  };
  const { data, error } = await supabase
    .from("group_cards")
    .upsert(merged)
    .select()
    .single();
  if (!error && data) groupCards[groupId] = data;
  return !error;
}

function randomCard(type) {
  const pool = cardsPool[type] || [];
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── Azioni globali ───────────────────────────────────────────────────────────
function bindGlobalActions() {
  // Randomize tutto
  document
    .getElementById("btn-rand-all")
    .addEventListener("click", async () => {
      if (
        !confirm("Randomize ALL cards for ALL groups? This cannot be undone.")
      )
        return;
      setStatus("Randomizing…");
      for (const g of allGroups) {
        const assigned = {};
        const resetUnlocked = {};
        for (const type of CARD_TYPES) {
          const c = randomCard(type);
          if (c) assigned[type] = c;
          resetUnlocked[type] = false; // riporta a locked
        }
        await saveGroupCards(g.id, {
          assigned_cards: assigned,
          unlocked: resetUnlocked,
        });
      }
      renderCardsTable();
      setStatus("Done ✓");
      setTimeout(() => setStatus(""), 2000);
    });

  // Apri form nuovo gruppo
  document
    .getElementById("btn-add-group-open")
    .addEventListener("click", () => {
      document.getElementById("add-group-form").classList.remove("hidden");
    });

  document
    .getElementById("btn-add-group-cancel")
    .addEventListener("click", () => {
      document.getElementById("add-group-form").classList.add("hidden");
      document.getElementById("add-group-error").innerText = "";
      document.getElementById("new-group-number").value = "";
    });

  document
    .getElementById("btn-add-group")
    .addEventListener("click", async () => {
      const num = parseInt(document.getElementById("new-group-number").value);
      const errEl = document.getElementById("add-group-error");
      errEl.innerText = "";

      if (!num || num < 1) {
        errEl.innerText = "Insert a valid group number.";
        return;
      }
      if (allGroups.find((g) => g.group_number === num)) {
        errEl.innerText = `Group ${num} already exists.`;
        return;
      }

      const { data, error } = await supabase
        .from("groups")
        .insert({ group_number: num, name: `Group ${num}` })
        .select()
        .single();
      if (error) {
        errEl.innerText = error.message;
        return;
      }

      allGroups.push(data);
      allGroups.sort((a, b) => a.group_number - b.group_number);
      document.getElementById("add-group-form").classList.add("hidden");
      document.getElementById("new-group-number").value = "";
      renderCardsTable();
      renderGroupsList();
    });
}

// ─── Render tabella ───────────────────────────────────────────────────────────
function renderCardsTable() {
  const thead = document.getElementById("cards-thead");
  const tbody = document.getElementById("cards-tbody");

  // Header row 1: nomi colonne
  const h1 = document.createElement("tr");
  h1.innerHTML = `
    <th class="col-group">Group</th>
    <th class="col-students">Students</th>
    ${CARD_TYPES.map((t) => `<th class="col-card">${TYPE_LABEL[t]}</th>`).join("")}
    <th class="col-actions">Actions</th>
  `;

  // Header row 2: azioni per colonna (toggle + randomize)
  const h2 = document.createElement("tr");
  h2.appendChild(document.createElement("th")); // group
  h2.appendChild(document.createElement("th")); // students

  for (const type of CARD_TYPES) {
    const th = document.createElement("th");
    const div = document.createElement("div");
    div.className = "col-actions-header";

    // Toggle lock/block per tutta la colonna
    const label = document.createElement("label");
    label.className = "toggle-label";
    label.title = "Locked = students can open; Blocked = hidden";
    const chk = document.createElement("input");
    chk.type = "checkbox";
    const allLocked =
      allGroups.length > 0 &&
      allGroups.every((g) => {
        return (groupCards[g.id]?.lock_status || {})[type] === "locked";
      });
    chk.checked = allLocked;
    chk.addEventListener("change", async () => {
      const newStatus = chk.checked ? "locked" : "blocked";
      setStatus("Saving…");
      for (const g of allGroups) {
        await saveGroupCards(g.id, { lock_status: { [type]: newStatus } });
      }
      renderCardsTable();
      setStatus("Done ✓");
      setTimeout(() => setStatus(""), 1500);
    });
    label.appendChild(chk);
    label.appendChild(
      document.createTextNode(
        allLocked ? " Click to block" : " Click to unblock",
      ),
    );

    // Randomize tutta la colonna (resetta anche unlocked)
    const btn = document.createElement("button");
    btn.className = "btn-icon";
    btn.title = `Randomize ${TYPE_LABEL[type]} for ALL groups`;
    btn.innerText = "🎲 All";
    btn.addEventListener("click", async () => {
      if (!confirm(`Re-randomize ${TYPE_LABEL[type]} for ALL groups?`)) return;
      setStatus("Randomizing…");
      for (const g of allGroups) {
        const c = randomCard(type);
        if (c)
          await saveGroupCards(g.id, {
            assigned_cards: { [type]: c },
            unlocked: { [type]: false }, // riporta a locked
          });
      }
      renderCardsTable();
      setStatus("Done ✓");
      setTimeout(() => setStatus(""), 1500);
    });

    div.appendChild(label);
    div.appendChild(btn);
    th.appendChild(div);
    h2.appendChild(th);
  }
  h2.appendChild(document.createElement("th")); // actions

  thead.innerHTML = "";
  thead.appendChild(h1);
  thead.appendChild(h2);

  // Body: una riga per gruppo
  tbody.innerHTML = "";
  const studentsOf = (gId) => allStudents.filter((s) => s.group_id === gId);

  for (const g of allGroups) {
    const gc = groupCards[g.id] || {};
    const assigned = gc.assigned_cards || {};
    const lockStatus = gc.lock_status || {};
    const students = studentsOf(g.id);

    const tr = document.createElement("tr");

    // Numero gruppo
    const tdGroup = document.createElement("td");
    tdGroup.className = "col-group";
    tdGroup.innerHTML = `<span class="text-logo-footer">${g.group_number}</span>`;
    tr.appendChild(tdGroup);

    // Studenti
    const tdStudents = document.createElement("td");
    tdStudents.className = "col-students";
    tdStudents.innerHTML =
      students.length === 0
        ? `<span style="color:#555">—</span>`
        : students
            .map(
              (s) => `
          <div class="student-entry">
            <span>${s.name ?? "?"}</span>
            <span class="email">${s.email}</span>
          </div>`,
            )
            .join("");
    tr.appendChild(tdStudents);

    // Colonne carta — solo nome + reroll (NO toggle per cella)
    for (const type of CARD_TYPES) {
      const td = document.createElement("td");
      td.className = "col-card";
      const cardName = assigned[type];
      const status = lockStatus[type] ?? "blocked";
      const isUnlocked = (gc.unlocked || {})[type] === true;

      const nameDiv = document.createElement("div");
      nameDiv.className = "card-cell-name" + (cardName ? "" : " not-assigned");
      nameDiv.innerText = cardName || "not assigned";
      td.appendChild(nameDiv);

      // Tag stato: unlocked (verde) > locked (giallo) > blocked (grigio)
      const stateTag = document.createElement("span");
      if (isUnlocked) {
        stateTag.className = "card-state-tag tag-unlocked";
        stateTag.innerText = "unlocked";
      } else if (status === "locked") {
        stateTag.className = "card-state-tag tag-locked";
        stateTag.innerText = "locked";
      } else {
        stateTag.className = "card-state-tag tag-blocked";
        stateTag.innerText = "blocked";
      }
      td.appendChild(stateTag);

      // Reroll singola carta (resetta anche unlocked per questa carta)
      const reroll = document.createElement("button");
      reroll.className = "btn-icon";
      reroll.title = `Re-randomize ${TYPE_LABEL[type]} for group ${g.group_number}`;
      reroll.innerText = "↺";
      reroll.addEventListener("click", async () => {
        const c = randomCard(type);
        if (!c) return;
        await saveGroupCards(g.id, {
          assigned_cards: { [type]: c },
          unlocked: { [type]: false }, // riporta a locked
        });
        renderCardsTable();
      });
      td.appendChild(reroll);
      tr.appendChild(td);
    }

    // Azioni riga: randomize gruppo (resetta anche unlocked)
    const tdAct = document.createElement("td");
    tdAct.className = "col-actions";
    const randGroup = document.createElement("button");
    randGroup.className = "btn-sm";
    randGroup.title = "Re-randomize all cards for this group";
    randGroup.innerText = "🎲 Group";
    randGroup.addEventListener("click", async () => {
      const assigned = {};
      const resetUnlocked = {};
      for (const type of CARD_TYPES) {
        const c = randomCard(type);
        if (c) assigned[type] = c;
        resetUnlocked[type] = false;
      }
      await saveGroupCards(g.id, {
        assigned_cards: assigned,
        unlocked: resetUnlocked,
      });
      renderCardsTable();
    });
    tdAct.appendChild(randGroup);
    tr.appendChild(tdAct);

    tbody.appendChild(tr);
  }

  if (allGroups.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="${CARD_TYPES.length + 3}" style="color:#555;text-align:center;padding:2rem">No groups yet</td>`;
    tbody.appendChild(tr);
  }
}

// ─── Render lista gruppi (4 colonne) + pannello unassigned ───────────────────
function renderGroupsList() {
  const container = document.getElementById("groups-list");
  container.innerHTML = "";
  const studentsOf = (gId) => allStudents.filter((s) => s.group_id === gId);

  for (const g of allGroups) {
    const students = studentsOf(g.id);
    const div = document.createElement("div");
    div.className = "group-card";

    // Header
    const header = document.createElement("div");
    header.className = "group-card-header";
    header.innerHTML = `<span class="group-card-title">Group ${g.group_number}</span>`;
    const deleteGroupBtn = document.createElement("button");
    deleteGroupBtn.className = "btn-sm btn-danger";
    deleteGroupBtn.innerText = "Delete group";
    deleteGroupBtn.addEventListener("click", () => deleteGroup(g));
    header.appendChild(deleteGroupBtn);
    div.appendChild(header);

    // Lista studenti con due azioni: remove (dal gruppo) e delete (dal sistema)
    const list = document.createElement("div");
    list.className = "students-list";
    if (students.length === 0) {
      list.innerHTML = `<span style="color:#555;font-size:0.8rem">No students yet</span>`;
    } else {
      for (const s of students) {
        const row = document.createElement("div");
        row.className = "student-row";
        row.innerHTML = `
          <span class="name">${s.name ?? "?"}</span>
          <span class="email">${s.email}</span>
        `;
        // Remove dal gruppo (studente resta nel sistema)
        const rmBtn = document.createElement("button");
        rmBtn.className = "btn-icon";
        rmBtn.title = "Remove from group (keeps student in registry)";
        rmBtn.innerText = "✕";
        rmBtn.addEventListener("click", () => removeStudentFromGroup(s));

        // Delete dal sistema
        const delBtn = document.createElement("button");
        delBtn.className = "btn-icon btn-danger";
        delBtn.title = "Delete student permanently";
        delBtn.innerText = "🗑";
        delBtn.addEventListener("click", () => deleteStudent(s));

        row.appendChild(rmBtn);
        row.appendChild(delBtn);
        list.appendChild(row);
      }
    }
    div.appendChild(list);

    // Form aggiunta studente — email + nome opzionale
    const addForm = document.createElement("div");
    addForm.className = "add-student-form";

    const emailInput = document.createElement("input");
    emailInput.type = "email";
    emailInput.placeholder = "Email…";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "Name (optional)";

    const addBtn = document.createElement("button");
    addBtn.className = "btn-sm";
    addBtn.innerText = "+ Add";

    const errSpan = document.createElement("span");
    errSpan.className = "group-error";

    const doAdd = () => addStudentToGroup(g.id, emailInput, nameInput, errSpan);
    addBtn.addEventListener("click", doAdd);
    emailInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doAdd();
    });
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doAdd();
    });

    addForm.appendChild(emailInput);
    addForm.appendChild(nameInput);
    addForm.appendChild(addBtn);
    addForm.appendChild(errSpan);
    div.appendChild(addForm);

    container.appendChild(div);
  }

  // ── Pannello studenti non assegnati ──
  const unassigned = allStudents.filter(
    (s) => !s.group_id && s.role !== "admin",
  );
  const unassignedDiv = document.createElement("div");
  unassignedDiv.className = "group-card unassigned-panel";

  const uHeader = document.createElement("div");
  uHeader.className = "group-card-header";
  uHeader.innerHTML = `<span class="group-card-title" style="color:#888">Unassigned (${unassigned.length})</span>`;
  unassignedDiv.appendChild(uHeader);

  if (unassigned.length === 0) {
    const empty = document.createElement("span");
    empty.style.cssText = "color:#555;font-size:0.8rem";
    empty.innerText = "All students are assigned";
    unassignedDiv.appendChild(empty);
  } else {
    const list = document.createElement("div");
    list.className = "students-list";
    for (const s of unassigned) {
      const row = document.createElement("div");
      row.className = "student-row";
      row.innerHTML = `
        <span class="name">${s.name ?? "?"}</span>
        <span class="email">${s.email}</span>
      `;
      const delBtn = document.createElement("button");
      delBtn.className = "btn-icon btn-danger";
      delBtn.title = "Delete student permanently";
      delBtn.innerText = "🗑";
      delBtn.addEventListener("click", () => deleteStudent(s));
      row.appendChild(delBtn);
      list.appendChild(row);
    }
    unassignedDiv.appendChild(list);
  }

  // Form per aggiungere studente senza gruppo
  const addForm = document.createElement("div");
  addForm.className = "add-student-form";
  const emailIn = document.createElement("input");
  emailIn.type = "email";
  emailIn.placeholder = "Email…";
  const nameIn = document.createElement("input");
  nameIn.type = "text";
  nameIn.placeholder = "Name (optional)";
  const addBtn = document.createElement("button");
  addBtn.className = "btn-sm";
  addBtn.innerText = "+ Add to registry";
  const errSpan = document.createElement("span");
  errSpan.className = "group-error";

  const doAddUnassigned = () => addUnassignedStudent(emailIn, nameIn, errSpan);
  addBtn.addEventListener("click", doAddUnassigned);
  emailIn.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doAddUnassigned();
  });
  nameIn.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doAddUnassigned();
  });

  addForm.appendChild(emailIn);
  addForm.appendChild(nameIn);
  addForm.appendChild(addBtn);
  addForm.appendChild(errSpan);
  unassignedDiv.appendChild(addForm);

  container.appendChild(unassignedDiv);

  if (allGroups.length === 0 && unassigned.length === 0) {
    container.innerHTML = `<p style="color:#555" class="text-small-body">No groups yet. Create one above.</p>`;
  }
}

// ─── Azioni gruppi ────────────────────────────────────────────────────────────

async function addStudentToGroup(groupId, emailInput, nameInput, errSpan) {
  errSpan.innerText = "";
  const email = emailInput.value.trim().toLowerCase();
  const name = nameInput.value.trim() || null;
  if (!email) return;

  let student = allStudents.find((s) => s.email === email);

  // Se non esiste nella lista, crealo direttamente nel DB
  if (!student) {
    const { data: newStudent, error } = await supabase
      .from("students")
      .insert({ email, name, group_id: groupId, role: "student" })
      .select()
      .single();
    if (error) {
      errSpan.innerText = error.message;
      return;
    }
    allStudents.push(newStudent);
    emailInput.value = "";
    nameInput.value = "";
    renderCardsTable();
    renderGroupsList();
    return;
  }

  if (student.group_id === groupId) {
    errSpan.innerText = "Already in this group.";
    return;
  }
  if (student.group_id && student.group_id !== groupId) {
    const g = allGroups.find((g) => g.id === student.group_id);
    if (
      !confirm(
        `${student.name ?? email} is in Group ${g?.group_number}. Move here?`,
      )
    )
      return;
  }

  const updateData = { group_id: groupId };
  if (name) updateData.name = name;

  const { error } = await supabase
    .from("students")
    .update(updateData)
    .eq("id", student.id);
  if (error) {
    errSpan.innerText = error.message;
    return;
  }

  student.group_id = groupId;
  if (name) student.name = name;
  emailInput.value = "";
  nameInput.value = "";
  renderCardsTable();
  renderGroupsList();
}

async function removeStudentFromGroup(student) {
  if (!confirm(`Remove ${student.name ?? student.email} from their group?`))
    return;
  const { error } = await supabase
    .from("students")
    .update({ group_id: null })
    .eq("id", student.id);
  if (error) {
    alert(error.message);
    return;
  }
  student.group_id = null;
  renderCardsTable();
  renderGroupsList();
}

async function addUnassignedStudent(emailInput, nameInput, errSpan) {
  errSpan.innerText = "";
  const email = emailInput.value.trim().toLowerCase();
  const name = nameInput.value.trim() || null;
  if (!email) return;

  if (allStudents.find((s) => s.email === email)) {
    errSpan.innerText = "Email already exists.";
    return;
  }

  const { data, error } = await supabase
    .from("students")
    .insert({ email, name, role: "student" })
    .select()
    .single();
  if (error) {
    errSpan.innerText = error.message;
    return;
  }

  allStudents.push(data);
  emailInput.value = "";
  nameInput.value = "";
  renderCardsTable();
  renderGroupsList();
}

async function deleteStudent(student) {
  if (
    !confirm(
      `Delete ${student.name ?? student.email} permanently? This cannot be undone.`,
    )
  )
    return;
  const { error } = await supabase
    .from("students")
    .delete()
    .eq("id", student.id);
  if (error) {
    alert(error.message);
    return;
  }
  allStudents = allStudents.filter((s) => s.id !== student.id);
  renderCardsTable();
  renderGroupsList();
}

async function deleteGroup(group) {
  const students = allStudents.filter((s) => s.group_id === group.id);
  const msg =
    students.length > 0
      ? `Delete Group ${group.group_number}? ${students.length} student(s) will be unassigned.`
      : `Delete Group ${group.group_number}?`;
  if (!confirm(msg)) return;

  if (students.length > 0) {
    await supabase
      .from("students")
      .update({ group_id: null })
      .eq("group_id", group.id);
    for (const s of students) s.group_id = null;
  }
  await supabase.from("group_cards").delete().eq("group_id", group.id);
  delete groupCards[group.id];
  await supabase.from("groups").delete().eq("id", group.id);
  allGroups = allGroups.filter((g) => g.id !== group.id);
  renderCardsTable();
  renderGroupsList();
}

function setStatus(msg) {
  const el = document.getElementById("table-status");
  if (el) el.innerText = msg;
}

// ─── Logout ───────────────────────────────────────────────────────────────────
initAdmin();

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.href = "/";
});
