export type CheckupResourceType = "website" | "app" | "drive";

export type CheckupResource = {
  id: string;
  type: CheckupResourceType;
  title: string;
  description: string;
  location: string;
  audience: string;
  url: string;
  icon: string;
  actionLabel: string;
};

export type CheckupSection = {
  id: string;
  title: string;
  subtitle?: string;
  items: CheckupResource[];
};

/** Сайт о чекапах в Ереване (Gamma) */
export const YEREVAN_CHECKUPS_SITE_URL =
  "https://gamma.app/docs/-4mc9eehtw41ruwj";

/** Личный кабинет «Формула Здоровья» */
export const FORMULA_HEALTH_APP_URL =
  "https://formula-health-six.vercel.app/auth";

/** Папка с документами по чекапам в Google Drive */
export const YEREVAN_CHECKUPS_DOCS_URL =
  "https://drive.google.com/drive/folders/1xsSDDLTK-raSARCJ3xuZcOu0N_E--zRc?usp=sharing";

export const CHECKUP_SECTIONS: CheckupSection[] = [
  {
    id: "yerevan",
    title: "Ереван",
    subtitle: "Сайт, документы команды и приложение для медчекапов",
    items: [
      {
        id: "yerevan-checkups-site",
        type: "website",
        title: "Сайт о чекапах в Ереване",
        description:
          "Презентация и информация о программах чекапов в Ереване для клиентов.",
        location: "Ереван",
        audience: "Для клиентов",
        url: YEREVAN_CHECKUPS_SITE_URL,
        icon: "fa-solid fa-book-medical",
        actionLabel: "Открыть сайт",
      },
      {
        id: "yerevan-checkups-docs",
        type: "drive",
        title: "Документы по чекапам",
        description:
          "Папка со всеми материалами команды: цены, предложения, планы чекапов и сопровождения.",
        location: "Ереван",
        audience: "Для команды",
        url: YEREVAN_CHECKUPS_DOCS_URL,
        icon: "fa-solid fa-folder-open",
        actionLabel: "Открыть папку",
      },
      {
        id: "formula-health-app",
        type: "app",
        title: "Приложение «Формула Здоровья»",
        description:
          "Личный кабинет Формулы Здоровья: вход для команды и клиентов по медчекапам.",
        location: "Ереван",
        audience: "Кабинет",
        url: FORMULA_HEALTH_APP_URL,
        icon: "fa-solid fa-heart-pulse",
        actionLabel: "Открыть приложение",
      },
    ],
  },
];
