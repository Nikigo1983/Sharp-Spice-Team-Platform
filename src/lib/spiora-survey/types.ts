export type SpioraSurveyAnswers = Record<string, unknown>;

export type SpioraSurveyContact = {
  name: string;
  channel: string;
};

export type SpioraSurveyResponse = {
  id: string;
  createdAt: string;
  anonymous: boolean;
  companyName: string | null;
  answers: SpioraSurveyAnswers;
  contact: SpioraSurveyContact | null;
};

export type SpioraSurveyStoreData = {
  responses: SpioraSurveyResponse[];
};

export type SpioraSurveyListItem = {
  id: string;
  createdAt: string;
  anonymous: boolean;
  companyName: string | null;
  industryLabel: string | null;
  teamSizeLabel: string | null;
  painScore: number | null;
  contactOkLabel: string | null;
  contactName: string | null;
};
