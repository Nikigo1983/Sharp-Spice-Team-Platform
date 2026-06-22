import type { CalendarScope } from "./types";

export type CalendarLayers = {
  personal: boolean;
  company: boolean;
};

export const CALENDAR_LAYERS_STORAGE_KEY = "calendar:layers";

export const DEFAULT_CALENDAR_LAYERS: CalendarLayers = {
  personal: true,
  company: true,
};

export function readCalendarLayers(): CalendarLayers {
  if (typeof window === "undefined") {
    return DEFAULT_CALENDAR_LAYERS;
  }

  try {
    const raw = window.localStorage.getItem(CALENDAR_LAYERS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_CALENDAR_LAYERS;
    }

    const parsed = JSON.parse(raw) as Partial<CalendarLayers>;
    return {
      personal: parsed.personal !== false,
      company: parsed.company !== false,
    };
  } catch {
    return DEFAULT_CALENDAR_LAYERS;
  }
}

export function writeCalendarLayers(layers: CalendarLayers): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(CALENDAR_LAYERS_STORAGE_KEY, JSON.stringify(layers));
}

export function layersToScopes(layers: CalendarLayers): CalendarScope[] {
  const scopes: CalendarScope[] = [];
  if (layers.personal) {
    scopes.push("personal");
  }
  if (layers.company) {
    scopes.push("company");
  }
  return scopes;
}

export function hasActiveLayer(layers: CalendarLayers): boolean {
  return layers.personal || layers.company;
}
