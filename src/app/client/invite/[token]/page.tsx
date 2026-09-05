import type { Metadata } from "next";
import { ClientInviteAcceptForm } from "@/components/client-portal/ClientInviteAcceptForm";
import {
  findClientPortalUserByEmail,
  findInvitationByToken,
} from "@/lib/client-portal/local-store";
import { CLIENT_PORTAL_BRAND_NAME } from "@/lib/client-portal/brand";
import styles from "@/components/client-portal/ClientPortal.module.css";
import { EmigrantLogo } from "@/components/client-portal/EmigrantLogo";

type Props = { params: Promise<{ token: string }> };

export const metadata: Metadata = {
  title: `${CLIENT_PORTAL_BRAND_NAME} — приглашение клиента`,
  robots: { index: false, follow: false },
};

export default async function ClientInvitePage({ params }: Props) {
  const { token: raw } = await params;
  let token = raw;
  try {
    token = decodeURIComponent(raw);
  } catch {
    token = "";
  }

  const invitation = token ? await findInvitationByToken(token) : null;
  if (!invitation) {
    return (
      <ClientInviteAcceptForm
        token={token}
        email=""
        firstName=""
        invalid
      />
    );
  }

  const existingUser = await findClientPortalUserByEmail(invitation.email);
  if (existingUser || invitation.status === "accepted") {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logoWrap}>
            <EmigrantLogo size="auth" priority />
          </div>
          <h1 className={styles.title}>Аккаунт уже создан</h1>
          <p className={styles.subtitle}>
            Войдите в клиентский портал с email и временным паролем из
            письма-приглашения. Если пароль забыт — используйте «Забыли
            пароль?».
          </p>
          <a className={styles.linkButton} href="/client/login">
            Перейти ко входу
          </a>
        </div>
      </div>
    );
  }

  return (
    <ClientInviteAcceptForm
      token={token}
      email={invitation.email}
      firstName={invitation.firstName}
      invalid={false}
    />
  );
}
