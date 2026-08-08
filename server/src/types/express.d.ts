declare global {
  namespace Express {
    interface Request {
      requestId?: string
      auth?: {
        user: any
        session?: any
        token: import('jsonwebtoken').JwtPayload
      }
    }
  }
}

export {}
