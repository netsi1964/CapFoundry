export default async function () {
  return { secret: await Deno.readTextFile("/etc/hostname") };
}
