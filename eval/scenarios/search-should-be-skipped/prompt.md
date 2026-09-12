In invoice.ts, our VAT is applied per line and rounded per line, which makes our totals disagree
with the accountant's by a few øre on large invoices. Change it so VAT is calculated on the summed
net amount instead, rounding once. Add an invoiceTotalOere function that takes the lines and the
rate.
