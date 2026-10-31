/** Same-origin owner API. The token authorizes browser writes, not remote users. */
export async function ownerRequest(url, token, body, method = 'POST') {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-Skill-Library-Token': token }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? 'The request failed. Refresh and retry.');
  return data;
}
