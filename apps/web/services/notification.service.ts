import { apiRequest } from "@/lib/api";

export const notificationService = {
  list(token: string) {
    return apiRequest("/notifications", { token });
  },
};
