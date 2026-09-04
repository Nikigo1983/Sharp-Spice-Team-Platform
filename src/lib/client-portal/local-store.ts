import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ClientPortalInvitation, ClientPortalUser } from "./types";

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
  const normalized = email.trim().toLowerCase();
  const users = await listClientPortalUsers();
  return users.find((user) => user.email.toLowerCase() === normalized) ?? null;
}

export async function findClientPortalUserById(
  id: string,
): Promise<ClientPortalUser | null> {
  const users = await listClientPortalUsers();
  return users.find((user) => user.id === id) ?? null;
}

export async function upsertClientPortalUser(
  user: ClientPortalUser,
): Promise<ClientPortalUser> {
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
  const invitations = await listClientPortalInvitations();
  return invitations.find((item) => item.token === token) ?? null;
}

export async function upsertInvitation(
  invitation: ClientPortalInvitation,
): Promise<ClientPortalInvitation> {
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
