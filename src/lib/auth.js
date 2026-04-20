import {
  CUSTOMER_KEY,
  PORTAL_SESSION_KEY,
  SESSION_KEY,
  STAFF_KEY,
  SUPA_KEY,
  SUPA_URL,
} from "./config";
import { authLogout, authPasswordSignIn, select } from "./supabase";

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  if (value == null) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, JSON.stringify(value));
}

export function getOperatorSession() {
  const session = readJson(SESSION_KEY);
  if (!session) return null;
  if (session.expires_at && Date.now() / 1000 > session.expires_at) {
    clearOperatorSession();
    return null;
  }
  return session;
}

export function getPortalSession() {
  return readJson(PORTAL_SESSION_KEY);
}

export function getStoredStaff() {
  return readJson(STAFF_KEY);
}

export function getStoredCustomer() {
  return readJson(CUSTOMER_KEY);
}

export function clearOperatorSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(STAFF_KEY);
}

export async function signIn(email, password) {
  const authData = await authPasswordSignIn(email, password);

  const session = {
    access_token: authData.access_token,
    refresh_token: authData.refresh_token,
    expires_at: authData.expires_at || Math.floor(Date.now() / 1000) + 3600,
    user: authData.user,
  };

  const staff = await select(
    "staff",
    `?auth_user_id=eq.${authData.user.id}&select=staff_id,name,role,email,active,org_id&limit=1`,
    authData.access_token,
  ).catch(() => []);

  if (staff?.length && staff[0].active) {
    writeJson(SESSION_KEY, session);
    writeJson(STAFF_KEY, { ...staff[0], _user_id: authData.user.id });
    return { kind: "operator" };
  }

  const customerResponse = await fetch(
    `${SUPA_URL}/rest/v1/customers?auth_user_id=eq.${authData.user.id}&select=customer_id,full_name,email&limit=1`,
    {
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${authData.access_token}`,
      },
    },
  );
  const customers = await customerResponse.json();

  if (customerResponse.ok && customers?.length) {
    writeJson(PORTAL_SESSION_KEY, session);
    writeJson(CUSTOMER_KEY, { ...customers[0], _user_id: authData.user.id });
    return { kind: "customer" };
  }

  throw new Error("Account not found. Contact your system administrator.");
}

export async function signOut() {
  const session = getOperatorSession();
  if (session?.access_token) {
    try {
      await authLogout(session.access_token);
    } catch {
      // Best effort logout.
    }
  }
  clearOperatorSession();
}
