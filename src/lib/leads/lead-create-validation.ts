const TEST_NAME_PATTERN = /(test|тест|demo|демо|asdf?|qwe)/i;

const DEFAULT_PLATFORM_EMAILS = ["virineya1983@gmail.com"];

function parseEmailList(raw?: string): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[;,]/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

function getBlockedPlatformEmails(): Set<string> {
  const envEmails = [
    ...parseEmailList(process.env.CRM_WRITE_PLATFORM_EMAILS),
    ...parseEmailList(process.env.CRM_WRITE_SERVICE_EMAILS),
  ];
  const adminEmail = (process.env.CRM_WRITE_ADMIN_EMAIL ?? "")
    .trim()
    .toLowerCase();

  return new Set(
    [...DEFAULT_PLATFORM_EMAILS, ...envEmails, adminEmail].filter(Boolean),
  );
}

function normalizePhoneForValidation(value: string): string {
  return value.replace(/\D/g, "");
}

export function validateLeadForCrmCreate(input: {
  name: string;
  passport: string;
  phone: string;
  email?: string;
}): string[] {
  const errors: string[] = [];

  const name = input.name.trim();
  const nameWords = name.split(/\s+/).filter(Boolean);
  if (!name || nameWords.length < 2 || TEST_NAME_PATTERN.test(name)) {
    errors.push("name_invalid");
  }

  const passportNorm = input.passport
    .trim()
    .replace(/^[\s№#]*(?:no\.?|n\.?)\s*/i, "")
    .replace(/№/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
  if (!passportNorm || passportNorm.length < 6) {
    errors.push("passport_invalid");
  }

  const phoneRaw = input.phone.trim();
  const phoneNorm = normalizePhoneForValidation(phoneRaw);
  if (!phoneRaw || /#error!/i.test(phoneRaw) || phoneNorm.length < 10) {
    errors.push("phone_invalid");
  }

  const email = (input.email ?? "").trim().toLowerCase();
  if (email && getBlockedPlatformEmails().has(email)) {
    errors.push("test_lead_detected");
  }

  if (TEST_NAME_PATTERN.test(name) && !errors.includes("test_lead_detected")) {
    errors.push("test_lead_detected");
  }

  return errors;
}
