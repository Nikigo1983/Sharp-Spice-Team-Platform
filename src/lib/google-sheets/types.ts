export const CLIENT_DIRECTIONS = [
  "Испания",
  "Хорватия",
  "Словакия",
  "Португалия",
] as const;

export const CLIENT_STATUSES = [
  "Новый",
  "В работе",
  "Консультация",
  "Подготовка документов",
  "Завершён",
] as const;

export type ClientDirection = (typeof CLIENT_DIRECTIONS)[number];
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export type Client = {
  id: string;
  name: string;
  phone: string;
  email: string;
  country: string;
  citizenship: string;
  direction: string;
  status: string;
  manager: string;
  lastActivity: string;
  createdAt: string;
  // Доп. поля из таблицы "Клиенты Хорватия".
  passportNumber?: string;
  submittedAt?: string;
  submittedAt2?: string;
  expectedApprovalAt?: string;
  referentName?: string;
  bookingAddress?: string;
  bookingRange?: string;
  approvalAt?: string;
  notes?: string;
  residenceCardIssuedAt?: string;
  appPassword?: string;
  partnerName?: string;
  contract?: string;
  rowIndex?: number;
};

export type ClientSurvey = {
  id: string;
  clientId: string;
  title: string;
  filledAt: string;
  processingStatus: string;
};

export type ClientDocument = {
  id: string;
  clientId: string;
  name: string;
  uploadedAt: string;
  category: string;
};

export type ClientNote = {
  id: string;
  clientId: string;
  createdAt: string;
  author: string;
  text: string;
  rowIndex?: number;
};

export type ClientFilters = {
  search?: string;
  direction?: string;
  status?: string;
  manager?: string;
  country?: string;
};

export type ClientsListResult = {
  items: Client[];
  total: number;
  page: number;
  pageSize: number;
  source: "google_sheets" | "demo";
};

export type ClientDetail = {
  client: Client;
  surveys: ClientSurvey[];
  documents: ClientDocument[];
  notes: ClientNote[];
  source: "google_sheets" | "demo";
};
