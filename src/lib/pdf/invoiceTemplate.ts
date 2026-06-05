import type { TDocumentDefinitions, Content, ContentColumns, ContentTable } from 'pdfmake/interfaces'
import type { Booking, AdvancePayment, BillItem, BillCategory } from '@/types/database'
import type { BookingSummary } from '@/types/finance'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate, formatTimeRange } from '@/lib/utils/dates'
import { formatRange } from '@/lib/utils/slots'
import { allPhones } from '@/lib/utils/phones'
import { billItemBreakdown } from '@/lib/utils/billItems'
import { paymentMethodLabel } from '@/lib/utils/payments'
import { getTamilDate, PAKSHA_LABEL } from '@/lib/utils/tamilCalendar'

interface InvoiceData {
  booking: Booking
  advances: AdvancePayment[]
  billItems: BillItem[]
  billCategories: BillCategory[]
  summary: BookingSummary
}

function getCategoryName(categoryId: string, categories: BillCategory[]): string {
  return categories.find(c => c.id === categoryId)?.name ?? 'Unknown'
}

export function buildInvoiceDocument(data: InvoiceData): TDocumentDefinitions {
  const { booking, advances, billItems, billCategories, summary } = data

  const billItemRows = billItems.map(item => {
    const breakdown = billItemBreakdown(item.unit, item.rate, item.quantity)
    const label = breakdown
      ? getCategoryName(item.category_id, billCategories) + `  (${breakdown})`
      : getCategoryName(item.category_id, billCategories)
    return [
      label,
      { text: formatCurrency(item.amount), alignment: 'right' as const },
    ]
  })

  const advanceRows = advances.map((adv, i) => [
    `${i + 1}`,
    formatDate(adv.payment_date),
    adv.payment_method ? paymentMethodLabel(adv.payment_method) : '-',
    { text: formatCurrency(adv.amount), alignment: 'right' as const },
  ])

  // Build customer info stack
  const customerStack: Content[] = [
    { text: 'Customer Details', bold: true, margin: [0, 0, 0, 5] as [number, number, number, number] },
    { text: `Name: ${booking.customer_name}` },
  ]
  const phoneList = allPhones(booking.customer_phone, booking.customer_phones)
  if (phoneList.length) {
    customerStack.push({ text: `Phone: ${phoneList.join(', ')}` })
  }
  if (booking.customer_address) {
    customerStack.push({ text: `Address: ${booking.customer_address}` })
  }
  if (booking.event_type) {
    const ev = booking.event_type_other ? `${booking.event_type} (${booking.event_type_other})` : booking.event_type
    customerStack.push({ text: `Event: ${ev}` })
  }

  const functionStack: Content[] = [
    { text: `Function Date: ${formatDate(booking.function_date)}`, alignment: 'right' as const },
    { text: `Hall Use: ${formatRange(booking)}`, alignment: 'right' as const },
  ]
  const tamil = getTamilDate(booking.function_date)
  if (tamil) {
    functionStack.push({ text: `Tamil Month: ${tamil.month.en} (${tamil.month.ta}) · ${PAKSHA_LABEL[tamil.paksha].short}`, alignment: 'right' as const })
  }
  const hallUseTime = formatTimeRange(booking.start_time, booking.end_time)
  if (hallUseTime) {
    functionStack.push({ text: `Time: ${hallUseTime}`, alignment: 'right' as const })
  }
  functionStack.push({ text: `Status: ${booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}`, alignment: 'right' as const })

  const customerSection: ContentColumns = {
    columns: [
      { width: '*', stack: customerStack },
      { width: 'auto', stack: functionStack },
    ],
    margin: [0, 0, 0, 20] as [number, number, number, number],
  }

  const billTable: ContentTable = {
    table: {
      headerRows: 1,
      widths: ['*', 'auto'],
      body: [
        [
          { text: 'Item', bold: true },
          { text: 'Amount', bold: true, alignment: 'right' as const },
        ],
        ...billItemRows,
        [
          { text: 'Bill Items Subtotal', bold: true },
          { text: formatCurrency(summary.bill_items_total), bold: true, alignment: 'right' as const },
        ],
      ],
    },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 20] as [number, number, number, number],
  }

  const content: Content[] = [
    { text: 'SMB Marriage Hall', style: 'hallName' },
    { text: 'Invoice', style: 'invoiceTitle', margin: [0, 5, 0, 20] as [number, number, number, number] },
    customerSection,
    { text: 'Bill Details', style: 'sectionHeader' },
    billTable,
  ]

  if (advances.length > 0) {
    const advanceTable: ContentTable = {
      table: {
        headerRows: 1,
        widths: ['auto', 'auto', 'auto', '*'],
        body: [
          [
            { text: '#', bold: true },
            { text: 'Date', bold: true },
            { text: 'Method', bold: true },
            { text: 'Amount', bold: true, alignment: 'right' as const },
          ],
          ...advanceRows,
        ],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 20] as [number, number, number, number],
    }
    content.push({ text: 'Advance Payments', style: 'sectionHeader' })
    content.push(advanceTable)
  }

  const summaryTable: ContentTable = {
    table: {
      widths: ['*', 'auto'],
      body: [
        ['Hall Rent', { text: formatCurrency(summary.rent), alignment: 'right' as const }],
        ['Bill Items', { text: formatCurrency(summary.bill_items_total), alignment: 'right' as const }],
        [
          { text: 'Total Bill', bold: true },
          { text: formatCurrency(summary.total_bill), bold: true, alignment: 'right' as const },
        ],
        ['Advance Received', { text: formatCurrency(summary.total_advance), alignment: 'right' as const }],
        ['Deposits', { text: formatCurrency(summary.total_deposits), alignment: 'right' as const }],
        [
          { text: 'Total Paid', bold: true },
          { text: formatCurrency(summary.total_paid), bold: true, alignment: 'right' as const },
        ],
        [
          { text: 'Pending Balance', bold: true },
          { text: formatCurrency(summary.pending_balance), bold: true, alignment: 'right' as const },
        ],
      ],
    },
    layout: 'lightHorizontalLines',
  }

  content.push({ text: 'Financial Summary', style: 'sectionHeader' })
  content.push(summaryTable)

  return {
    pageSize: 'A4',
    pageMargins: [40, 60, 40, 60] as [number, number, number, number],
    content,
    styles: {
      hallName: { fontSize: 20, bold: true, color: '#1e3a5f' },
      invoiceTitle: { fontSize: 14, color: '#666666' },
      sectionHeader: { fontSize: 13, bold: true, margin: [0, 10, 0, 5] as [number, number, number, number] },
    },
    defaultStyle: {
      fontSize: 10,
    },
    footer: (currentPage: number, pageCount: number) => ({
      text: `Page ${currentPage} of ${pageCount} | Generated on ${new Date().toLocaleDateString('en-IN')}`,
      alignment: 'center' as const,
      margin: [0, 20, 0, 0] as [number, number, number, number],
      fontSize: 8,
      color: '#999999',
    }),
  }
}
