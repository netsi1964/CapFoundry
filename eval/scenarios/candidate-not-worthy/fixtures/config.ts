export interface AppConfig {
  region: "dk" | "se" | "no";
  featureFlags: string[];
  retryBudgetMs: number;
}

export const defaults: AppConfig = {
  region: "dk",
  featureFlags: [],
  retryBudgetMs: 2500,
};
