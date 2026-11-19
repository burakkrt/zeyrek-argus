/**
 * Form doğrulaması (Zeyrek'in form doğrulama kalıbı): alanın kuralları sırayla denetlenir, alan başına ilk hata
 * döner. Hata, alanın altında kırmızı kenar ve metinle (`FieldError`) ve formun üstündeki listede (`FormErrors`)
 * gösterilir; listedeki satır alana götürür. Form ilk gönderimden sonra her değişiklikte yeniden denetlenir (düzelen
 * alan listeden düşer). Bildirim (toast) form hatası için kullanılmaz.
 */
export interface FieldError {
  /** Alanın DOM kimliği; boşsa hata bir alana bağlı değildir (satır tıklanmaz). */
  id: string
  label: string
  message: string
}

export interface FieldRule {
  id: string
  label: string
  value: string
  /** true: "Bu alan zorunludur."; metin: o ileti. Yalnız boşluk boş sayılır. */
  required?: boolean | string
  min?: number
  max?: number
  /** Diğer kurallar geçince çalışır; hata iletisi ya da null. */
  check?: () => string | null
}

export function validateFields(rules: FieldRule[]): FieldError[] {
  const errors: FieldError[] = []
  for (const rule of rules) {
    const value = rule.value.trim()
    const message =
      rule.required && !value
        ? typeof rule.required === 'string'
          ? rule.required
          : 'Bu alan zorunludur.'
        : rule.min !== undefined && value && value.length < rule.min
          ? `En az ${rule.min} karakter olmalı.`
          : rule.max !== undefined && value.length > rule.max
            ? `En çok ${rule.max} karakter olabilir.`
            : (rule.check?.() ?? null)
    if (message) errors.push({ id: rule.id, label: rule.label, message })
  }
  return errors
}

/** Alanın altında gösterilecek ilk hata. */
export const errorOf = (errors: FieldError[], id: string): string | null =>
  errors.find((e) => e.id === id)?.message ?? null

/** Liste: aynı alanın hataları alan adı altında, ilki başta; alana bağlı olmayan hatalar ayrı satırlarda kalır. */
export function groupErrors(errors: FieldError[]): Array<FieldError & { more: FieldError[] }> {
  const groups: Array<FieldError & { more: FieldError[] }> = []
  for (const error of errors) {
    const group = error.id ? groups.find((g) => g.id === error.id) : undefined
    if (group) group.more.push(error)
    else groups.push({ ...error, more: [] })
  }
  return groups
}
