import type { User } from "../../drizzle/schema";

export function normalizeEmail(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function configuredAllowlist(): string[] {
  return (process.env.BLACKTOWER_ALLOWED_EMAILS ?? "")
    .split(/[\n,]/)
    .map(normalizeEmail)
    .filter(Boolean);
}

export function isAllowlistedEmail(value: string | null | undefined): boolean {
  const email = normalizeEmail(value);
  return Boolean(email && configuredAllowlist().includes(email));
}

export function isAppOwner(user: Pick<User, "email" | "role"> | null | undefined): boolean {
  if (!user) return false;
  const configuredOwner = normalizeEmail(process.env.BLACKTOWER_APP_OWNER_EMAIL);
  const email = normalizeEmail(user.email);
  return Boolean(configuredOwner && email && email === configuredOwner);
}

/**
 * The project owner and platform admins are internal users. Other accounts
 * require an exact email match in BLACKTOWER_ALLOWED_EMAILS. An empty list
 * grants no access to non-admin, non-owner accounts.
 */
export function isInternalUser(user: Pick<User, "email" | "role"> | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "admin" || isAppOwner(user)) return true;
  return isAllowlistedEmail(user.email);
}
