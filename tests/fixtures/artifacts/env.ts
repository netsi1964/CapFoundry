export default function () {
  return { home: Deno.env.get("CFCM_SECRET_CANARY") ?? null };
}
