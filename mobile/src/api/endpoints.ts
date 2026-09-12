import { apiFetch } from "./client";
import { Bet, EventItem, Sport, User, Wallet } from "../types";

export function register(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  country: string;
}) {
  return apiFetch<{ user: User; token: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function login(email: string, password: string) {
  return apiFetch<{ user: User; token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function fetchMe() {
  return apiFetch<User>("/auth/me");
}

export function fetchSports() {
  return apiFetch<Sport[]>("/sports");
}

export function fetchEvents(sportId: string) {
  return apiFetch<EventItem[]>(`/sports/${sportId}/events`);
}

export function fetchWallet() {
  return apiFetch<Wallet>("/wallet");
}

export function deposit(amount: number) {
  return apiFetch<Wallet>("/wallet/deposit", { method: "POST", body: JSON.stringify({ amount }) });
}

export function withdraw(amount: number) {
  return apiFetch<Wallet>("/wallet/withdraw", { method: "POST", body: JSON.stringify({ amount }) });
}

export function placeBet(selectionId: string, stake: number) {
  return apiFetch<Bet>("/bets", { method: "POST", body: JSON.stringify({ selectionId, stake }) });
}

export function fetchMyBets() {
  return apiFetch<Bet[]>("/bets");
}

export function submitKyc(documentType: string, documentReference: string) {
  return apiFetch("/kyc/submit", {
    method: "POST",
    body: JSON.stringify({ documentType, documentReference }),
  });
}

export function setDepositLimits(input: {
  depositLimitDaily?: number | null;
  depositLimitWeekly?: number | null;
  depositLimitMonthly?: number | null;
}) {
  return apiFetch("/responsible-gambling/deposit-limits", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function selfExclude(days: number) {
  return apiFetch("/responsible-gambling/self-exclude", {
    method: "POST",
    body: JSON.stringify({ days }),
  });
}
