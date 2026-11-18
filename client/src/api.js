// Talking to the app's own server. Errors carry the server's plain-words reason.

export async function api(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

export const post = (path, body) => api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });

export function upload(path, field, file) {
  const form = new FormData();
  form.append(field, file);
  return api(path, { method: "POST", body: form });
}
