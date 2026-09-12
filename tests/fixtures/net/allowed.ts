// Reaches exactly the host its descriptor declares.
export default async function (input: { url: string }) {
  const res = await fetch(input.url);
  return { status: res.status, body: (await res.text()).slice(0, 200) };
}
