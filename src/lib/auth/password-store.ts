import "server-only";

import bcrypt from "bcryptjs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getAppState, setAppState } from "@/lib/supabase/app-state";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const APP_STATE_KEY = "platform_user_passwords";
const STORE_PATH = path.join(process.cwd(), ".data", "platform-user-passwords.json");
const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

export type StoredUserPassword = {
  passwordHash: string;
  updatedAt: string;
  updatedByUserId: string;
  updatedByName: string;
};

export type PlatformUserPasswordsStore = {
  passwords: Record<string, StoredUserPassword>;
};

const EMPTY_STORE: PlatformUserPasswordsStore = { passwords: {} };

async function readFileStore(): Promise<PlatformUserPasswordsStore> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const data = JSON.parse(raw) as PlatformUserPasswordsStore;
    if (!data.passwords || typeof data.passwords !== "object") {
      return EMPTY_STORE;
    }
    return data;
  } catch {
    return EMPTY_STORE;
  }
}

async function writeFileStore(store: PlatformUserPasswordsStore): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

async function readStore(): Promise<PlatformUserPasswordsStore> {
  if (isSupabaseConfigured()) {
    try {
      const value = await getAppState<PlatformUserPasswordsStore>(APP_STATE_KEY);
      return value?.passwords ? value : EMPTY_STORE;
    } catch (error) {
      console.error("[auth/password-store] supabase read", error);
      return EMPTY_STORE;
    }
  }
  return readFileStore();
}

async function writeStore(store: PlatformUserPasswordsStore): Promise<boolean> {
  if (isSupabaseConfigured()) {
    return setAppState(APP_STATE_KEY, store);
  }
  try {
    await writeFileStore(store);
    return true;
  } catch (error) {
    console.error("[auth/password-store] file write", error);
    return false;
  }
}

export function validateNewPassword(password: string): string | null {
  const trimmed = password.trim();
  if (!trimmed) return "Введите пароль.";
  if (trimmed.length < MIN_PASSWORD_LENGTH) {
    return `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов.`;
  }
  if (trimmed.length > MAX_PASSWORD_LENGTH) {
    return `Пароль должен быть не длиннее ${MAX_PASSWORD_LENGTH} символов.`;
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password.trim(), BCRYPT_ROUNDS);
}

export async function getStoredPasswordHash(
  userId: string,
): Promise<string | null> {
  const store = await readStore();
  return store.passwords[userId]?.passwordHash ?? null;
}

export async function getStoredPasswordMeta(
  userId: string,
): Promise<StoredUserPassword | null> {
  const store = await readStore();
  return store.passwords[userId] ?? null;
}

export async function setUserPassword(params: {
  userId: string;
  password: string;
  updatedByUserId: string;
  updatedByName: string;
}): Promise<void> {
  const validationError = validateNewPassword(params.password);
  if (validationError) {
    throw new Error(validationError);
  }

  const store = await readStore();
  store.passwords[params.userId] = {
    passwordHash: await hashPassword(params.password),
    updatedAt: new Date().toISOString(),
    updatedByUserId: params.updatedByUserId,
    updatedByName: params.updatedByName,
  };

  const ok = await writeStore(store);
  if (!ok) {
    throw new Error("Failed to persist password");
  }
}

export function generateTemporaryPassword(length = 12): string {
  const chars =
    "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%";
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
