import { NextResponse } from "next/server";
import { FinanceError, financeErrorStatus } from "@/lib/finance/errors";

const ERROR_MESSAGES_RU: Record<string, string> = {
  FINANCE_ACCESS_DENIED: "У вас нет доступа к разделу «Финансы».",
  FINANCE_PROFILE_NOT_FOUND: "Финансовый профиль не найден.",
  FINANCE_CLIENT_NOT_FOUND: "Клиент не найден.",
  FINANCE_CONTRACT_ALREADY_EXISTS:
    "Договор уже создан. Используйте изменение суммы.",
  FINANCE_CONTRACT_AMOUNT_REQUIRED: "Укажите сумму договора.",
  FINANCE_CONTRACT_NOT_SET: "Сначала укажите сумму договора.",
  FINANCE_CHANGE_REASON_REQUIRED: "Укажите причину изменения.",
  FINANCE_AMOUNT_UNCHANGED:
    "Новое значение должно отличаться от текущего.",
  FINANCE_PAYMENT_AMOUNT_INVALID: "Некорректная сумма платежа.",
  FINANCE_PAYMENT_DATE_INVALID: "Некорректная дата платежа.",
  FINANCE_PAYMENT_NOT_FOUND: "Платёж не найден.",
  FINANCE_PAYMENT_ALREADY_VOIDED: "Платёж уже аннулирован.",
  FINANCE_DIRECTION_INVALID: "Некорректное направление.",
  FINANCE_CONFLICT:
    "Финансовые данные были изменены другим сотрудником. Обновите страницу и повторите действие.",
  FINANCE_CONCURRENT_MODIFICATION:
    "Финансовые данные были изменены другим сотрудником. Обновите страницу и повторите действие.",
  FINANCE_COMMENT_TOO_LONG: "Комментарий слишком длинный.",
  FINANCE_IDEMPOTENCY_REQUIRED: "Требуется ключ идемпотентности.",
  FINANCE_STORE_UNAVAILABLE: "Финансовое хранилище временно недоступно.",
};

export function financeErrorResponse(error: unknown) {
  if (error instanceof FinanceError) {
    const localized = ERROR_MESSAGES_RU[error.code] ?? error.message;
    return NextResponse.json(
      { error: localized, code: error.code },
      { status: financeErrorStatus(error.code) },
    );
  }
  console.error("[finance]", error);
  return NextResponse.json(
    {
      error: "Не удалось выполнить финансовую операцию.",
      code: "FINANCE_INTERNAL_ERROR",
    },
    { status: 500 },
  );
}
