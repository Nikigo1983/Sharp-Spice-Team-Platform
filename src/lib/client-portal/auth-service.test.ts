import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import {
  findInvitationByToken,
  upsertInvitation,
} from "./local-store";

const DATA_DIR = path.join(process.cwd(), ".data");
const USERS_PATH = path.join(DATA_DIR, "client-portal-users.json");
const INVITES_PATH = path.join(DATA_DIR, "client-portal-invitations.json");

describe("client portal local-store", () => {
  beforeEach(async () => {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(USERS_PATH, "[]", "utf8");
    await writeFile(INVITES_PATH, "[]", "utf8");
  });

  afterEach(async () => {
    await rm(USERS_PATH, { force: true });
    await rm(INVITES_PATH, { force: true });
  });

  it("stores and finds invitations by token", async () => {
    const invitation = {
      id: randomUUID(),
      token: randomBytes(12).toString("hex"),
      email: "anna@example.com",
      firstName: "Анна",
      preferredLocale: "ru" as const,
      createdByUserId: "owner-1",
      createdAt: new Date().toISOString(),
      acceptedAt: null,
      status: "pending" as const,
    };

    await upsertInvitation(invitation);
    const stored = await findInvitationByToken(invitation.token);
    assert.equal(stored?.email, "anna@example.com");
    assert.equal(stored?.firstName, "Анна");
  });
});
