# Gift Card & Voucher Admin Panel

## Experience
- Replace the template home with a responsive admin workspace inspired by the supplied reference, using the requested white-and-blue palette and four-item sidebar.
- Provide Dashboard, Gift Cards, Transactions, and Settings views with database-backed totals, recent activity, masked voucher codes, search/status filters, card details, single/bulk CSV import, status changes, and balance adjustment dialogs.
- Provide email/password sign-in only, no in-app registration, admin account details, password change, and logout.

## Secure data behavior
- Use Lovable Cloud and exactly three application tables: `admins`, `gift_cards`, and immutable `transactions`.
- Restrict all app data to authorized admin accounts. Use database-validated functions for card creation, status changes, and balance adjustments; each credit/debit and its ledger row commit atomically.
- Enforce unique serials and voucher codes, positive Naira amounts, no negative balances, no inactive-card deductions, and automatic depleted/active status transitions.
- Dashboard and transaction history read persisted records; do not add demo data.

## Technical approach
- Add a migration with RLS, grants, admin authorization, and narrowly scoped database functions; keep table writes behind those functions.
- Build the UI in the existing TanStack Start routes and design tokens, and add focused tests for client-side CSV validation and number formatting.
- Keep initial administrator provisioning outside public signup: accounts are created through Lovable Cloud user management and their authorized admin row is provisioned privately.
