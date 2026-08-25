/** The backend's rule. Stated here so the meter cannot disagree with what will be accepted. */
export const PASSWORD_MIN_LENGTH = 10;

export type PasswordStrength = 0 | 1 | 2 | 3;

/**
 * A three-bar strength meter.
 *
 * Deliberately crude and length-led. Elaborate scoring encourages the theatre of
 * `P@ssw0rd!` — which satisfies a character-class checker and no attacker — whereas length
 * is the thing that actually costs a cracker time. The copy says as much: a passphrase
 * beats a password.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (password.length < PASSWORD_MIN_LENGTH) return 0;

  let score = 1;
  if (password.length >= 16) score += 1;
  if (password.length >= 24) score += 1;

  // Variety helps a shorter password, but never substitutes for length.
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter((pattern) =>
    pattern.test(password),
  ).length;
  if (score < 3 && classes >= 3 && password.length >= 14) score += 1;

  return Math.min(score, 3) as PasswordStrength;
}

/** True once the password is long enough for the server to accept it. */
export function passwordLongEnough(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH;
}
