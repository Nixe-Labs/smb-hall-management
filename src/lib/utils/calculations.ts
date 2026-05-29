import type { AdvancePayment, BillItem, Expense, Deposit } from '@/types/database'
import type { BookingSummary } from '@/types/finance'

/**
 * Total Bill   = Rent + Bill items     (the agreed amount + extras)
 * Total Paid   = Advance + Deposits    (everything the customer has paid)
 * Net Profit   = Total Bill − Expenses
 * Pending Bal. = max(Total Bill − Total Paid, 0)
 */
export function calculateBookingSummary(
  rent: number,
  advances: AdvancePayment[],
  billItems: BillItem[],
  expenses: Expense[],
  deposits: Deposit[]
): BookingSummary {
  const billItemsTotal = billItems.reduce((sum, item) => sum + Number(item.amount), 0)
  const totalAdvance = advances.reduce((sum, adv) => sum + Number(adv.amount), 0)
  const totalDeposits = deposits.reduce((sum, dep) => sum + Number(dep.amount), 0)
  const totalExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0)

  const totalBill = Number(rent) + billItemsTotal
  const totalPaid = totalAdvance + totalDeposits
  const pendingBalance = Math.max(totalBill - totalPaid, 0)
  const netProfit = totalBill - totalExpenses
  const excessShortage = totalPaid - totalBill // positive = customer overpaid

  return {
    rent: Number(rent),
    total_bill: totalBill,
    bill_items_total: billItemsTotal,
    total_advance: totalAdvance,
    total_deposits: totalDeposits,
    total_paid: totalPaid,
    balance_collected: totalPaid,
    total_expenses: totalExpenses,
    pending_balance: pendingBalance,
    net_profit: netProfit,
    excess_shortage: excessShortage,
  }
}
