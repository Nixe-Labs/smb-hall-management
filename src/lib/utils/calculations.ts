import type { AdvancePayment, BillItem, Expense, Deposit } from '@/types/database'
import type { BookingSummary } from '@/types/finance'

export function calculateBookingSummary(
  rent: number,
  advances: AdvancePayment[],
  billItems: BillItem[],
  expenses: Expense[],
  deposits: Deposit[]
): BookingSummary {
  const totalBill = billItems.reduce((sum, item) => sum + item.amount, 0) || rent
  const totalAdvance = advances.reduce((sum, adv) => sum + adv.amount, 0)
  const balanceCollected = totalBill - totalAdvance
  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0)
  const totalDeposits = deposits.reduce((sum, dep) => sum + dep.amount, 0)
  const pendingBalance = balanceCollected - totalExpenses
  const excessShortage = totalDeposits - pendingBalance

  return {
    rent,
    total_bill: totalBill,
    total_advance: totalAdvance,
    balance_collected: balanceCollected,
    total_expenses: totalExpenses,
    total_deposits: totalDeposits,
    pending_balance: pendingBalance,
    excess_shortage: excessShortage,
  }
}
