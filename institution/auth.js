/**
 * institution/auth.js
 *
 * Signs a teacher in with the email and password created for their institution,
 * then guards the library and mock-test pages behind that session.
 *
 * Accounts are made by hand in the Firebase console. There is no sign-up path:
 * every user in the project was put there deliberately.
 *
 * Firebase is imported on first use rather than at the top of the file, so the
 * panel still validates and explains itself if the CDN is slow or blocked.
 */

const FIREBASE_VERSION = "11.0.2";
const SDK = "https://www.gstatic.com/firebasejs/" + FIREBASE_VERSION;

/* Keys are read from /institution/config.json at runtime, so changing them never
   needs a rebuild. The file is public by design: Firebase keeps the door shut
   with security rules, not with a secret key. */
const CONFIG_URL = "/institution/config.json";
let configPromise = null;

function config() {
  if (!configPromise) {
    configPromise = fetch(CONFIG_URL, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((raw) => {
        if (!raw) return null;
        const values = {};
        for (const key of ["apiKey", "authDomain", "projectId", "appId"]) {
          const value = typeof raw[key] === "string" ? raw[key].trim() : "";
          if (!value || /^PASTE|^<|^YOUR_/i.test(value) || /...your-/.test(value)) return null;
          values[key] = value;
        }
        values.storageBucket = (raw.storageBucket || values.projectId + ".appspot.com").trim();
        return values;
      });
  }
  return configPromise;
}

const LOGIN_PATH = "/institution/login.html";
const HOME_PATH = "/institution/";
const SESSION_KEY = "axomexam-session";

const $ = (id) => document.getElementById(id);
const isLoginPage = /\/login\.html$/.test(location.pathname);

let sdkPromise = null;

/* Loads the two Firebase modules we need and returns a small handle. */
function firebase() {
  if (!sdkPromise) {
    sdkPromise = Promise.all([
      config(),
      import(SDK + "/firebase-app.js"),
      import(SDK + "/firebase-auth.js"),
    ]).then(([cfg, appMod, authMod]) => {
      if (!cfg) throw new Error("not-configured");
      const app = appMod.initializeApp(cfg);
      return { auth: authMod.getAuth(app), mod: authMod };
    });
  }
  return sdkPromise;
}

/* Firebase reports the same failure for a wrong password and an unknown email,
   which is what we want — it stops anyone probing for valid addresses. */
const MESSAGES = {
  "auth/invalid-credential": "That email and password do not match an institution account.",
  "auth/wrong-password": "That email and password do not match an institution account.",
  "auth/user-not-found": "That email and password do not match an institution account.",
  "auth/invalid-email": "That does not look like an email address.",
  "auth/user-disabled": "This account has been switched off. Write to us from your institution email.",
  "auth/too-many-requests": "Too many attempts. Wait a minute, then try again.",
  "auth/network-request-failed": "No connection. Check your internet and try again.",
  "auth/operation-not-allowed": "Email sign-in is not switched on for this project yet.",
  "auth/api-key-not-valid": "Sign-in is not configured yet. The site owner needs to paste the Firebase keys.",
};

function say(text) {
  const box = $("err");
  const slot = $("err-text");
  if (!box || !slot) return;
  slot.textContent = text;
  box.classList.add("on");
  const email = $("email");
  if (email) email.setAttribute("aria-invalid", "true");
}

function quiet() {
  const box = $("err");
  if (box) box.classList.remove("on");
  ["email", "pw"].forEach((id) => {
    const el = $(id);
    if (el) el.removeAttribute("aria-invalid");
  });
}

function busy(on) {
  const btn = $("go");
  const tx = $("go-tx");
  if (!btn || !tx) return;
  btn.disabled = on;
  tx.textContent = on ? "Signing in" : "Sign in";
  let sp = btn.querySelector(".spin");
  if (on && !sp) {
    sp = document.createElement("span");
    sp.className = "spin";
    btn.prepend(sp);
  } else if (!on && sp) {
    sp.remove();
  }
}

/* ---------- login page ---------- */

function wireLogin() {
  const eye = $("eye");
  if (eye) {
    eye.addEventListener("click", () => {
      const pw = $("pw");
      const shown = pw.type === "text";
      pw.type = shown ? "password" : "text";
      eye.setAttribute("aria-pressed", String(!shown));
      eye.setAttribute("aria-label", shown ? "Show password" : "Hide password");
      eye.innerHTML = shown ? EYE : EYE_OFF;
      pw.focus();
    });
  }

  ["email", "pw"].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener("input", () => {
      el.removeAttribute("aria-invalid");
      quiet();
    });
  });

  const form = $("f");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    quiet();

    const email = ($("email").value || "").trim();
    const pw = $("pw").value || "";

    if (!email) { say("Enter your institution email."); $("email").focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { say("That does not look like an email address."); $("email").focus(); return; }
    if (!pw) { say("Enter your password."); $("pw").focus(); return; }

    const cfg = await config();
    if (!cfg) {
      say("Sign-in is not set up yet. Add the keys to institution/config.json.");
      return;
    }

    busy(true);
    try {
      const { auth, mod } = await firebase();
      await mod.setPersistence(auth, mod.browserLocalPersistence);
      await mod.signInWithEmailAndPassword(auth, email, pw);
      try { sessionStorage.setItem(SESSION_KEY, email); } catch (err) {}
      location.replace(HOME_PATH);
    } catch (err) {
      busy(false);
      say(MESSAGES[err && err.code] || "Could not sign you in. Try again in a moment.");
      const pwEl = $("pw");
      if (pwEl) pwEl.select();
    }
  });
}

if (isLoginPage) wireLogin();

/* ---------- guard on library and mock-test pages ---------- */

export async function guard() {
  if (!(await config())) return null;
  const { auth, mod } = await firebase();
  return new Promise((resolve) => {
    mod.onAuthStateChanged(auth, (user) => {
      if (!user) {
        location.replace(LOGIN_PATH + "?next=" + encodeURIComponent(location.pathname));
        return;
      }
      const out = document.getElementById("axo-signout");
      if (out) {
        const who = document.getElementById("axo-who");
        if (who) who.textContent = user.email || "";
        out.hidden = false;
        out.addEventListener("click", async () => {
          await mod.signOut(auth);
          location.replace(LOGIN_PATH);
        });
      }
      resolve(user);
    });
  });
}

/* Reads a protected PDF through the signed-in user's token and hands the bytes
   to the browser as a blob. Firebase never returns a public URL this way, so the
   file cannot be forwarded to someone who is not signed in. */
export async function downloadPdf(storagePath, filename) {
  const [{ auth }, storageMod] = await Promise.all([
    firebase(),
    import(SDK + "/firebase-storage.js"),
  ]);
  if (!auth.currentUser) throw new Error("not signed in");

  const ref = storageMod.ref(storageMod.getStorage(auth.app), storagePath);
  const blob = await storageMod.getBlob(ref);

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "axomexam.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
