import { requireAuth } from "./sessionGuard.js";
import { supabase } from "./supabaseClient.js";

async function initDashboard() {
  const student = await requireAuth();
  if (!student) return;

  console.log("Logged as:", student.email);

  // TODO: load cards later
}

initDashboard();

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.href = "/";
});
