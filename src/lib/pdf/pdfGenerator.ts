import type { TDocumentDefinitions } from 'pdfmake/interfaces'
import pdfMake from 'pdfmake/build/pdfmake'
import * as pdfFonts from 'pdfmake/build/vfs_fonts'

// Register fonts
// @ts-expect-error pdfmake font registration types vary by version
pdfMake.vfs = (pdfFonts as Record<string, unknown>).pdfMake?.vfs ?? pdfFonts

export function downloadInvoice(docDefinition: TDocumentDefinitions, filename: string) {
  pdfMake.createPdf(docDefinition).download(filename)
}

export function printInvoice(docDefinition: TDocumentDefinitions) {
  pdfMake.createPdf(docDefinition).open()
}
