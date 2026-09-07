export type OnboardingAnswers = Record<string, unknown>;

export type SpioraOnboardingResponse = {
  id: string;
  createdAt: string;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  answers: OnboardingAnswers;
};

export type SpioraOnboardingStoreData = {
  responses: SpioraOnboardingResponse[];
};

export type SpioraOnboardingListItem = {
  id: string;
  createdAt: string;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  readinessLabel: string | null;
  goLiveLabel: string | null;
};
