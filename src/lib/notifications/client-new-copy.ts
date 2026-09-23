const CLIENT_NEW_SEPARATOR = "\u2063";

export type ClientNewDestination = "intake" | "formgrid";

export function encodeClientNewMessage(
  displayMessage: string,
  options: {
    destination: ClientNewDestination;
    caseId?: string | null;
  },
): string {
  const caseId = options.caseId?.trim() || "";
  return `${displayMessage}${CLIENT_NEW_SEPARATOR}${options.destination}${CLIENT_NEW_SEPARATOR}${caseId}`;
}

export function decodeClientNewMessage(message: string): {
  display: string;
  destination: ClientNewDestination;
  caseId: string | null;
} {
  const parts = message.split(CLIENT_NEW_SEPARATOR);
  if (parts.length < 2) {
    // Legacy plain messages (before encoding).
    const looksFormgrid = /\bformgrid\b/i.test(message);
    return {
      display: message,
      destination: looksFormgrid ? "formgrid" : "intake",
      caseId: null,
    };
  }

  const destinationRaw = parts[parts.length - 2] ?? "intake";
  const caseIdRaw = parts[parts.length - 1] ?? "";
  const display = parts.slice(0, -2).join(CLIENT_NEW_SEPARATOR);
  const destination: ClientNewDestination =
    destinationRaw === "formgrid" ? "formgrid" : "intake";

  return {
    display: display || message,
    destination,
    caseId: caseIdRaw.trim() || null,
  };
}
