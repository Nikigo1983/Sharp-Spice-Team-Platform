type UiIconProps = {
  /** Font Awesome icon name, e.g. `paperclip` or `fa-paperclip`. */
  icon: string;
  className?: string;
};

function normalizeFaIcon(icon: string): string {
  return icon.startsWith("fa-") ? icon : `fa-${icon}`;
}

export function UiIcon({ icon, className }: UiIconProps) {
  return (
    <i
      className={["fa-solid", normalizeFaIcon(icon), className].filter(Boolean).join(" ")}
      aria-hidden
    />
  );
}

export function getFileTypeIconName(contentType: string | null | undefined): string {
  const type = contentType?.toLowerCase() ?? "";
  if (type.startsWith("image/")) return "fa-file-image";
  if (type === "application/pdf") return "fa-file-pdf";
  if (type.includes("spreadsheet") || type.includes("excel")) return "fa-file-excel";
  if (type.includes("word")) return "fa-file-word";
  if (type.includes("presentation") || type.includes("powerpoint")) return "fa-file-powerpoint";
  if (type.includes("zip")) return "fa-file-zipper";
  if (type.startsWith("text/")) return "fa-file-lines";
  return "fa-paperclip";
}

type FileTypeIconProps = {
  contentType: string | null | undefined;
  className?: string;
};

export function FileTypeIcon({ contentType, className }: FileTypeIconProps) {
  return <UiIcon icon={getFileTypeIconName(contentType)} className={className} />;
}
