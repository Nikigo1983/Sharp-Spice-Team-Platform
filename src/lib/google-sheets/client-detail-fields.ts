import type { Client } from "./types";

function display(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed !== "—" ? trimmed : "—";
}

/** Все поля вкладки «Клиенты» (Google Sheets) в порядке таблицы. */
export function getClientSheetFields(
  client: Client,
): Array<{ label: string; value: string }> {
  return [
    { label: "Фамилия", value: display(client.name) },
    { label: "Латиница", value: display(client.citizenship) },
    {
      label: "Номер паспорта",
      value: display(client.passportNumber ?? client.id),
    },
    { label: "Электронная почта", value: display(client.email) },
    {
      label: "Дата подачи",
      value: display(client.submittedAt ?? client.createdAt),
    },
    {
      label: "Предполагаемое одобрение",
      value: display(client.expectedApprovalAt),
    },
    {
      label: "Имя референта",
      value: display(client.referentName ?? client.manager),
    },
    { label: "Адрес букинга", value: display(client.bookingAddress) },
    { label: "Дата букинга (от и до)", value: display(client.bookingRange) },
    { label: "Дата одобрения ВНЖ", value: display(client.approvalAt) },
    { label: "Заметки", value: display(client.notes) },
    {
      label: "Дата выдачи карточки ВНЖ",
      value: display(client.residenceCardIssuedAt),
    },
    { label: "Пароль для приложения", value: display(client.appPassword) },
    { label: "Партнер от кого клиент", value: display(client.partnerName) },
    { label: "Договор", value: display(client.contract) },
  ];
}
