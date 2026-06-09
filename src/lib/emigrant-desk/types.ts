export type EmigrantDeskClient = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  currentStatus: string | null;
  caseNumber: string | null;
  consulate: string | null;
  submissionCity: string | null;
  submissionDate: string | null;
  statusUpdatedAt: string | null;
  internalComment: string | null;
};
