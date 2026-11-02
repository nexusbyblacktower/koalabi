import type { User } from "../../drizzle/schema";

/**
 * The project owner is the initial admin. Other authenticated identities need an
 * exact email match in BLACKTOWER_ALLOWED_EMAILS (comma- or newline-separated).
 * An unset/empty list grants no additional access.
 */
export function isInternalUser(user: Pick<User, "email" | "role"> | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;

  const allowedEmails = (process.env.BLACKTOWER_ALLOWED_EMAILS ?? "")
    .split(/[\n,]/)
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
  const email = user.email?.trim().toLowerCase();
  return Boolean(email && allowedEmails.includes(email));
}
