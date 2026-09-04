import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ClientPortalInvitation, ClientPortalUser } from "./types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import * as sb from "@/lib/supabase/client-portal-repo";

const DATA_DIR = path.join(process.cwd(), ".data");
const USERS_PATH = path.join(DATA_DIR, "client-portal-users.json");
const INVITES_PATH = path.join(DATA_DIR, "client-portal-invitations.json");

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await ensureDataDir();
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

export async function listClientPortalUsers(): Promise<ClientPortalUser[]> {
  if (isSupabaseConfigured()) {
    // Users are fetched by id/email; full list not needed on staff UI yet.
    return [];
  }
  return readJsonFile<ClientPortalUser[]>(USERS_PATH, []);
}

export async function saveClientPortalUsers(
  users: ClientPortalUser[],
): Promise<void> {
  await writeJsonFile(USERS_PATH, users);
}

export async function findClientPortalUserByEmail(
  email: string,
): Promise<ClientPortalUser | null> {
  if (isSupabaseConfigured()) {
    return sb.sbFindUserByEmail(email);
  }
  const normalized = email.trim().toLowerCase();
  const users = await listClientPortalUsers();
  return users.find((user) => user.email.toLowerCase() === normalized) ?? null;
}

export async function findClientPortalUserById(
  id: string,
): Promise<ClientPortalUser | null> {
  if (isSupabaseConfigured()) {
    return sb.sbFindUserById(id);
  }
  const users = await listClientPortalUsers();
  return users.find((user) => user.id === id) ?? null;
}

export async function upsertClientPortalUser(
  user: ClientPortalUser,
): Promise<ClientPortalUser> {
  if (isSupabaseConfigured()) {
    return sb.sbUpsertUser(user);
  }
  const users = await listClientPortalUsers();
  const index = users.findIndex((item) => item.id === user.id);
  if (index >= 0) {
    users[index] = user;
  } else {
    users.push(user);
  }
  await saveClientPortalUsers(users);
  return user;
}

export async function listClientPortalInvitations(): Promise<
  ClientPortalInvitation[]
> {
  if (isSupabaseConfigured()) {
    return sb.sbListInvitations();
  }
  return readJsonFile<ClientPortalInvitation[]>(INVITES_PATH, []);
}

export async function saveClientPortalInvitations(
  invitations: ClientPortalInvitation[],
): Promise<void> {
  await writeJsonFile(INVITES_PATH, invitations);
}

export async function findInvitationByToken(
  token: string,
): Promise<ClientPortalInvitation | null> {
  if (isSupabaseConfigured()) {
    return sb.sbFindInvitationByToken(token);
  }
  const invitations = await listClientPortalInvitations();
  return invitations.find((item) => item.token === token) ?? null;
}

export async function upsertInvitation(
  invitation: ClientPortalInvitation,
): Promise<ClientPortalInvitation> {
  if (isSupabaseConfigured()) {
    return sb.sbUpsertInvitation(invitation);
  }
  const invitations = await listClientPortalInvitations();
  const index = invitations.findIndex((item) => item.id === invitation.id);
  if (index >= 0) {
    invitations[index] = invitation;
  } else {
    invitations.unshift(invitation);
  }
  await saveClientPortalInvitations(invitations);
  return invitation;
}
