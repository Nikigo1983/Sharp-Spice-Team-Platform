import { CALENDAR_TIMEZONE } from "./constants";

export function isValidIanaTimeZone(ianaTimeZone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: ianaTimeZone });
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

function readTimeZoneNamePart(
  ianaTimeZone: string,
  locale: string,
  timeZoneName: "long" | "longGeneric",
): string | undefined {
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: ianaTimeZone,
      timeZoneName,
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value;
  } catch {
    return undefined;
  }
}

export function formatTimeZoneLabel(
  ianaTimeZone: string,
  locale = "ru-RU",
): string {
  try {
    const name =
      readTimeZoneNamePart(ianaTimeZone, locale, "long") ??
      readTimeZoneNamePart(ianaTimeZone, locale, "longGeneric") ??
      ianaTimeZone.replace(/_/g, " ");

    const offset =
      new Intl.DateTimeFormat("en-GB", {
        timeZone: ianaTimeZone,
        timeZoneName: "shortOffset",
      })
        .formatToParts(new Date())
        .find((part) => part.type === "timeZoneName")?.value ?? "UTC";

    return `${name} (${offset})`;
  } catch {
    return ianaTimeZone;
  }
}
