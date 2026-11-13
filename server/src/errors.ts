/** Kullanıcıya gösterilecek, Türkçe mesajlı hata. `code` makine için, `message` insan için. */
export class ArgusError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'ArgusError'
  }
}

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))
