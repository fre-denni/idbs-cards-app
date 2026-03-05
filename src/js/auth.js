import { supabase } from "./supabaseClient.js";

const form = document.getElementById("authForm");
const emailInput = document.getElementById("emailInput");
const errorMessage = document.getElementById("errorMessage");
const mainButton = document.getElementById("mainButton");

const firstAccessSection = document.getElementById("firstAccessSection");
const returningSection = document.getElementById("returningSection");

const emailSection = document.getElementById("emailSection");
const emailLabel = document.getElementById("emailLabel");
const emailConfirmedMessage = document.getElementById("emailConfirmedMessage");

let currentStudent = null;
let state = "email"; // email | firstAccess | returning | resetSent | confirmSent
let isLoading = false;

/* ------------------------------------------------
   1) ON-AUTH listener: cattura SIGNED_IN subito
   ------------------------------------------------ */
supabase.auth.onAuthStateChange(async (event, session) => {
  try {
    if (event === "SIGNED_IN" && session) {
      const user = session.user;

      // trova lo studente tramite email
      const { data: student } = await supabase
        .from("students")
        .select("*")
        .eq("email", user.email)
        .maybeSingle();

      if (!student) {
        // non c'è registro students per quest'email: fai signOut (sicurezza)
        await supabase.auth.signOut();
        return;
      }

      // collega auth_user_id se necessario
      if (!student.auth_user_id) {
        await supabase
          .from("students")
          .update({ auth_user_id: user.id })
          .eq("id", student.id);
      }

      // redirect verso la pagina corretta
      if (student.role === "admin") {
        window.location.replace("/admin.html");
      } else {
        window.location.replace("/dashboard.html");
      }
    }
  } catch (err) {
    console.error("onAuthStateChange handler error", err);
  }
});

/* ------------------------------------------------
   2) Bootstrap: piccolo fallback per race condition
   - aspetta brevemente, poi controlla getSession()
   ------------------------------------------------*/
(async () => {
  // breve delay per lasciare il tempo a supabase di processare hash se presente
  await new Promise((r) => setTimeout(r, 120));

  try {
    const { data } = await supabase.auth.getSession();

    if (!data.session) return;

    // se c'è una sessione, cerca lo studente tramite auth_user_id
    const { data: student } = await supabase
      .from("students")
      .select("*")
      .eq("auth_user_id", data.session.user.id)
      .maybeSingle();

    if (!student) {
      // sessione esistente ma non c'è riga students -> sign out
      await supabase.auth.signOut();
      return;
    }

    if (student.role === "admin") {
      window.location.replace("/admin.html");
    } else {
      window.location.replace("/dashboard.html");
    }
  } catch (err) {
    console.error("bootstrap session check error", err);
  }
})();

/* -------------------------
   FORM SUBMISSION HANDLER
   ------------------------- */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (isLoading) return;
  setLoading(true);

  try {
    if (state === "email") {
      await handleEmailCheck();
    } else if (state === "firstAccess") {
      await completeFirstAccess();
    } else if (state === "returning") {
      await loginReturningUser();
    }
  } finally {
    setLoading(false);
  }
});

/* -------------------------
   handleEmailCheck
   - if there is an active session for a different user -> signOut()
   - then lookup student by email as anon
   ------------------------- */
async function handleEmailCheck() {
  errorMessage.innerText = "";

  const email = emailInput.value.trim().toLowerCase();
  if (!email) return;

  // if there's an active session for another user, sign it out so the lookup runs as anon
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session && sessionData.session.user?.email !== email) {
      await supabase.auth.signOut();
    }
  } catch (e) {
    console.warn("session check error before lookup", e);
  }

  const { data } = await supabase
    .from("students")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (!data) {
    errorMessage.innerText =
      "You are not on the list of students of this year! If you think it's an error please contact: federico.denni@polimi.it";
    return;
  }

  currentStudent = data;
  emailInput.disabled = true;
  lockEmailUI();

  if (!data.auth_user_id) {
    state = "firstAccess";
    showFirstAccess();
  } else {
    state = "returning";
    showReturning();
  }

  mainButton.innerText = "Sign In";
}

/* -------------------------
   completeFirstAccess => signUp
   - supabase will send confirmation email if enabled
   - we show confirmSent UI (user must click email)
   ------------------------- */
async function completeFirstAccess() {
  errorMessage.innerText = "";

  const password = document.getElementById("passwordInput").value;
  const name = document.getElementById("nameInput").value;

  if (!password || password.length < 8) {
    errorMessage.innerText = "Password must be at least 8 characters";
    return;
  }

  const { data: signupData, error } = await supabase.auth.signUp({
    email: currentStudent.email,
    password,
  });

  if (error) {
    errorMessage.innerText = error.message;
    return;
  }

  // show confirmation UI: the actual session will be created when user clicks the confirmation link
  showConfirmationSentUI(currentStudent.email);

  // store name in students table (auth_user_id will be set later when signed in)
  if (name && name.trim().length > 0) {
    await supabase
      .from("students")
      .update({ name: name })
      .eq("id", currentStudent.id);
  }
}

/* -------------------------
   loginReturningUser => signIn
   - after success, update students.auth_user_id if missing
   - then redirect (onAuth listener will also trigger; but we explicitly fetch & redirect here)
   ------------------------- */
async function loginReturningUser() {
  errorMessage.innerText = "";
  const password = document.getElementById("passwordInputReturning").value;

  const { data: signInData, error } = await supabase.auth.signInWithPassword({
    email: currentStudent.email,
    password,
  });

  if (error) {
    errorMessage.innerText = "Wrong password";
    return;
  }

  // signIn success: ensure students.auth_user_id is set (id taken from session)
  const userId = signInData?.data?.user?.id || signInData?.user?.id || null;
  if (userId) {
    await supabase
      .from("students")
      .update({ auth_user_id: userId })
      .eq("id", currentStudent.id)
      .is("auth_user_id", null);
  }

  // fetch fresh student and redirect
  const { data: updatedStudent } = await supabase
    .from("students")
    .select("*")
    .eq("id", currentStudent.id)
    .maybeSingle();

  if (updatedStudent?.role === "admin") {
    window.location.replace("/admin.html");
  } else {
    window.location.replace("/dashboard.html");
  }
}

/* -------------------------
   UI helpers
   ------------------------- */
function showFirstAccess() {
  firstAccessSection.classList.remove("hidden");
  returningSection.classList.add("hidden");
}
function showReturning() {
  returningSection.classList.remove("hidden");
  firstAccessSection.classList.add("hidden");
}
function lockEmailUI() {
  emailSection.classList.add("email-locked");
  emailConfirmedMessage.classList.remove("hidden");
}
function setLoading(status) {
  isLoading = status;
  if (status) {
    mainButton.disabled = true;
    mainButton.innerText = "Loading...";
  } else {
    mainButton.disabled = false;
  }
}
function showResetSentUI(email) {
  state = "resetSent";
  firstAccessSection.classList.add("hidden");
  returningSection.classList.add("hidden");
  emailInput.disabled = true;
  emailLabel.innerText = "A link to reset password has been sent to:";
  emailConfirmedMessage.innerText = email;
  emailConfirmedMessage.classList.remove("hidden");
  mainButton.classList.add("hidden");
}
function showConfirmationSentUI(email) {
  state = "confirmSent";
  firstAccessSection.classList.add("hidden");
  returningSection.classList.add("hidden");
  emailInput.disabled = true;
  emailLabel.innerText = "A confirmation link has been sent to:";
  emailConfirmedMessage.innerText = email;
  emailConfirmedMessage.classList.remove("hidden");
  mainButton.classList.add("hidden");
}

/* -------------------------
   Forgot password handler
   ------------------------- */
const forgotPassword = document.getElementById("forgotPassword");
if (forgotPassword) {
  forgotPassword.addEventListener("click", async () => {
    const email = emailInput.value.trim().toLowerCase();
    if (!email) {
      errorMessage.innerText = "Please enter your email first.";
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/reset.html",
    });
    if (error) {
      errorMessage.innerText = error.message;
    } else {
      showResetSentUI(email);
    }
  });
}
