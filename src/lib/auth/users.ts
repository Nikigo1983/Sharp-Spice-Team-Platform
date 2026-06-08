import bcrypt from "bcryptjs";
import type { SessionUser, UserRole } from "./types";

export type TeamUser = SessionUser & {
  passwordEnvKey: string;
};

/** Список команды. Новый сотрудник: добавьте запись и AUTH_PASSWORD_* в env на хостинге. */
const TEAM_USERS: TeamUser[] = [
  {
    id: "veronika",
    email: "virineya1983@gmail.com",
    name: "Вероника",
    role: "owner",
    passwordEnvKey: "AUTH_PASSWORD_VERONIKA",
  },
  {
    id: "manager-1",
    email: "gujenova220371@gmail.com",
    name: "Злата",
    role: "manager",
    passwordEnvKey: "AUTH_PASSWORD_MANAGER_1",
  },
  {
    id: "manager-2",
    email: "iuliia.zhdanovich@gmail.com",
    name: "Юля",
    role: "manager",
    passwordEnvKey: "AUTH_PASSWORD_MANAGER_2",
  },
  {
    id: "manager-3",
    email: "selischev.ruslan@gmail.com",
    name: "Руслан",
    role: "manager",
    passwordEnvKey: "AUTH_PASSWORD_MANAGER_3",
  },
];

const DEV_DEFAULT_PASSWORDS: Record<string, string> = {
  veronika: "veronika-dev",
  "manager-1": "manager1-dev",
  "manager-2": "manager2-dev",
  "manager-3": "manager3-dev",
};

function getStoredPassword(user: TeamUser): string | undefined {
  const fromEnv = process.env[user.passwordEnvKey]?.trim();
  if (fromEnv) return fromEnv;

  if (process.env.NODE_ENV === "production") {
    return undefined;
  }

  return DEV_DEFAULT_PASSWORDS[user.id];
}

export function listTeamUsers(): TeamUser[] {
  return TEAM_USERS;
}

export function findUserByEmail(email: string): TeamUser | undefined {
  const normalized = email.trim().toLowerCase();
  return TEAM_USERS.find((u) => u.email.toLowerCase() === normalized);
}

export async function verifyUserPassword(
  user: TeamUser,
  password: string,
): Promise<boolean> {
  const stored = getStoredPassword(user);
  if (!stored) return false;

  if (stored.startsWith("$2a$") || stored.startsWith("$2b$")) {
    return bcrypt.compare(password, stored);
  }

  return password === stored;
}

export function toSessionUser(user: TeamUser): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

export function isUserRole(value: string): value is UserRole {
  return value === "owner" || value === "manager";
}
