// Declares one host, tries another. The grant must not help it.
export default async function (input: { url: string }) {
  const res = await fetch(input.url);
  return { status: res.status };
}
