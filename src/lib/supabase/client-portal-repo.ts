import "server-only";

import { getSupabaseAdmin } from "./server";
import type {
  ClientPortalInvitation,
  ClientPortalLocale,
  ClientPortalPasswordReset,
  ClientPortalUser,
} from "@/lib/client-portal/types";
import type {
  QuestionnaireAnswers,
  QuestionnaireRecord,
  QuestionnaireStatus,
} from "@/lib/client-portal/questionnaire-types";

type InvitationRow = {
  id: string;
  token: string;
  email: string;
  first_name: string;
  preferred_locale: string;
  created_by_user_id: string;
  created_at: string;
  accepted_at: string | null;
  status: string;
};

type UserRow = {
  id: string;
  email: string;
  first_name: string;
  preferred_locale: string;
  invitation_id: string | null;
  password_hash: string;
  created_at: string;
  updated_at: string;
};

type PasswordResetRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

type QuestionnaireRow = {
  id: string;
  client_portal_user_id: string;
  invitation_id: string | null;
  email: string;
  first_name: string;
  status: string;
  answers: unknown;
  revision: number;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
};

function asLocale(value: string): ClientPortalLocale {
  return value === "en" ? "en" : "ru";
}

function mapInvitation(row: InvitationRow): ClientPortalInvitation {
  return {
    id: row.id,
    token: row.token,
    email: row.email,
    firstName: row.first_name,
    preferredLocale: asLocale(row.preferred_locale),
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
    status: row.status as ClientPortalInvitation["status"],
  };
}

function mapUser(row: UserRow): ClientPortalUser {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    preferredLocale: asLocale(row.preferred_locale),
    invitationId: row.invitation_id,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapQuestionnaire(row: QuestionnaireRow): QuestionnaireRecord {
  return {
    id: row.id,
    clientPortalUserId: row.client_portal_user_id,
    invitationId: row.invitation_id,
    email: row.email,
    firstName: row.first_name,
    status: row.status as QuestionnaireStatus,
    answers:
      row.answers && typeof row.answers === "object" && !Array.isArray(row.answers)
        ? (row.answers as QuestionnaireAnswers)
        : {},
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submittedAt: row.submitted_at,
  };
}

export async function sbListInvitations(): Promise<ClientPortalInvitation[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("client_portal_invitations")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as InvitationRow[]).map(mapInvitation);
}

export async function sbFindInvitationByToken(
  token: string,
): Promise<ClientPortalInvitation | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("client_portal_invitations")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) throw error;
  return data ? mapInvitation(data as InvitationRow) : null;
}

export async function sbUpsertInvitation(
  invitation: ClientPortalInvitation,
): Promise<ClientPortalInvitation> {
  const { data, error } = await getSupabaseAdmin()
    .from("client_portal_invitations")
    .upsert(
      {
        id: invitation.id,
        token: invitation.token,
        email: invitation.email,
        first_name: invitation.firstName,
        preferred_locale: invitation.preferredLocale,
        created_by_user_id: invitation.createdByUserId,
        created_at: invitation.createdAt,
        accepted_at: invitation.acceptedAt,
        status: invitation.status,
      },
      { onConflict: "id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return mapInvitation(data as InvitationRow);
}

export async function sbFindUserByEmail(
  email: string,
): Promise<ClientPortalUser | null> {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await getSupabaseAdmin()
    .from("client_portal_users")
    .select("*")
    .eq("email", normalized)
    .maybeSingle();
  if (error) throw error;
  return data ? mapUser(data as UserRow) : null;
}

export async function sbFindUserById(
  id: string,
): Promise<ClientPortalUser | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("client_portal_users")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapUser(data as UserRow) : null;
}

export async function sbUpsertUser(
  user: ClientPortalUser,
): Promise<ClientPortalUser> {
  const { data, error } = await getSupabaseAdmin()
    .from("client_portal_users")
    .upsert(
      {
        id: user.id,
        email: user.email,
        first_name: user.firstName,
        preferred_locale: user.preferredLocale,
        invitation_id: user.invitationId,
        password_hash: user.passwordHash,
        created_at: user.createdAt,
        updated_at: user.updatedAt,
      },
      { onConflict: "id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return mapUser(data as UserRow);
}

export async function sbListQuestionnaires(): Promise<QuestionnaireRecord[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("client_portal_questionnaires")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as QuestionnaireRow[]).map(mapQuestionnaire);
}

export async function sbFindQuestionnaireById(
  id: string,
): Promise<QuestionnaireRecord | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("client_portal_questionnaires")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapQuestionnaire(data as QuestionnaireRow) : null;
}

export async function sbFindQuestionnaireByUserId(
  clientPortalUserId: string,
): Promise<QuestionnaireRecord | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("client_portal_questionnaires")
    .select("*")
    .eq("client_portal_user_id", clientPortalUserId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapQuestionnaire(data as QuestionnaireRow) : null;
}

export async function sbUpsertQuestionnaire(
  record: QuestionnaireRecord,
): Promise<QuestionnaireRecord> {
  const { data, error } = await getSupabaseAdmin()
    .from("client_portal_questionnaires")
    .upsert(
      {
        id: record.id,
        client_portal_user_id: record.clientPortalUserId,
        invitation_id: record.invitationId,
        email: record.email,
        first_name: record.firstName,
        status: record.status,
        answers: record.answers,
        revision: record.revision,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
        submitted_at: record.submittedAt,
      },
      { onConflict: "id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return mapQuestionnaire(data as QuestionnaireRow);
}

export async function sbListSubmittedQuestionnaires(): Promise<
  QuestionnaireRecord[]
> {
  const { data, error } = await getSupabaseAdmin()
    .from("client_portal_questionnaires")
    .select("*")
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as QuestionnaireRow[]).map(mapQuestionnaire);
}

function mapPasswordReset(row: PasswordResetRow): ClientPortalPasswordReset {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    createdAt: row.created_at,
  };
}

export async function sbInsertPasswordReset(
  reset: ClientPortalPasswordReset,
): Promise<ClientPortalPasswordReset> {
  const { data, error } = await getSupabaseAdmin()
    .from("client_portal_password_resets")
    .insert({
      id: reset.id,
      user_id: reset.userId,
      token_hash: reset.tokenHash,
      expires_at: reset.expiresAt,
      used_at: reset.usedAt,
      created_at: reset.createdAt,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapPasswordReset(data as PasswordResetRow);
}

export async function sbFindValidPasswordResetByTokenHash(
  tokenHash: string,
): Promise<ClientPortalPasswordReset | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("client_portal_password_resets")
    .select("*")
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  return data ? mapPasswordReset(data as PasswordResetRow) : null;
}

export async function sbMarkPasswordResetUsed(
  id: string,
  usedAt: string,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("client_portal_password_resets")
    .update({ used_at: usedAt })
    .eq("id", id);
  if (error) throw error;
}
