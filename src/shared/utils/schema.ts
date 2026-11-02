import { t } from 'elysia'
import { env } from '@/config/env'

/**
 * Optional enum field. Elysia fills a missing `t.Optional(t.UnionEnum())`
 * with the first enum value, so the default must be explicitly cleared.
 */
export const optionalEnum = <const T extends [string, ...string[]]>(
  values: T,
) => t.Optional(t.UnionEnum(values, { default: undefined }))

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * URL of an uploaded file. Only HTTPS URLs from the file storage (EdgeStore)
 * are accepted, so arbitrary links cannot be saved as images.
 */
export const fileUrlSchema = t.Optional(
  t.Nullable(
    t.String({
      maxLength: 1000,
      pattern: `^https://(${env.FILE_URL_HOSTS.map(escapeRegex).join('|')})/`,
      error: 'URL de arquivo inválida',
    }),
  ),
)
