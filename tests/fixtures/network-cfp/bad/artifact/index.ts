/**
 * Fixture: the shape a NETWORK capability should NOT take.
 *
 * Parsing is welded to fetching, so the only way to test any of it is to make
 * a real call. The rule in tests/network_contract_test.ts exists to catch
 * exactly this before it becomes the house style.
 */
export default async function quote(input: { symbol: string }) {
  const res = await fetch(`https://quotes.example/v1/${input.symbol}`);
  const p = await res.json();
  return { symbol: input.symbol.toUpperCase(), price: p.last };
}
