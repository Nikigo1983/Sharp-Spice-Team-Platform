/** Stable identity key for a Formgrid sheet row (notifications + lead review). */
export function buildFormgridRowKey(headers: string[], row: string[]): string {
  const nameIdx = headers.findIndex((header) => /имя|name|фио/i.test(header));
  const emailIdx = headers.findIndex((header) =>
    /email|почта|e-mail/i.test(header),
  );
  const phoneIdx = headers.findIndex((header) => /тел|phone/i.test(header));

  const parts = [
    nameIdx >= 0 ? row[nameIdx] : "",
    emailIdx >= 0 ? row[emailIdx] : "",
    phoneIdx >= 0 ? row[phoneIdx] : "",
    row.join("|"),
  ];
  return parts.join("::");
}

export function formgridSheetRowFromIndex(dataRowIndex: number): number {
  return dataRowIndex + 2;
}

export function formgridDataRowIndexFromSheetRow(sheetRow: number): number {
  return sheetRow - 2;
}
