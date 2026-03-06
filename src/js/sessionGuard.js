import { supabase } from "./supabaseClient.js";

// Aspetta l'evento INITIAL_SESSION di Supabase v2, che porta sempre
// la sessione corrente (o null) appena il client è pronto.
function waitForSession(timeoutMs = 4000) {
  return new Promise((resolve) => {
    let settled = false;

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (settled) return;
        if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
          settled = true;
          listener.subscription.unsubscribe();
          resolve(session);
        }
      },
    );

    // Fallback: se INITIAL_SESSION non arriva entro il timeout, resolve null
    setTimeout(() => {
      if (!settled) {
        settled = true;
        listener.subscription.unsubscribe();
        resolve(null);
      }
    }, timeoutMs);
  });
}

export async function requireAuth() {
  const session = await waitForSession();

  if (!session) {
    window.location.replace("/");
    return null;
  }

  const { data: student } = await supabase
    .from("students")
    .select("*")
    .eq("auth_user_id", session.user.id)
    .maybeSingle();

  if (!student) {
    // Prova anche per email (nel caso auth_user_id non sia ancora scritto)
    const { data: studentByEmail } = await supabase
      .from("students")
      .select("*")
      .eq("email", session.user.email)
      .maybeSingle();

    if (!studentByEmail) {
      await supabase.auth.signOut();
      window.location.replace("/");
      return null;
    }

    // Scrivi auth_user_id se mancante
    if (!studentByEmail.auth_user_id) {
      await supabase
        .from("students")
        .update({ auth_user_id: session.user.id })
        .eq("email", session.user.email);
    }

    return studentByEmail;
  }

  return student;
}

export async function requireAdmin() {
  const student = await requireAuth();
  if (!student) return null;

  if (student.role !== "admin") {
    window.location.replace("/dashboard.html");
    return null;
  }

  return student;
}
