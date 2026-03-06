import { supabase } from "./supabaseClient.js";

// ─── DOM refs ───────────────────────────────────────────────────────────────
const form = document.getElementById("authForm");
const emailInput = document.getElementById("emailInput");
const otpSection = document.getElementById("otpSection");
const otpInput = document.getElementById("otpInput");
const mainButton = document.getElementById("mainButton");
const errorMessage = document.getElementById("errorMessage");
const statusMessage = document.getElementById("statusMessage");
const resendBtn = document.getElementById("resendBtn");
const emailDisplay = document.getElementById("emailDisplay");

// ─── State ──────────────────────────────────────────────────────────────────
let currentStudent = null;
let currentEmail = null;
let state = "email"; // "email" | "otp"
let isLoading = false;

// ─── Bootstrap: se l'utente ha già una sessione, redirect immediato ──────────
(async () => {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;

  const { data: student } = await supabase
    .from("students")
    .select("role")
    .eq("auth_user_id", data.session.user.id)
    .maybeSingle();

  if (!student) {
    await supabase.auth.signOut();
    return;
  }

  redirect(student.role);
})();

// ─── Form submit ────────────────────────────────────────────────────────────
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (isLoading) return;
  setLoading(true);

  try {
    if (state === "email") {
      await handleEmailStep();
    } else if (state === "otp") {
      await handleOtpStep();
    }
  } finally {
    setLoading(false);
  }
});

// ─── Step 1: controlla email e invia OTP ────────────────────────────────────
async function handleEmailStep() {
  errorMessage.innerText = "";
  const email = emailInput.value.trim().toLowerCase();
  if (!email) return;

  // 1) Controlla che l'email sia nella lista studenti
  const { data: student } = await supabase
    .from("students")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (!student) {
    errorMessage.innerText =
      "Email not founded in the students list. Contact federico.denni@polimi.it if you think is an error.";
    return;
  }

  // 2) Manda OTP
  const sent = await sendOtp(email);
  if (!sent) return;

  // 3) Aggiorna stato e UI
  currentStudent = student;
  currentEmail = email;
  state = "otp";

  emailInput.disabled = true;
  emailDisplay.innerText = email;
  otpSection.classList.remove("hidden");
  otpInput.focus();
  mainButton.innerText = "Verify Code";
  statusMessage.innerText = `6-digit code sent to ${email}`;
  resendBtn.classList.remove("hidden");
}

// ─── Step 2: verifica OTP e redirect ────────────────────────────────────────
async function handleOtpStep() {
  errorMessage.innerText = "";
  const token = otpInput.value.trim().replace(/\s/g, "");

  if (!token || token.length !== 6 || !/^\d{6}$/.test(token)) {
    errorMessage.innerText = "Inser the 6-digit code sent to your inbox";
    return;
  }

  const { data, error } = await supabase.auth.verifyOtp({
    email: currentEmail,
    token,
    type: "email",
  });

  console.log("verifyOtp error:", error);
  console.log("verifyOtp data:", data);
  console.log("verifyOtp session:", data?.session);
  console.log("localStorage keys:", Object.keys(localStorage));

  if (error) {
    errorMessage.innerText = "Code not valid or expired. Ask for a new code.";
    otpInput.value = "";
    otpInput.focus();
    return;
  }

  // Collega auth_user_id nello studente se non è ancora settato
  const userId = data?.user?.id;
  if (userId && !currentStudent.auth_user_id) {
    await supabase
      .from("students")
      .update({ auth_user_id: userId })
      .eq("email", currentEmail);
  }

  // Recupera role aggiornato (nel dubbio, usa quello già in memoria)
  const { data: fresh } = await supabase
    .from("students")
    .select("role")
    .eq("email", currentEmail)
    .maybeSingle();

  redirect(fresh?.role ?? currentStudent.role);
}

// ─── Resend OTP ─────────────────────────────────────────────────────────────
resendBtn?.addEventListener("click", async () => {
  errorMessage.innerText = "";
  resendBtn.disabled = true;
  const sent = await sendOtp(currentEmail);
  if (sent) {
    statusMessage.innerText = `New code sent to: ${currentEmail}`;
  }
  // riabilita dopo 30 secondi per evitare spam
  setTimeout(() => {
    resendBtn.disabled = false;
  }, 30_000);
});

// ─── Helper: invia OTP via Supabase ─────────────────────────────────────────
async function sendOtp(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

  if (error) {
    errorMessage.innerText = error.message;
    return false;
  }
  return true;
}

// ─── Helper: redirect per role ───────────────────────────────────────────────
function redirect(role) {
  window.location.replace(role === "admin" ? "/admin.html" : "/dashboard.html");
}

// ─── Helper: loading state ───────────────────────────────────────────────────
function setLoading(status) {
  isLoading = status;
  mainButton.disabled = status;
  if (status) {
    mainButton.innerText = "Loading...";
  } else {
    mainButton.innerText = state === "email" ? "Check email" : "Verify Code";
  }
}
