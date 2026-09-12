export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPriceOere: number;
}

/** Our invoice totals are in øre and VAT is applied per line, not to the sum. */
export function lineTotalOere(line: InvoiceLine, vatRate: number): number {
  const net = line.quantity * line.unitPriceOere;
  return net + Math.round(net * vatRate);
}
