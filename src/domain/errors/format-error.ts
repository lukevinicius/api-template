import { isAxiosError } from 'axios'

interface IResponse {
  statusCode: number
  message: string
}

export function formatError(title: string, error: unknown): IResponse {
  let statusCode: number = 400 // default status code for errors
  let message: string = 'Um erro inesperado ocorreu. Por favor, tente novamente mais tarde.'

  if (isAxiosError(error)) {
    statusCode = error.response?.status || 400
    message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message
  }

  console.error(`${title}`, {
    statusCode,
    message,
  })

  return {
    statusCode,
    message,
  }
}
