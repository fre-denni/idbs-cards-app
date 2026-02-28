import { supabase } from "./supabaseClient.js";

const form = document.getElementById("authForm");
const emailInput = document.getElementById("emailInput");
const errorMessage = document.getElementById("errorMessage");
const mainButton = document.getElementById("mainButton");

const firstAccessSection = document.getElementById("firstAccessSection");
const returningSection = document.getElementById("returningSection");

let currentStudent = null;
let state = "email"; // email | firstAccess | returning
let isLoading = false;

(async () => {
  const { data } = await supabase.auth.getSession();

  if (data.session) {
    const { data: student } = await supabase
      .from("students")
      .select("*")
      .eq("auth_user_id", data.session.user.id)
      .single();

    if (student.role === "admin") {
      window.location.href = "/admin.html";
    } else {
      window.location.href = "/dashboard.html";
    }
  }
})();

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (isLoading) return; // prevent double click
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

async function handleEmailCheck() {
  errorMessage.innerText = "";

  const email = emailInput.value.trim().toLowerCase();

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

  if (!data.auth_user_id) {
    state = "firstAccess";
    showFirstAccess();
  } else {
    state = "returning";
    showReturning();
  }

  mainButton.innerText = "Sign In";
}

function showFirstAccess() {
  firstAccessSection.classList.remove("hidden");
  returningSection.classList.add("hidden");
}

function showReturning() {
  returningSection.classList.remove("hidden");
  firstAccessSection.classList.add("hidden");
}

async function completeFirstAccess() {
  const password = document.getElementById("passwordInput").value;
  const name = document.getElementById("nameInput").value;

  if (password.length < 8) {
    errorMessage.innerText = "Password must be at least 8 characters";
    return;
  }

  const { data, error } = await supabase.auth.signUp({
    email: currentStudent.email,
    password,
  });

  if (error) {
    errorMessage.innerText = error.message;
    return;
  }

  await supabase
    .from("students")
    .update({
      auth_user_id: data.user.id,
      name: name,
    })
    .eq("id", currentStudent.id);

  redirectUser();
}

async function loginReturningUser() {
  const password = document.getElementById("passwordInputReturning").value;

  const { error } = await supabase.auth.signInWithPassword({
    email: currentStudent.email,
    password,
  });

  if (error) {
    errorMessage.innerText = "Wrong password";
    return;
  }

  redirectUser();
}

function redirectUser() {
  if (currentStudent.role === "admin") {
    window.location.href = "/admin.html";
  } else {
    window.location.href = "/dashboard.html";
  }
}

function setLoading(status) {
  isLoading = status;

  if (status) {
    mainButton.disabled = true;
    mainButton.dataset.originalText = mainButton.innerText;
    mainButton.innerText = "Loading...";
  } else {
    mainButton.disabled = false;
    mainButton.innerText = mainButton.dataset.originalText || "Check Email";
  }
}
