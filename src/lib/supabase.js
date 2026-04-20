import { SUPA_KEY, SUPA_URL } from "./config";

export async function supabaseRequest(path, { method = "GET", body, token } = {}) {
  const response = await fetch(`${SUPA_URL}${path}`, {
    method,
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${token || SUPA_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.message || data?.error_description || `Supabase error ${response.status}`);
  }

  return data;
}

export function select(table, query = "", token) {
  return supabaseRequest(`/rest/v1/${table}${query}`, { token });
}

export function authPasswordSignIn(email, password) {
  return supabaseRequest("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
}

export function authLogout(token) {
  return supabaseRequest("/auth/v1/logout", {
    method: "POST",
    token,
  });
}
