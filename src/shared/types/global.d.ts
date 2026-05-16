type Success<T> = { success: true; data: T }
type Failure = { success: false; error: ErrorResponse }
type Result<T> = Success<T> | Failure