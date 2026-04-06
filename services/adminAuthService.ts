import { ExamConfig } from "../types";

export const DEFAULT_TEACHER_PASSWORD = "admin";

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

export const hashAdminPassword = async (password: string): Promise<string> => {
  const digest = await window.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(password)
  );
  return toHex(digest);
};

export const hasCustomAdminPassword = (config: Partial<ExamConfig> | null | undefined) =>
  !!config?.adminPasswordHash;

export const verifyAdminPassword = async (
  password: string,
  config: Partial<ExamConfig> | null | undefined
): Promise<boolean> => {
  if (!hasCustomAdminPassword(config)) {
    return password === DEFAULT_TEACHER_PASSWORD;
  }

  return (await hashAdminPassword(password)) === config!.adminPasswordHash;
};
