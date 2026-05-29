# SMB Hall Management — User Guide

A complete how-to for daily users of the SMB Hall Management application.

- **Live app:** https://nixe-labs.github.io/smb-hall-management/
- **Source code:** https://github.com/Nixe-Labs/smb-hall-management

---

## Table of Contents

1. [About This Guide](#1-about-this-guide)
2. [Getting Started](#2-getting-started)
3. [User Roles & What You Can Do](#3-user-roles--what-you-can-do)
4. [Signing In](#4-signing-in)
5. [The Dashboard](#5-the-dashboard)
6. [Managing Bookings](#6-managing-bookings)
7. [Booking Calendar](#7-booking-calendar)
8. [Inside a Booking: Advances, Bills, Expenses, Deposits](#8-inside-a-booking-advances-bills-expenses-deposits)
9. [Generating Invoices (PDF)](#9-generating-invoices-pdf)
10. [Cancelling & Deleting Bookings](#10-cancelling--deleting-bookings)
11. [Reports](#11-reports)
12. [Admin Settings](#12-admin-settings)
13. [Tips & Troubleshooting](#13-tips--troubleshooting)

---

## 1. About This Guide

SMB Hall Management is a web application used to run the day-to-day business of the hall — from taking a booking, recording advance payments and bills, tracking expenses, to generating customer invoices and financial reports.

This guide walks through every screen and function in the order you are most likely to use them.

---

## 2. Getting Started

### What you need
- A modern web browser (Chrome, Safari, Edge, or Firefox).
- A user account created for you by the administrator.
- An internet connection.

### Opening the app
Open the app in your browser:

**https://nixe-labs.github.io/smb-hall-management/**

You will land on the **Sign In** page. Bookmark this link for quick access.

---

## 3. User Roles & What You Can Do

The app uses three roles. Your role determines which buttons and pages you see.

| Role       | Can view | Can create / edit bookings, bills, expenses, deposits | Can delete | Admin settings & user management |
|------------|:--------:|:-----------------------------------------------------:|:----------:|:--------------------------------:|
| **Admin**  | Yes      | Yes                                                   | Yes        | Yes                              |
| **Staff**  | Yes      | Yes                                                   | No         | No                               |
| **Viewer** | Yes      | No                                                    | No         | No                               |

If a button (for example, "New Booking" or "Delete") is not visible to you, it means your role does not allow that action. Ask an admin if you need elevated access.

---

## 4. Signing In

1. On the **Sign In** screen, enter your **email** and **password**.
2. Click **Sign In**.
3. On success, you will be taken to the **Dashboard**. On failure, a red toast will appear at the top-right of the screen describing the problem (wrong password, user not found, etc.).

**Tips**
- Click the small eye icon at the end of the password field to show or hide your password.
- If you forget your password, contact an admin — they can reset it from user management.

---

## 5. The Dashboard

The Dashboard is your home screen. It gives an at-a-glance summary of the hall's performance.

### KPI cards (top row)
- **Total Revenue** — the sum of all bill items from past (completed) bookings that were not cancelled.
- **Total Expenses** — the sum of all expenses ever recorded.
- **Net Profit** — Revenue minus Expenses. Turns green when positive, red when negative.
- **Total Bookings** — count of all non-cancelled bookings, with chips showing how many are Upcoming vs Done.

### Revenue Analytics chart
A bar chart of monthly revenue for the selected year.
- Use the left / right arrow buttons next to the year to move between years.
- You cannot go into the future — the right arrow is disabled for years after the current one.

### This Week panel
A list of all non-cancelled events that fall in the current calendar week (Sunday through Saturday).
- Each card shows the customer name, the date (shown as "Today", "Tomorrow", or the weekday + date), and a status badge.
- Click any event to jump straight to its booking detail.
- Click **View Calendar** to open the calendar page.

---

## 6. Managing Bookings

Open the **Bookings** page from the side navigation. This is the master list of every booking in the system.

### Reading the list
Each row shows:
- **Date** — the function date.
- **Customer** — the customer name.
- **Rent** — the hall rent for that booking (hidden on small screens).
- **Status** — auto-calculated from the date:
  - **Upcoming** — date is in the future.
  - **Today** — date is today.
  - **Completed** — date has passed.
  - **Cancelled** — the booking was cancelled by a user.

Click anywhere on a row to open its details.

### Searching and filtering
- **Search customer** — type a name and press Enter or click the search icon to find bookings for that customer.
- **From date / To date** — narrow the list to a specific date range. Selecting a date applies the filter immediately.
- On mobile, tap **Filters** to open these controls. A small green badge shows how many filters are active.
- Click **Clear** to reset all filters.

### Sorting and paging
- Click any column header (Date, Customer, Rent, Status) to sort.
- Use the pagination bar at the bottom to change rows-per-page (10, 25, 50) and jump between pages.

### Creating a new booking
1. Click **New Booking** (top-right of the Bookings page). *Only admins and staff see this button.*
2. Fill in the form:
   - **Function Date** *(required)* — the date of the function.
   - **Customer Name** *(required)*.
   - **Phone** — optional.
   - **Address** — optional, multi-line.
   - **Rent Amount** *(required)* — enter in Indian Rupees.
   - **Notes** — any additional information (menu, special arrangements, etc.).
3. Click **Create Booking**.

**Important:** The system prevents double-booking. If another non-cancelled booking already exists for the selected date, you will see a "Date Unavailable" warning and the booking will not be saved. Pick another date or cancel the existing booking first.

---

## 7. Booking Calendar

From the sidebar, open the **Calendar** page to see bookings visualised on a monthly calendar.

- Days with confirmed (non-cancelled) bookings are highlighted.
- Click any date to see the bookings for that day listed below the calendar.
- From here, admins and staff can quickly jump to a booking or create a new one.

---

## 8. Inside a Booking: Advances, Bills, Expenses, Deposits

When you click a booking from the list, calendar, or dashboard, the **Booking Details** page opens. This is the heart of day-to-day operations.

### Header
Shows the customer name, function date, phone, the rent, and the current status tag. On the right you will see action buttons (based on your role):
- **Invoice** — generate a PDF invoice (see section 9).
- **Cancel** — cancel this booking (admin/staff, when not already cancelled).
- **Delete** — permanently remove the booking (admin only).

### Financial Summary
A panel that auto-calculates and shows:
- Total advance received.
- Total bill amount.
- Total expenses.
- Total deposits to bank.
- Balance due / balance in hand.

This updates live as you add entries in any of the tabs below.

### Tabs

#### Advances
Record advance payments received from the customer. Up to **three** advances per booking.
- Click **Add Advance** / the edit icon on an existing row.
- For each advance, enter: amount, payment mode (cash / cheque / online), reference or cheque number (if applicable), the bank account it went into, and the date.
- Save to update the booking's financial summary.

#### Bill Items
Line items that make up the final customer bill.
- Click **Add Bill Item**.
- Choose a **category** (e.g. GST Bill, Cleaning, EB, Water, Gas, AC, Room Rent, Generator) — categories are managed in Settings.
- Enter the amount and any note.
- Bill items together form the Revenue for that booking.

#### Expenses
Costs the hall incurred for this booking that are not passed on to the customer.
- Click **Add Expense**.
- Choose an **expense category** (e.g. Ladies Cleaning, Toilet Cleaning, Staff Payments, Tractor).
- Enter the amount, date, and any note.

#### Deposits
Money from the customer that you have deposited into a bank account.
- Click **Add Deposit**.
- Pick the bank account, amount, date, and reference.
- Deposits help you reconcile which money from this booking has actually reached the bank.

Any edit in any tab instantly re-calculates the Financial Summary at the top.

---

## 9. Generating Invoices (PDF)

On the **Booking Details** page, click the **Invoice** button in the header.

- The system builds a PDF containing customer details, the rent, all advance payments, and every bill line item, with totals.
- The PDF downloads to your computer with a filename like `Invoice-<CustomerName>-<Date>.pdf`.
- Open it in any PDF viewer to print or share via email / WhatsApp.

---

## 10. Cancelling & Deleting Bookings

Both actions are available from the **Booking Details** header.

### Cancel (admin & staff)
- Click **Cancel**. A confirmation dialog appears.
- Type **CANCEL** to confirm.
- The booking status becomes **Cancelled**, and the date becomes available for new bookings again.
- Cancelled bookings are kept in the system — they are not deleted. They will no longer count towards revenue, expenses, or booking totals on the dashboard.

### Delete (admin only)
- Click **Delete**. A confirmation dialog appears.
- This is permanent. All related advances, bill items, expenses, and deposits for the booking are deleted as well.
- Prefer **Cancel** unless you specifically want to remove a test or duplicate entry.

---

## 11. Reports

Open **Reports** from the sidebar. This page produces a consolidated financial statement.

1. Optionally pick a **date range** using the date picker. Leave blank to include all bookings.
2. The table lists each booking in the range, with columns for rent, bill total, expenses, advance, etc.
3. A totals row at the top or bottom shows combined revenue, expenses, and advances for the selected range.
4. Use this for monthly, quarterly, or yearly reviews.

---

## 12. Admin Settings

**Settings** is visible only to admins. It is where you configure the lists that every other screen depends on.

### Bill Categories
The pick-list shown when staff add bill items to a booking.
- Add new categories (e.g. "Decoration", "Sound System").
- Rename or deactivate existing ones. Deactivating hides them from future bills but keeps historical records intact.

### Expense Categories
Same as Bill Categories, but for expenses.

### Bank Accounts
The bank accounts used in advances and deposits (e.g. SMB AC, Niranjana AC, Petty Cash).
- Add a new account with a name and short code.
- Deactivate accounts you no longer use.

### User Management
Create and manage the people who log in to this app.
- See each user's email, role (Admin / Staff / Viewer), and creation date.
- Change a user's role from the role dropdown.
- Promote a staff member to admin, or downgrade a former admin to viewer as needed.
- Only admins can reach this page.

**Rule of thumb**
- Give **Viewer** to anyone who just needs to look at the numbers.
- Give **Staff** to front-desk and operations people who take bookings and record money.
- Keep **Admin** restricted to owners / senior management.

---

## 13. Tips & Troubleshooting

**I clicked something and nothing happened.**
Look at the top-right corner of the screen — the system shows a toast message there (success in green, warning in orange, error in red) for every action.

**"Date Unavailable" when creating a booking.**
Another booking already exists for that date and has not been cancelled. Open the Bookings list, filter by that date, and either cancel the existing booking or pick a different date.

**I can't see a button someone else can see.**
It is almost always a role issue. Ask an admin to check your role in User Management.

**The dashboard numbers look wrong.**
- **Revenue** counts only **past** bookings (function date before today) that are **not cancelled**.
- **Total Bookings** excludes cancelled ones.
- If you just added a bill item or expense, refresh the page — the dashboard loads once when you open it.

**A booking won't delete.**
Only admins can delete. Staff should use **Cancel** instead.

**Printing a PDF invoice.**
Click **Invoice**, open the downloaded PDF, and print from your PDF viewer.

**Logging out.**
Use the logout option in the top-right user menu.

---

*SMB Hall Management — internal user guide. For technical issues, contact your system administrator.*

**Links**
- Live app: https://nixe-labs.github.io/smb-hall-management/
- GitHub repository: https://github.com/Nixe-Labs/smb-hall-management
