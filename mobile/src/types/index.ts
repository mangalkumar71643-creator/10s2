export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  kycStatus: "NOT_STARTED" | "PENDING" | "APPROVED" | "REJECTED";
  isSelfExcluded: boolean;
  role: "USER" | "ADMIN";
}

export interface Wallet {
  id: string;
  balance: string;
  currency: string;
}

export interface Selection {
  id: string;
  name: string;
  odds: string;
  isWinner: boolean | null;
}

export interface Market {
  id: string;
  name: string;
  status: "OPEN" | "SUSPENDED" | "SETTLED";
  selections: Selection[];
}

export interface EventItem {
  id: string;
  name: string;
  startTime: string;
  status: "SCHEDULED" | "LIVE" | "FINISHED" | "CANCELLED";
  markets: Market[];
}

export interface Sport {
  id: string;
  name: string;
  slug: string;
}

export interface Bet {
  id: string;
  stake: string;
  odds: string;
  potentialPayout: string;
  status: "PENDING" | "WON" | "LOST" | "VOID";
  createdAt: string;
  selection: Selection & { market: Market & { event: EventItem } };
}
