import axios from 'axios'

export function errorBuilder(title: string, error: unknown): ErrorResponse {
  let response: ErrorResponse = {
    success: false,
    error: {
      statusCode: 500,
      message: title,
      details: {
        error: 'An unexpected error occurred',
        data: null,
      },
    },
  }

  if (axios.isAxiosError(error)) {
    const errorMessage =
      error.response?.data?.message ||
      error.response?.data?.msg ||
      error.response?.data?.error ||
      error.message

    response = {
      success: false,
      error: {
        statusCode: error.response?.status || 500,
        message: title,
        details: {
          error: errorMessage,
          data: error.response?.data,
        },
      }
    }

    // sentry.logger.warn(response.message, { details: response.details })
  }

  console.error(title, response)

  return response
}
