import { content as copy } from '../../content.js'
export const usernamePolicy = copy.authValidation.text324LettersNumbersOrUnderscoresStartWithALetter
export function signupError(form: {
  firstName: string
  lastName: string
  username: string
  email: string
  password: string
  confirmPassword: string
}): string | null {
  if (!form.firstName.trim() || !form.lastName.trim()) return copy.authValidation.enterYourFirstAndLastName
  if (!/^[a-zA-Z][a-zA-Z0-9_]{2,23}$/.test(form.username)) return usernamePolicy
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return copy.authValidation.enterAValidEmailAddress
  if (form.password.length < 15 || form.password.length > 128) return copy.authValidation.useAPasswordOf15128Characters
  if (form.password !== form.confirmPassword) return copy.authValidation.thePasswordsMustMatch
  return null
}
