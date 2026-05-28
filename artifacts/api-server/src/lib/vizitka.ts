import { customAlphabet } from "nanoid";

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 6);

export function generateVizitkaCode(): string {
  return nanoid();
}
