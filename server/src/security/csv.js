import { AppError } from '../utils/app-error.js'

const formulaPattern = /^\s*[=+\-@]/

export function isSpreadsheetFormula(value) {
  return formulaPattern.test(String(value ?? ''))
}

export function escapeCsvCell(value) {
  let text = String(value ?? '')
  if (isSpreadsheetFormula(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

/**
 * Small RFC 4180 parser with explicit resource ceilings. It supports quoted
 * fields and CRLF/LF records, rejects malformed quoting and never evaluates
 * spreadsheet expressions.
 */
export function parseCsvText(text, { maxRows = 2000, maxColumns = 20, maxCellLength = 500 } = {}) {
  const source = String(text ?? '').replace(/^\uFEFF/, '')
  if (!source.trim()) throw new AppError('CSV file is empty.', 422, 'CSV_EMPTY')
  if (source.includes('\0')) throw new AppError('CSV contains binary data.', 422, 'CSV_BINARY_DATA')

  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  let quoteClosed = false

  const appendCell = () => {
    if (cell.length > maxCellLength) throw new AppError('CSV cell is too long.', 422, 'CSV_CELL_TOO_LONG')
    row.push(cell)
    cell = ''
    quoteClosed = false
    if (row.length > maxColumns) throw new AppError('CSV has too many columns.', 422, 'CSV_TOO_MANY_COLUMNS')
  }
  const appendRow = () => {
    appendCell()
    if (row.some(value => value.trim() !== '')) rows.push(row)
    row = []
    if (rows.length > maxRows + 1) throw new AppError('CSV has too many rows.', 422, 'CSV_TOO_MANY_ROWS')
  }

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          cell += '"'
          index += 1
        } else {
          quoted = false
          quoteClosed = true
        }
      } else {
        cell += character
      }
      continue
    }
    if (quoteClosed && ![',', '\r', '\n'].includes(character)) {
      throw new AppError('CSV has invalid characters after a closing quote.', 422, 'CSV_MALFORMED')
    }
    if (character === '"') {
      if (cell.length) throw new AppError('CSV quote must start a field.', 422, 'CSV_MALFORMED')
      quoted = true
    } else if (character === ',') {
      appendCell()
    } else if (character === '\r' || character === '\n') {
      if (character === '\r' && source[index + 1] === '\n') index += 1
      appendRow()
    } else {
      cell += character
    }
  }
  if (quoted) throw new AppError('CSV has an unclosed quoted field.', 422, 'CSV_MALFORMED')
  if (cell.length || row.length) appendRow()
  return rows
}
