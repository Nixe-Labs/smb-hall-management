import type { TDocumentDefinitions, Content, ContentColumns, ContentTable } from 'pdfmake/interfaces'
import type { Booking, AdvancePayment, BillItem, BillCategory } from '@/types/database'
import type { BookingSummary } from '@/types/finance'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'

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

  const billItemRows = billItems.map(item => [
    getCategoryName(item.category_id, billCategories),
    { text: formatCurrency(item.amount), alignment: 'right' as const },
  ])

  const advanceRows = advances.map((adv, i) => [
    `${i + 1}`,
    formatDate(adv.payment_date),
    adv.payment_method ? adv.payment_method.charAt(0).toUpperCase() + adv.payment_method.slice(1) : '-',
    { text: formatCurrency(adv.amount), alignment: 'right' as const },
  ])

  // Build customer info stack
  const customerStack: Content[] = [
    { text: 'Customer Details', bold: true, margin: [0, 0, 0, 5] as [number, number, number, number] },
    { text: `Name: ${booking.customer_name}` },
  ]
  if (booking.customer_phone) {
    customerStack.push({ text: `Phone: ${booking.customer_phone}` })
  }
  if (booking.customer_address) {
    customerStack.push({ text: `Address: ${booking.customer_address}` })
  }

  const customerSection: ContentColumns = {
    columns: [
      { width: '*', stack: customerStack },
      {
        width: 'auto',
        stack: [
          { text: `Function Date: ${formatDate(booking.function_date)}`, alignment: 'right' as const },
          { text: `Status: ${booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}`, alignment: 'right' as const },
        ],
      },
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
          { text: 'Total Bill', bold: true },
          { text: formatCurrency(summary.total_bill), bold: true, alignment: 'right' as const },
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
        ['Total Bill', { text: formatCurrency(summary.total_bill), alignment: 'right' as const }],
        ['Advance Received', { text: formatCurrency(summary.total_advance), alignment: 'right' as const }],
        ['Balance Collected', { text: formatCurrency(summary.balance_collected), alignment: 'right' as const }],
        ['Total Expenses', { text: formatCurrency(summary.total_expenses), alignment: 'right' as const }],
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
