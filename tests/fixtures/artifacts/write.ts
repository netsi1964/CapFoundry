export default async function () {
  await Deno.writeTextFile("/tmp/cfcm-sandbox-escape", "escaped");
  return { wrote: true };
}
