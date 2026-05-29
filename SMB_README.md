# SMB Hall Management

A full-featured marriage hall management system built for SMB (Sri Murugan Bhavan) to handle bookings, billing, expenses, deposits, and financial reporting — all in one place.

**GitHub:** [https://github.com/Nixe-Labs/smb-hall-management](https://github.com/Nixe-Labs/smb-hall-management)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | [Vue 3](https://vuejs.org/) + [TypeScript](https://www.typescriptlang.org/) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) + [PrimeVue 4](https://primevue.org/) |
| State Management | [Pinia](https://pinia.vuejs.org/) |
| Routing | [Vue Router 4](https://router.vuejs.org/) |
| Backend / DB | [Supabase](https://supabase.com/) (PostgreSQL + Auth + RLS) |
| Charts | [ApexCharts](https://apexcharts.com/) via vue3-apexcharts |
| PDF Export | [pdfmake](https://pdfmake.github.io/docs/) |
| Build Tool | [Vite 7](https://vitejs.dev/) |

---

## Features

### Bookings
- Create, view, edit, and cancel hall bookings
- Calendar view to visualize booked dates at a glance
- Track booking status: `Upcoming`, `Completed`, `Cancelled`
- Record customer name, phone, address, hall rent, and notes
- Support for up to 3 advance payments per booking (cash / cheque / online)

### Billing
- Add itemised bill entries per booking using configurable bill categories
- Default categories: GST Bill, Cleaning, EB, Water, Gas, AC, Room Rent, Generator, etc.
- Export bills as PDF

### Expenses & Deposits
- Log per-booking expenses against configurable expense categories
- Default categories: Ladies Cleaning, Toilet Cleaning, Staff Payments, Tractor, etc.
- Record bank deposits linked to bookings and bank accounts

### Financial Dashboard
- At-a-glance KPIs: Total Revenue, Total Expenses, Net Profit, Booking Counts
- Monthly revenue bar chart with year selector
- Upcoming events list

### Reports
- Consolidated financial reports across bookings and date ranges

### Settings (Admin only)
- Manage bill categories and expense categories
- Manage bank accounts (SMB AC, Niranjana AC, Petty Cash, etc.)
- User management — create and manage staff accounts

### Role-Based Access Control
| Role | Permissions |
|------|-------------|
| `admin` | Full access including settings and user management |
| `staff` | Create and manage bookings, billing, expenses, deposits |
| `viewer` | Read-only access to all data |

---

## Database Schema

Managed via Supabase migrations (`supabase/migrations/`).

**Core tables:**
- `profiles` — linked to Supabase Auth users, stores role
- `bookings` — hall booking records
- `advance_payments` — up to 3 advance payments per booking
- `bill_items` — itemised bill lines per booking
- `expenses` — per-booking expense entries
- `deposits` — bank deposit records per booking
- `bill_categories` — configurable bill line item types
- `expense_categories` — configurable expense types
- `bank_accounts` — bank accounts for deposits

Row Level Security (RLS) is enforced on all tables. Role checks use `is_admin()` and `is_staff_or_admin()` helper functions.

---

## Getting Started

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com/) project

### Setup

```bash
# Clone the repository
git clone https://github.com/Nixe-Labs/smb-hall-management.git
cd smb-hall-management

# Install dependencies
npm install
```

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Run the migration in your Supabase project (via the Supabase SQL editor or CLI):

```bash
# Using Supabase CLI
supabase db push
```

### Development

```bash
npm run dev
```

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

---

## Project Structure

```
src/
├── components/       # Reusable UI components (booking, dashboard, finance, settings)
├── composables/      # Vue composables / shared logic
├── layouts/          # App shell layouts (Default, Auth)
├── lib/              # Supabase client, utilities
├── pages/            # Route-level page components
│   ├── auth/         # Login
│   ├── bookings/     # List, Calendar, Create, Detail
│   ├── dashboard/    # Dashboard with KPIs and charts
│   ├── reports/      # Financial reports
│   └── settings/     # Admin settings pages
├── router/           # Vue Router configuration with auth guards
├── stores/           # Pinia state stores
└── types/            # TypeScript types and enums
supabase/
└── migrations/       # SQL migration files
```

---

## License

Private — All rights reserved. Built and maintained by [Nixe Labs](https://github.com/Nixe-Labs).
