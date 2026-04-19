export type AppTheme = "light" | "dark";

export interface AppStoreState {
  theme: AppTheme;
}

export const initialAppStoreState: AppStoreState = {
  theme: "light",
};
