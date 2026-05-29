import type { TDocumentDefinitions, Content, ContentTable } from 'pdfmake/interfaces'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import { FORECAST_BUCKET_LABEL, type BucketMode, type ForecastTotals } from '@/lib/utils/forecast'

export interface ReportBookingRow {
  function_date: string
  customer_name: string
  customer_phone: string | null
  status: string
  total_bill: number
  total_advance: number
  total_deposits: number
  total_paid: number
  pending: number
  total_expenses: number
  profit: number
  payment_status: 'paid' | 'partial' | 'unpaid'
}

export interface CategoryBreakdownRow {
  name: string
  amount: number
  count: number
}

export interface BankBreakdownRow {
  name: string
  advance: number
  deposit: number
  total: number
}

export interface ReportTotals {
  revenue: number
  expenses: number
  collected: number
  advance: number
  deposits: number
  pending: number
  profit: number
  marginPct: number
}

export interface ReportFilterSummary {
  dateLabel: string
  search: string
  statuses: string[]
  paymentStatuses: string[]
}

export interface ReportData {
  filters: ReportFilterSummary
  totals: ReportTotals
  forecast: ForecastTotals
  forecastMode: BucketMode
  billsByCategory: CategoryBreakdownRow[]
  expensesByCategory: CategoryBreakdownRow[]
  collectedByBank: BankBreakdownRow[]
  bookings: ReportBookingRow[]
}

const COLOR_INK = '#1a1a1a'
const COLOR_ASH = '#666666'
const COLOR_RED = '#c0392b'
const COLOR_ACCENT = '#b5651d'
const COLOR_RULE = '#cccccc'

function rightCell(text: string, opts: { bold?: boolean; color?: string } = {}): Content {
  return { text, alignment: 'right' as const, bold: opts.bold, color: opts.color }
}

function sectionHeader(text: string): Content {
  return { text, style: 'sectionHeader', margin: [0, 18, 0, 8] as [number, number, number, number] }
}

function rule(): Content {
  return {
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: COLOR_RULE }],
    margin: [0, 2, 0, 10] as [number, number, number, number],
  }
}

function emptyRow(colspan: number, message: string): Content[] {
  // colSpan needs (colspan - 1) empty siblings per pdfmake's table model.
  // The strict type doesn't expose colSpan, so we cast just this cell.
  const firstCell = { text: message, colSpan: colspan, color: COLOR_ASH, italics: true, alignment: 'center' as const } as unknown as Content
  return [firstCell, ...(Array(Math.max(colspan - 1, 0)).fill('') as Content[])]
}

export function buildReportDocument(data: ReportData): TDocumentDefinitions {
  const { filters, totals, forecast, forecastMode, billsByCategory, expensesByCategory, collectedByBank, bookings } = data

  // ---- Header / filters strip ----
  const filterChips: string[] = []
  if (filters.search.trim()) filterChips.push(`Search: "${filters.search.trim()}"`)
  if (filters.statuses.length > 0) filterChips.push(`Status: ${filters.statuses.join(', ')}`)
  if (filters.paymentStatuses.length > 0) filterChips.push(`Payment: ${filters.paymentStatuses.join(', ')}`)
  const filterLine = filterChips.length > 0 ? filterChips.join('  ·  ') : 'No additional filters'

  const header: Content[] = [
    { text: 'SMB Marriage Hall', style: 'hallName' },
    { text: 'Financial Report', style: 'reportTitle', margin: [0, 4, 0, 14] as [number, number, number, number] },
    {
      columns: [
        {
          width: '*',
          stack: [
            { text: 'Period', style: 'metaLabel' },
            { text: filters.dateLabel, style: 'metaValue' },
          ],
        },
        {
          width: '*',
          stack: [
            { text: 'Filters', style: 'metaLabel' },
            { text: filterLine, style: 'metaValue' },
          ],
        },
        {
          width: 'auto',
          stack: [
            { text: 'Generated', style: 'metaLabel', alignment: 'right' as const },
            { text: new Date().toLocaleString('en-IN'), style: 'metaValue', alignment: 'right' as const },
          ],
        },
      ],
      margin: [0, 0, 0, 16] as [number, number, number, number],
    },
    rule(),
  ]

  // ---- KPI summary ----
  const kpiTable: ContentTable = {
    table: {
      widths: ['*', '*', '*', '*'],
      body: [
        [
          { stack: [{ text: 'REVENUE', style: 'kpiLabel' }, { text: formatCurrency(totals.revenue), style: 'kpiNum' }] },
          { stack: [{ text: 'COLLECTED', style: 'kpiLabel' }, { text: formatCurrency(totals.collected), style: 'kpiNum', color: COLOR_ACCENT }] },
          { stack: [{ text: 'EXPENSES', style: 'kpiLabel' }, { text: formatCurrency(totals.expenses), style: 'kpiNum', color: COLOR_RED }] },
          { stack: [{ text: 'NET PROFIT', style: 'kpiLabel' }, { text: formatCurrency(totals.profit), style: 'kpiNum', color: totals.profit >= 0 ? COLOR_ACCENT : COLOR_RED }] },
        ],
        [
          { text: `${bookings.length} bookings`, style: 'kpiFoot' },
          { text: `Advance ${formatCurrency(totals.advance)}  ·  Deposits ${formatCurrency(totals.deposits)}`, style: 'kpiFoot' },
          { text: totals.revenue > 0 ? `${Math.round((totals.expenses / totals.revenue) * 100)}% of revenue` : '—', style: 'kpiFoot' },
          { text: `${totals.marginPct}% margin  ·  Pending ${formatCurrency(totals.pending)}`, style: 'kpiFoot' },
        ],
      ],
    },
    layout: 'noBorders',
  }

  // ---- Forecast strip ----
  const modeLabel = forecastMode === 'calendar' ? 'Calendar' : 'Rolling'
  const forecastTable: ContentTable = {
    table: {
      widths: ['*', '*', '*', '*', '*'],
      body: [
        [
          { stack: [{ text: FORECAST_BUCKET_LABEL.overdue.toUpperCase(), style: 'kpiLabel' }, { text: formatCurrency(forecast.overdue), style: 'fcNum', color: forecast.overdue > 0 ? COLOR_RED : COLOR_INK }, { text: `${forecast.counts.overdue} owing`, style: 'kpiFoot' }] },
          { stack: [{ text: FORECAST_BUCKET_LABEL.this_week.toUpperCase(), style: 'kpiLabel' }, { text: formatCurrency(forecast.this_week), style: 'fcNum' }, { text: `${forecast.counts.this_week} owing`, style: 'kpiFoot' }] },
          { stack: [{ text: FORECAST_BUCKET_LABEL.this_month.toUpperCase(), style: 'kpiLabel' }, { text: formatCurrency(forecast.this_month), style: 'fcNum' }, { text: `${forecast.counts.this_month} owing`, style: 'kpiFoot' }] },
          { stack: [{ text: FORECAST_BUCKET_LABEL.this_year.toUpperCase(), style: 'kpiLabel' }, { text: formatCurrency(forecast.this_year), style: 'fcNum' }, { text: `${forecast.counts.this_year} owing`, style: 'kpiFoot' }] },
          { stack: [{ text: 'TOTAL OWED', style: 'kpiLabel' }, { text: formatCurrency(forecast.total_owed), style: 'fcNum', color: COLOR_ACCENT }, { text: `${forecast.bookings_with_target} on forecast`, style: 'kpiFoot' }] },
        ],
      ],
    },
    layout: 'noBorders',
  }

  // ---- Bills by category ----
  const billRows: Content[][] = billsByCategory.length === 0
    ? [emptyRow(3, 'No bill items in this period.')]
    : billsByCategory.map(c => [
        c.name,
        { text: String(c.count), alignment: 'right' as const, color: COLOR_ASH },
        rightCell(formatCurrency(c.amount)),
      ])
  const billsTotal = billsByCategory.reduce((s, c) => s + c.amount, 0)
  const billsTable: ContentTable = {
    table: {
      headerRows: 1,
      widths: ['*', 'auto', 'auto'],
      body: [
        [
          { text: 'Category', bold: true },
          { text: 'Items', bold: true, alignment: 'right' as const },
          { text: 'Total', bold: true, alignment: 'right' as const },
        ],
        ...billRows,
        ...(billsByCategory.length > 0 ? [[
          { text: 'Total', bold: true },
          { text: String(billsByCategory.reduce((s, c) => s + c.count, 0)), bold: true, alignment: 'right' as const },
          { text: formatCurrency(billsTotal), bold: true, alignment: 'right' as const },
        ]] : []),
      ],
    },
    layout: 'lightHorizontalLines',
  }

  // ---- Expenses by category ----
  const expRows: Content[][] = expensesByCategory.length === 0
    ? [emptyRow(3, 'No expenses in this period.')]
    : expensesByCategory.map(c => [
        c.name,
        { text: String(c.count), alignment: 'right' as const, color: COLOR_ASH },
        rightCell(formatCurrency(c.amount), { color: COLOR_RED }),
      ])
  const expTotal = expensesByCategory.reduce((s, c) => s + c.amount, 0)
  const expTable: ContentTable = {
    table: {
      headerRows: 1,
      widths: ['*', 'auto', 'auto'],
      body: [
        [
          { text: 'Category', bold: true },
          { text: 'Items', bold: true, alignment: 'right' as const },
          { text: 'Total', bold: true, alignment: 'right' as const },
        ],
        ...expRows,
        ...(expensesByCategory.length > 0 ? [[
          { text: 'Total', bold: true },
          { text: String(expensesByCategory.reduce((s, c) => s + c.count, 0)), bold: true, alignment: 'right' as const },
          { text: formatCurrency(expTotal), bold: true, alignment: 'right' as const, color: COLOR_RED },
        ]] : []),
      ],
    },
    layout: 'lightHorizontalLines',
  }

  // ---- Collected by bank ----
  const bankRows: Content[][] = collectedByBank.length === 0
    ? [emptyRow(4, 'No advance/deposit activity in this period.')]
    : collectedByBank.map(b => [
        b.name,
        rightCell(formatCurrency(b.advance)),
        rightCell(formatCurrency(b.deposit)),
        rightCell(formatCurrency(b.total), { bold: true }),
      ])
  const bankTable: ContentTable = {
    table: {
      headerRows: 1,
      widths: ['*', 'auto', 'auto', 'auto'],
      body: [
        [
          { text: 'Account', bold: true },
          { text: 'Advance', bold: true, alignment: 'right' as const },
          { text: 'Deposits', bold: true, alignment: 'right' as const },
          { text: 'Total', bold: true, alignment: 'right' as const },
        ],
        ...bankRows,
        ...(collectedByBank.length > 0 ? [[
          { text: 'Total', bold: true },
          { text: formatCurrency(collectedByBank.reduce((s, b) => s + b.advance, 0)), bold: true, alignment: 'right' as const },
          { text: formatCurrency(collectedByBank.reduce((s, b) => s + b.deposit, 0)), bold: true, alignment: 'right' as const },
          { text: formatCurrency(collectedByBank.reduce((s, b) => s + b.total, 0)), bold: true, alignment: 'right' as const, color: COLOR_ACCENT },
        ]] : []),
      ],
    },
    layout: 'lightHorizontalLines',
  }

  // ---- Bookings table ----
  const bookingRows: Content[][] = bookings.length === 0
    ? [emptyRow(7, 'No bookings match the filters.')]
    : bookings.map(b => [
        formatDate(b.function_date),
        { text: b.customer_name, bold: true },
        b.status,
        rightCell(formatCurrency(b.total_bill)),
        rightCell(formatCurrency(b.total_paid)),
        rightCell(formatCurrency(b.pending), { color: b.pending > 0 ? COLOR_RED : COLOR_INK }),
        rightCell(formatCurrency(b.profit), { color: b.profit >= 0 ? COLOR_ACCENT : COLOR_RED, bold: true }),
      ])

  const bookingsTable: ContentTable = {
    table: {
      headerRows: 1,
      widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto'],
      body: [
        [
          { text: 'Date', bold: true },
          { text: 'Customer', bold: true },
          { text: 'Status', bold: true },
          { text: 'Bill', bold: true, alignment: 'right' as const },
          { text: 'Paid', bold: true, alignment: 'right' as const },
          { text: 'Pending', bold: true, alignment: 'right' as const },
          { text: 'Profit', bold: true, alignment: 'right' as const },
        ],
        ...bookingRows,
      ],
    },
    layout: 'lightHorizontalLines',
  }

  const content: Content[] = [
    ...header,
    sectionHeader('Summary'),
    kpiTable,
    sectionHeader(`Advance forecast · ${modeLabel} buckets`),
    forecastTable,
    sectionHeader('Bill items by category'),
    billsTable,
    sectionHeader('Expenses by category'),
    expTable,
    sectionHeader('Collected by bank account'),
    bankTable,
    sectionHeader(`Bookings (${bookings.length})`),
    bookingsTable,
  ]

  return {
    pageSize: 'A4',
    pageMargins: [40, 50, 40, 50] as [number, number, number, number],
    content,
    styles: {
      hallName:     { fontSize: 20, bold: true, color: COLOR_INK },
      reportTitle:  { fontSize: 13, color: COLOR_ASH },
      sectionHeader:{ fontSize: 12, bold: true, color: COLOR_INK },
      metaLabel:    { fontSize: 8, color: COLOR_ASH, characterSpacing: 0.5 },
      metaValue:    { fontSize: 10, color: COLOR_INK, margin: [0, 2, 0, 0] as [number, number, number, number] },
      kpiLabel:     { fontSize: 8, color: COLOR_ASH, characterSpacing: 0.5 },
      kpiNum:       { fontSize: 14, bold: true, color: COLOR_INK, margin: [0, 4, 0, 2] as [number, number, number, number] },
      fcNum:        { fontSize: 12, bold: true, color: COLOR_INK, margin: [0, 4, 0, 2] as [number, number, number, number] },
      kpiFoot:      { fontSize: 8, color: COLOR_ASH },
    },
    defaultStyle: { fontSize: 9 },
    footer: (currentPage: number, pageCount: number) => ({
      text: `SMB Marriage Hall  ·  Page ${currentPage} of ${pageCount}  ·  ${new Date().toLocaleDateString('en-IN')}`,
      alignment: 'center' as const,
      margin: [0, 20, 0, 0] as [number, number, number, number],
      fontSize: 8,
      color: COLOR_ASH,
    }),
  }
}
