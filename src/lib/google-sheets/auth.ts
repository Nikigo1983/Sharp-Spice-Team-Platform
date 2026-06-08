import { SignJWT, importPKCS8 } from "jose";
import { fetchWithTlsFallback } from "@/lib/google-fetch";

let cachedToken: { token: string; expiresAt: number } | null = null;

export function isGoogleSheetsPublicClientsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() &&
      process.env.GOOGLE_SHEETS_PUBLIC_CLIENTS_GID?.trim(),
  );
}

export function isGoogleSheetsConfigured(): boolean {
  return Boolean(
    (process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() &&
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() &&
      process.env.GOOGLE_PRIVATE_KEY?.trim()) ||
      isGoogleSheetsPublicClientsConfigured(),
  );
}

function isGoogleServiceAccountConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() &&
      process.env.GOOGLE_PRIVATE_KEY?.trim(),
  );
}

async function createSignedJwt(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, "\n");

  const key = await importPKCS8(privateKey, "RS256");

  return new SignJWT({
    scope: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.readonly",
    ].join(" "),
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(email)
    .setSubject(email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}

export function isGoogleDriveKbConfigured(): boolean {
  return Boolean(
    isGoogleServiceAccountConfigured() &&
      process.env.GOOGLE_DRIVE_KB_FOLDER_ID?.trim(),
  );
}

export async function getGoogleAccessToken(): Promise<string | null> {
  if (!isGoogleServiceAccountConfigured()) return null;

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const assertion = await createSignedJwt();
  const response = await fetchWithTlsFallback(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    },
  );

  if (!response.ok) {
    console.error("[google-sheets] token error", await response.text());
    return null;
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}
