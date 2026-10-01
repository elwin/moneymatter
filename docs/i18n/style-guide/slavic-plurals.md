# MoneyMatter – Russian and Slovak plurals

## Plurals

- The app applies your language's plural rules, so shared §7's [0 | 1 | other] does not apply. Frontend: exactly 3 forms, in this order: one | few | many.
  - Russian: one (1, 21, 31…) | few (2–4, 22–24…) | many (0, 5–20, 25–30…). Example: `{count} счёт | {count} счёта | {count} счетов`.
  - Slovak: one (1) | few (2–4) | many (0, 5 and more). Example: `{count} účet | {count} účty | {count} účtov`.
- Every form contains the source's count token ({count} or {n}). In Russian the first slot also shows for 21, 31…, so never a literal `1` or a phrase without the count there.
- Never 2 forms, and never a zero form (`нет счетов | …`, `žiadne účty | …`): 0 takes the third form.
- Backend strings have one form, as shared §7 says.
