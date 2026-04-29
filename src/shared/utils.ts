import { randomBytes } from "crypto";

export function generateId(prefix: string = "msg"): string {
  return `${prefix}_${randomBytes(4).toString("hex")}`;
}

export function now(): string {
  return new Date().toISOString();
}

export function expiresAt(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export function secondsAgo(isoTimestamp: string): number {
  return (Date.now() - new Date(isoTimestamp).getTime()) / 1000;
}
