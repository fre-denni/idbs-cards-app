import { requireAdmin } from "./sessionGuard.js";
import { supabase } from "./supabaseClient.js";

async function initAdmin() {
  const admin = await requireAdmin();
  if (!admin) return;

  console.log("Admin logged:", admin.email);
}

initAdmin();

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.href = "/";
});
