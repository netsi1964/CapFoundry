export default async function () {
  const res = await fetch("https://example.com");
  return { status: res.status };
}
