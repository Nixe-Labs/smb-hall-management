export interface BookingSummary {
  rent: number
  total_bill: number
  total_advance: number
  balance_collected: number
  total_expenses: number
  total_deposits: number
  pending_balance: number
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
