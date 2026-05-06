"use client";

import { persist } from "zustand/middleware";
import { shallow } from "zustand/shallow";
import { createWithEqualityFn } from "zustand/traditional";

export type SuiSourcePreference = "auto" | "external" | "privy";

export interface SuiPreferenceState {
  preferredSuiSource: SuiSourcePreference;
  setPreferredSuiSource: (source: SuiSourcePreference) => void;
}

export const useSuiPreferenceStore = createWithEqualityFn(
  persist<SuiPreferenceState>(
    (set) => ({
      preferredSuiSource: "auto",
      setPreferredSuiSource: (source) =>
        set({ preferredSuiSource: source }),
    }),
    {
      name: "jumper-sui-preference",
      version: 1,
    },
  ),
  shallow,
);
