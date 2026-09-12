/** sha256 helpers. Artifact integrity depends on these (SEC-2). */

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256File(path: string): Promise<string> {
  return await sha256Hex(await Deno.readFile(path));
}

export async function sha256Text(text: string): Promise<string> {
  return await sha256Hex(new TextEncoder().encode(text));
}
