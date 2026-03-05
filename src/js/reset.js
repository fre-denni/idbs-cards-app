import { supabase } from "./supabaseClient.js";

const form = document.getElementById("resetForm");
const message = document.getElementById("message");

async function init() {
  // prova a estrarre la sessione dalla URL (caso conferma / reset)
  try {
    const { data: urlData, error: urlError } =
      await supabase.auth.getSessionFromUrl({ storeSession: true });
    if (urlError) {
      console.log("getSessionFromUrl reset:", urlError.message || urlError);
    }
  } catch (e) {
    console.log("getSessionFromUrl reset exception:", e);
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    message.innerText =
      "Invalid or expired recovery link. Please request a new one.";
  }
}

init();

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const password = document.getElementById("newPassword").value;

  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    message.innerText = error.message;
    return;
  }

  message.innerText = "Password updated successfully!";
});
