export interface BookingSummary {
  rent: number
  total_bill: number
  bill_items_total: number
  total_advance: number
  total_deposits: number
  total_paid: number
  balance_collected: number
  total_expenses: number
  pending_balance: number
  net_profit: number
  excess_shortage: number
}

export interface DashboardStats {
  total_revenue: number
  total_expenses: number
  net_profit: number
  total_bookings: number
  completed_bookings: number
  upcoming_bookings: number
}

export interface MonthlyRevenue {
  month: string
  revenue: number
  expenses: number
  profit: number
  bookings: number
}

export interface CategoryBreakdown {
  category_name: string
  total_amount: number
  percentage: number
}
