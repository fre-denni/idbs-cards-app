import { supabase } from "./supabaseClient.js";

export async function requireAuth() {
  const { data } = await supabase.auth.getSession();

  if (!data.session) {
    window.location.href = "/";
    return null;
  }

  const { data: student } = await supabase
    .from("students")
    .select("*")
    .eq("auth_user_id", data.session.user.id)
    .single();

  if (!student) {
    await supabase.auth.signOut();
    window.location.href = "/";
    return null;
  }

  return student;
}

export async function requireAdmin() {
  const student = await requireAuth();
  if (!student) return null;

  if (student.role !== "admin") {
    window.location.href = "/dashboard.html";
    return null;
  }

  return student;
}
