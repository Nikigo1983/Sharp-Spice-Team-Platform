import "server-only";

import bcrypt from "bcryptjs";
import { getStoredPasswordHash } from "./password-store";
import type { TeamUser } from "./users";
import { getEnvStoredPassword } from "./users";

export async function verifyUserPassword(
  user: TeamUser,
  password: string,
): Promise<boolean> {
  const overrideHash = await getStoredPasswordHash(user.id);
  if (overrideHash) {
    return bcrypt.compare(password, overrideHash);
  }

  const stored = getEnvStoredPassword(user);
  if (!stored) return false;

  if (stored.startsWith("$2a$") || stored.startsWith("$2b$")) {
    return bcrypt.compare(password, stored);
  }

  return password === stored;
}
