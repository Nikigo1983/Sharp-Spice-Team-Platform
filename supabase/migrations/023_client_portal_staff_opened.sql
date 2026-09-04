-- Track whether staff has opened a submitted questionnaire ("Новая" badge).

alter table client_portal_questionnaires
  add column if not exists staff_opened_at timestamptz;
