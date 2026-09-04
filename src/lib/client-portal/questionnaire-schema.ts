import type { QuestionnaireSchema } from "./questionnaire-types";

/** Lean onboarding questionnaire for Sharp & Spice client portal (Phase 3). */
export const SHARP_SPICE_ONBOARDING_SCHEMA: QuestionnaireSchema = {
  schemaVersion: 1,
  templateKey: "sharp_spice_client_onboarding",
  title: {
    en: "Client questionnaire",
    ru: "Анкета клиента",
  },
  description: {
    en: "Complete the form. You can save and continue later.",
    ru: "Заполните анкету. Можно сохранить и продолжить позже.",
  },
  sections: [
    {
      id: "personal",
      order: 10,
      title: { en: "Personal information", ru: "Личные данные" },
      description: {
        en: "Basic identity details",
        ru: "Основные данные о вас",
      },
      questions: [
        {
          id: "first_name",
          type: "text",
          order: 10,
          label: { en: "First name", ru: "Имя" },
          required: true,
        },
        {
          id: "last_name",
          type: "text",
          order: 20,
          label: { en: "Last name", ru: "Фамилия" },
          required: true,
        },
        {
          id: "date_of_birth",
          type: "date",
          order: 30,
          label: { en: "Date of birth", ru: "Дата рождения" },
          required: true,
        },
        {
          id: "citizenship",
          type: "text",
          order: 40,
          label: { en: "Citizenship", ru: "Гражданство" },
          required: true,
        },
        {
          id: "passport_number",
          type: "text",
          order: 50,
          label: { en: "Passport number", ru: "Номер паспорта" },
          required: true,
        },
      ],
    },
    {
      id: "contact",
      order: 20,
      title: { en: "Contact information", ru: "Контакты" },
      questions: [
        {
          id: "email",
          type: "email",
          order: 10,
          label: { en: "Email", ru: "Email" },
          required: true,
          readOnly: true,
          derivedFrom: "portal_email",
        },
        {
          id: "phone",
          type: "phone",
          order: 20,
          label: { en: "Phone", ru: "Телефон" },
          required: true,
        },
        {
          id: "city",
          type: "text",
          order: 30,
          label: { en: "City", ru: "Город" },
          required: true,
        },
        {
          id: "country_of_residence",
          type: "text",
          order: 40,
          label: { en: "Country of residence", ru: "Страна проживания" },
          required: true,
        },
        {
          id: "address",
          type: "textarea",
          order: 50,
          label: { en: "Address", ru: "Адрес" },
          required: true,
        },
      ],
    },
    {
      id: "service",
      order: 30,
      title: { en: "Service request", ru: "Запрос услуги" },
      questions: [
        {
          id: "service_type",
          type: "select",
          order: 10,
          label: { en: "Service type", ru: "Тип услуги" },
          required: true,
          options: [
            {
              value: "relocation_croatia",
              label: { en: "Relocation to Croatia", ru: "Релокация в Хорватию" },
            },
            {
              value: "relocation_spain",
              label: { en: "Relocation to Spain", ru: "Релокация в Испанию" },
            },
            {
              value: "consultation",
              label: { en: "Consultation", ru: "Консультация" },
            },
            {
              value: "other",
              label: { en: "Other", ru: "Другое" },
            },
          ],
        },
        {
          id: "family_members",
          type: "select",
          order: 20,
          label: {
            en: "Applying with family?",
            ru: "Подаётесь с семьёй?",
          },
          required: true,
          options: [
            { value: "alone", label: { en: "Alone", ru: "Один/одна" } },
            {
              value: "with_family",
              label: { en: "With family", ru: "С семьёй" },
            },
          ],
        },
        {
          id: "goals",
          type: "textarea",
          order: 30,
          label: {
            en: "Goals and comments",
            ru: "Цели и комментарии",
          },
        },
      ],
    },
    {
      id: "consent",
      order: 40,
      title: { en: "Consent", ru: "Согласие" },
      questions: [
        {
          id: "consent_info",
          type: "information",
          order: 10,
          label: {
            en: "By submitting you confirm the data is accurate.",
            ru: "Отправляя анкету, вы подтверждаете достоверность данных.",
          },
        },
        {
          id: "consent_personal_data",
          type: "boolean",
          order: 20,
          label: {
            en: "I agree to personal data processing",
            ru: "Согласен(на) на обработку персональных данных",
          },
          required: true,
        },
      ],
    },
  ],
};
