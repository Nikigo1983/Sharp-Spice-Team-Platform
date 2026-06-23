import { CALENDAR_TIMEZONE } from "./constants";

export function isValidIanaTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function resolveBrowserTimeZone(): string {
  if (typeof Intl !== "undefined") {
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone?.trim();
    if (browserTimeZone && isValidIanaTimeZone(browserTimeZone)) {
      return browserTimeZone;
    }
  }

  return CALENDAR_TIMEZONE;
}

export function formatTimeZoneLabel(
  timeZone: string,
  locale = "ru-RU",
): string {
  const now = new Date();
  const name =
    new Intl.DateTimeFormat(locale, {
      timeZone,
      timeZoneName: "longGeneric",
    })
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")?.value ??
    new Intl.DateTimeFormat(locale, {
      timeZone,
      timeZoneName: "long",
    })
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")?.value ??
    timeZone;

  const offset =
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      timeZoneName: "shortOffset",
    })
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")?.value ?? "UTC";

  return `${name} (${offset})`;
}
