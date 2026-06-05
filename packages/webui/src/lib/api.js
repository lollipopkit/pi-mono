const BASE = '/api';

export async function getSettings(scope = 'global') {
  const res = await fetch(`${BASE}/settings?scope=${scope}`);
  return res.json();
}

export async function updateSettings(scope, settings) {
  const res = await fetch(`${BASE}/settings?scope=${scope}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  });
  return res.json();
}

export async function getSkills() {
  const res = await fetch(`${BASE}/skills`);
  return res.json();
}

export async function getExtensions() {
  const res = await fetch(`${BASE}/extensions`);
  return res.json();
}

export async function getModels() {
  const res = await fetch(`${BASE}/models`);
  return res.json();
}

export async function getAuth() {
  const res = await fetch(`${BASE}/auth`);
  return res.json();
}

export async function setAuthProvider(provider, credential) {
  const res = await fetch(`${BASE}/auth/${provider}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credential)
  });
  return res.json();
}

export async function deleteAuthProvider(provider) {
  const res = await fetch(`${BASE}/auth/${provider}`, { method: 'DELETE' });
  return res.json();
}