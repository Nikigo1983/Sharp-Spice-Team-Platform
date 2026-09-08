/**
 * Deterministic AI-03 routing evaluation fixtures.
 * Expected sources are product-semantic targets for the rules layer.
 * Paraphrases are included so tests cannot be satisfied by exact phrase lists.
 */

import type { WorkspaceRouteSource } from "@/lib/ai/workspace-router-types";

export type RoutingEvalCase = {
  id: string;
  category:
    | "knowledge_base"
    | "clients"
    | "emigrant_drive"
    | "emigrant_desk"
    | "formgrid"
    | "generation"
    | "multi"
    | "direct";
  query: string;
  expectedSources: WorkspaceRouteSource[];
  /** Sources that must NOT be selected */
  forbiddenSources?: WorkspaceRouteSource[];
};

export const ROUTING_EVAL_CASES: RoutingEvalCase[] = [
  // A / KB family
  {
    id: "kb-a1",
    category: "knowledge_base",
    query: "Какие документы нужны для ВНЖ в Хорватии?",
    expectedSources: ["knowledge_base"],
    forbiddenSources: ["emigrant_drive", "clients"],
  },
  {
    id: "kb-a2",
    category: "knowledge_base",
    query: "Что нужно для получения ВНЖ в Хорватии?",
    expectedSources: ["knowledge_base"],
    forbiddenSources: ["emigrant_drive"],
  },
  {
    id: "kb-a3",
    category: "knowledge_base",
    query: "Требования к digital nomad",
    expectedSources: ["knowledge_base"],
  },
  {
    id: "kb-a4",
    category: "knowledge_base",
    query: "Расскажи условия программы digital nomad",
    expectedSources: ["knowledge_base"],
    forbiddenSources: ["clients"],
  },
  {
    id: "kb-a5",
    category: "knowledge_base",
    query: "Что требуется от заявителя?",
    expectedSources: ["knowledge_base"],
  },
  {
    id: "kb-a6",
    category: "knowledge_base",
    query: "Какие основания существуют?",
    expectedSources: ["knowledge_base"],
  },
  {
    id: "kb-a7",
    category: "knowledge_base",
    query: "Какие требования к доходу?",
    expectedSources: ["knowledge_base"],
  },
  {
    id: "kb-a8",
    category: "knowledge_base",
    query: "Сколько должен зарабатывать заявитель?",
    expectedSources: ["knowledge_base"],
    forbiddenSources: ["clients"],
  },
  {
    id: "kb-a9",
    category: "knowledge_base",
    query: "На какой срок выдаётся разрешение?",
    expectedSources: ["knowledge_base"],
  },
  {
    id: "kb-a10",
    category: "knowledge_base",
    query: "Можно ли податься с семьёй?",
    expectedSources: ["knowledge_base"],
  },
  {
    id: "kb-a11",
    category: "knowledge_base",
    query: "What documents are required for Croatian residence?",
    expectedSources: ["knowledge_base"],
    forbiddenSources: ["emigrant_drive"],
  },
  {
    id: "kb-a12",
    category: "knowledge_base",
    query: "Explain the digital nomad program requirements",
    expectedSources: ["knowledge_base"],
  },
  {
    id: "kb-h",
    category: "knowledge_base",
    query: "Что такое digital nomad?",
    expectedSources: ["knowledge_base"],
    forbiddenSources: ["clients", "emigrant_drive"],
  },
  {
    id: "kb-d",
    category: "knowledge_base",
    query: "Расскажи требования digital nomad",
    expectedSources: ["knowledge_base"],
  },
  {
    id: "kb-paraphrase-1",
    category: "knowledge_base",
    query: "Подскажи список бумаг для хорватского ВНЖ",
    expectedSources: ["knowledge_base"],
    forbiddenSources: ["emigrant_drive"],
  },
  {
    id: "kb-paraphrase-2",
    category: "knowledge_base",
    query: "Какие условия надо выполнить по nomad-визе?",
    expectedSources: ["knowledge_base"],
  },

  // B / client docs
  {
    id: "drive-b1",
    category: "emigrant_drive",
    query: "Какие документы загрузил Иван Петров?",
    expectedSources: ["clients", "emigrant_drive"],
    forbiddenSources: [],
  },
  {
    id: "drive-b2",
    category: "emigrant_drive",
    query: "Найди скан паспорта у Белоус Екатерина",
    expectedSources: ["clients", "emigrant_drive"],
  },
  {
    id: "drive-primary",
    category: "emigrant_drive",
    query: "Что лежит в папке ЭМИГРАНТ по этому делу?",
    expectedSources: ["emigrant_drive"],
  },

  // C / multi
  {
    id: "multi-c1",
    category: "multi",
    query: "Каких документов не хватает Ивану Петрову для ВНЖ в Хорватии?",
    expectedSources: ["clients", "emigrant_drive", "knowledge_base"],
  },
  {
    id: "multi-f",
    category: "multi",
    query: "Напиши Ивану письмо и укажи, какие документы у него отсутствуют",
    expectedSources: ["clients", "emigrant_drive"],
  },

  // Clients
  {
    id: "cli-g",
    category: "clients",
    query: "Покажи клиентов из Хорватии",
    expectedSources: ["clients"],
    forbiddenSources: ["knowledge_base"],
  },
  {
    id: "cli-1",
    category: "clients",
    query: "Какой номер паспорта у клиента Белоус Екатерина?",
    expectedSources: ["clients"],
    forbiddenSources: ["emigrant_drive", "emigrant_desk"],
  },
  {
    id: "cli-2",
    category: "clients",
    query: "Адрес букинга у Белоус Екатерина",
    expectedSources: ["clients"],
  },
  {
    id: "cli-3",
    category: "clients",
    query: "Найди клиентов менеджера Saša",
    expectedSources: ["clients"],
  },
  {
    id: "cli-4",
    category: "clients",
    query: "У кого статус адрес отправлен?",
    expectedSources: ["clients"],
  },
  {
    id: "cli-5",
    category: "clients",
    query: "Show clients by referent Merunka",
    expectedSources: ["clients"],
  },

  // Desk
  {
    id: "desk-1",
    category: "emigrant_desk",
    query: "Какой статус дела в кабинете у Белова?",
    expectedSources: ["emigrant_desk", "clients"],
  },
  {
    id: "desk-2",
    category: "emigrant_desk",
    query: "статус в emigrant desk",
    expectedSources: ["emigrant_desk"],
  },
  {
    id: "desk-3",
    category: "emigrant_desk",
    query: "Текущий статус дела №123",
    expectedSources: ["emigrant_desk"],
  },

  // Formgrid
  {
    id: "fg-1",
    category: "formgrid",
    query: "Покажи новые заявки Formgrid за 7 дней",
    expectedSources: ["formgrid"],
  },
  {
    id: "fg-2",
    category: "formgrid",
    query: "Сколько анкет пришло сегодня?",
    expectedSources: ["formgrid"],
  },
  {
    id: "fg-3",
    category: "formgrid",
    query: "List new Formgrid leads",
    expectedSources: ["formgrid"],
  },

  // Generation
  {
    id: "gen-e",
    category: "generation",
    query: "Напиши вежливое письмо клиенту с напоминанием",
    expectedSources: [],
    forbiddenSources: ["knowledge_base", "clients", "emigrant_drive"],
  },
  {
    id: "gen-1",
    category: "generation",
    query: "Сделай этот текст более профессиональным",
    expectedSources: [],
  },
  {
    id: "gen-2",
    category: "generation",
    query: "Переведи этот текст на английский",
    expectedSources: [],
  },
  {
    id: "gen-3",
    category: "generation",
    query: "Rewrite this message in a warmer tone",
    expectedSources: [],
  },

  // More paraphrases / edge
  {
    id: "kb-extra-1",
    category: "knowledge_base",
    query: "Нужен чеклист документов для подачи на ВНЖ",
    expectedSources: ["knowledge_base"],
    forbiddenSources: ["emigrant_drive"],
  },
  {
    id: "kb-extra-2",
    category: "knowledge_base",
    query: "Какие immigration требования по программе?",
    expectedSources: ["knowledge_base"],
  },
  {
    id: "kb-extra-3",
    category: "knowledge_base",
    query: "Documents required for digital nomad Croatia",
    expectedSources: ["knowledge_base"],
  },
  {
    id: "cli-extra-1",
    category: "clients",
    query: "Данные клиента Калашниковой из таблицы",
    expectedSources: ["clients"],
  },
  {
    id: "cli-extra-2",
    category: "clients",
    query: "Список клиентов по партнеру Шарипа",
    expectedSources: ["clients"],
  },
  {
    id: "drive-extra-1",
    category: "emigrant_drive",
    query: "Открой PDF договор у Марии Ивановой в Drive",
    expectedSources: ["clients", "emigrant_drive"],
  },
  {
    id: "drive-extra-2",
    category: "emigrant_drive",
    query: "Покажи файлы клиента в папке эмигрант",
    expectedSources: ["emigrant_drive"],
  },
  {
    id: "multi-extra-1",
    category: "multi",
    query: "Сравни загруженные документы Петра с требованиями ВНЖ",
    expectedSources: ["clients", "emigrant_drive", "knowledge_base"],
  },
  {
    id: "gen-extra-1",
    category: "generation",
    query: "Напиши общее напоминание без персональных данных",
    expectedSources: [],
  },
  {
    id: "desk-extra-1",
    category: "emigrant_desk",
    query: "ВНЖ одобрен — проверь статус в кабинете",
    expectedSources: ["emigrant_desk"],
  },
  {
    id: "fg-extra-1",
    category: "formgrid",
    query: "Новые клиенты из анкеты за вчера",
    expectedSources: ["formgrid"],
  },
  {
    id: "kb-extra-4",
    category: "knowledge_base",
    query: "Можно ли включить семью в заявку digital nomad?",
    expectedSources: ["knowledge_base"],
  },
  {
    id: "kb-extra-5",
    category: "knowledge_base",
    query: "Какой минимальный доход нужен заявителю?",
    expectedSources: ["knowledge_base"],
    forbiddenSources: ["clients"],
  },
];

export function summarizeRoutingEvalCategories(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of ROUTING_EVAL_CASES) {
    counts[item.category] = (counts[item.category] ?? 0) + 1;
  }
  return counts;
}
