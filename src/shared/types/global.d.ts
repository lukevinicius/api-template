type ErrorResponse = {
  success: false
  error: {
    statusCode: number
    message: string
    details?: {
      error: string,
      data: unknown
    };
  }
}
type Success<T> = { success: true; data: T }
type Failure = ErrorResponse
type Result<T> = Success<T> | Failure
