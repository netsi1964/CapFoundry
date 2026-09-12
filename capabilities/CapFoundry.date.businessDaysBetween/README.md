# CapFoundry.date.businessDaysBetween

Counts working days between two dates.

```json
{ "from": "2026-09-07", "to": "2026-09-11" }
→ { "businessDays": 4, "calendarDays": 5, "weekendDays": 0, "holidayDays": 0, "reversed": false }
```

## The ambiguity, resolved

"Business days between" means different things to different people, so the contract pins it down:

| Question                       | Answer                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Are endpoints counted?         | Half-open `[from, to)` by default. Monday→Friday is **4**. `inclusive: true` gives **5**.                   |
| What if `to` is before `from`? | Counts come back **negative** and `reversed` is true, so the result composes like a signed difference.      |
| Which days are weekend?        | Saturday and Sunday by default; `weekend` is configurable, because much of the world works Sunday–Thursday. |
| Where do holidays come from?   | **You supply them.**                                                                                        |
| Timezone?                      | Always UTC.                                                                                                 |

## Why no built-in holidays

Embedding a holiday table would embed a jurisdiction, and a wrong holiday table is worse than no
holiday table — it produces confidently wrong SLA dates. Holidays are an input.

A holiday falling on a weekend is counted once, as a weekend day, so the breakdown always sums back
to `calendarDays`.

## Why UTC

Local time would make the answer depend on the machine. For a capability whose entire value is being
reproducible, that is disqualifying.
