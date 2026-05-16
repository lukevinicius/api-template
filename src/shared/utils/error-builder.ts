import axios from 'axios'
import type { ErrorResponse } from '@/shared/middleware/error.types'
import { sentry } from '@/shared/pluguins/sentry'

export function errorBuilder(title: string, error: unknown): ErrorResponse {
  let response: ErrorResponse = {
    statusCode: 500,
    message: title,
    details: {
      error: 'An unexpected error occurred',
    },
  }

  if (axios.isAxiosError(error)) {
    const errorMessage =
      error.response?.data?.message ||
      error.response?.data?.msg ||
      error.response?.data?.error ||
      error.message

    response = {
      statusCode: error.response?.status || 500,
      message: title,
      details: {
        error: errorMessage,
        data: error.response?.data,
      },
    }

    sentry.logger.warn(response.message, { details: response.details })
  }

  return response
}
