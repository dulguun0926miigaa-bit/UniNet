export class AppError extends Error {
  constructor(message, status, code, details) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
    this.details = details
  }
}
