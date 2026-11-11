# Gift Card Vault

# BUILD A SIMPLE GIFT CARD & VOUCHER ADMIN PANEL

Build a lightweight, professional, admin-only Gift Card and Voucher Management Dashboard.

The purpose of this application is to allow an administrator to upload gift cards, manage their voucher codes, assign Naira values, add money, deduct money, and monitor card balances.

Do not overcomplicate the application. Keep the interface simple and the functionality focused.

## 1. DESIGN

Create a clean, modern admin dashboard.

- White background.
- Blue primary colour.
- Simple sidebar.
- Clean tables.
- Minimal cards and buttons.
- Responsive on desktop and mobile.

## 2. SIDEBAR

Only four navigation items:

1. Dashboard
2. Gift Cards
3. Transactions
4. Settings

## 3. DASHBOARD

Display these statistics:

- Total Cards
- Activated Cards
- Total Active Balance (₦)
- Total Amount Added (₦)
- Total Amount Deducted (₦)

Below the statistics, show:
- Recently added cards.
- Recent transactions.

All figures must come from the actual database.

## 4. GIFT CARDS

Create a page where the administrator can manage all gift cards.

Each card must have:

- Serial Number (unique)
- Voucher Code (unique)
- Initial Amount (₦)
- Current Balance (₦)
- Status (Active, Inactive, Depleted)
- Date Created

Provide two ways to add cards:

**Single Card:** A simple form to enter the serial number, voucher code, and card amount.

**Bulk Upload:** Allow uploading a CSV file containing serial number, voucher code, and amount.

Include:
- Search by serial number or voucher code.
- Filter by card status.
- View card details.
- Activate or deactivate cards.

## 5. CARD BALANCE MANAGEMENT

Each card should have two actions:

**Add Money**
- Display card serial number.
- Display current balance.
- Enter amount to add.
- Confirm.

**Deduct Money**
- Display card serial number.
- Display current balance.
- Enter amount to deduct.
- Confirm.

After every successful operation, update the card's current balance automatically.

Never allow deductions above the available balance.

Automatically mark a card as Depleted when its balance reaches zero. If money is added again, reactivate it.

## 6. TRANSACTIONS

Create a simple transaction history table.

Display:

- Transaction Reference
- Card Serial Number
- Transaction Type (Initial Credit, Money Added, Money Deducted)
- Amount (₦)
- Previous Balance
- New Balance
- Date and Time

Every card addition and deduction must automatically generate a transaction record.

Transactions should not be editable or permanently deletable.

## 7. SETTINGS

Keep settings minimal:

- Admin account details.
- Change password.
- Logout.

Only authorized administrators can access the application. No public registration.

## 8. DATABASE

Use Supabase for database and authentication.

Create only three essential tables:

**1. gift_cards**
- id
- serial_number
- voucher_code
- initial_amount
- current_balance
- status
- created_at

**2. transactions**
- id
- gift_card_id
- transaction_reference
- transaction_type
- amount
- previous_balance
- new_balance
- description
- created_at

**3. admins**
- id
- email
- role

Use secure database operations for balance changes. Ensure each balance update and its transaction record are saved together.

## 9. IMPORTANT REQUIREMENTS

- All amounts must be in Nigerian Naira (₦).
- Serial numbers must be unique.
- Voucher codes must be unique.
- No negative balances.
- No deductions from inactive cards.
- No duplicate card uploads.
- Every balance adjustment must be recorded.
- Protect the admin dashboard with authentication.
- Mask voucher codes by default.
- Dashboard statistics must update automatically.

## 10. DO NOT BUILD

- Customer accounts.
- Customer dashboard.
- Payment gateway.
- Online purchases.
- Public voucher redemption.
- Customer wallets.
- Marketing features.
- Advanced analytics.
- Complicated financial reporting.

Build only what is described above.

The final result should be a simple, functional Gift Card and Voucher Admin Panel, not a large enterprise application.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/dacfa370-a7b5-4a93-b1a0-e0ca765edc5f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
