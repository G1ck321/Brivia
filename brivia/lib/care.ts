/**
 * Care Circle (v2) API client.
 * Mirrors lib/api.ts conventions: /api proxy, Bearer token from localStorage.
 */

import type { Payment } from "./api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

export interface BillLine {
  id: string;
  label: string;
  amount_minor: number;
  funded_minor: number;
  remaining_minor: number;
  position: number;
}

export interface CareBill {
  public_bill_id: string;
  description: string;
  provider_name: string;
  facility_name: string;
  currency: string;
  amount_minor: number;
  amount_paid_minor: number;
  remaining_balance_minor: number;
  status: string;
  due_date: string;
  lines: BillLine[];
  verified: boolean;
  verify_note?: string | null;
}

export interface CircleEntry {
  contributor_name: string;
  initials: string;
  amount_minor: number;
  line_label?: string | null;
  created_at: string;
}

export interface TelegramStatus {
  configured: boolean;
  bot_username?: string | null;
  message: string;
}

export interface CarePayload {
  bill: CareBill;
  circle: CircleEntry[];
  telegram: TelegramStatus;
  currencies: string[];
}

export interface Quote {
  currency: string;
  bill_currency: string;
  debit_minor: number;
  receive_minor: number;
  fee_minor: number;
  net_minor: number;
  rate: number;
  source: "ilp" | "indicative";
  expires_at: string;
  note: string;
}

export interface ClaimResult {
  payment: Payment;
  line_id?: string | null;
  receipt_path: string;
  message: string;
}

export interface Receipt {
  payment_reference: string;
  contributor_name: string;
  gross_minor: number;
  fee_minor: number;
  net_minor: number;
  currency: string;
  bill_public_id: string;
  description: string;
  provider_name: string;
  facility_name: string;
  line_label?: string | null;
  status: string;
  created_at: string;
}

export interface ReconRow {
  payment_reference: string;
  contributor_name: string;
  line_label?: string | null;
  gross_minor: number;
  fee_minor: number;
  net_minor: number;
  status: string;
  external_payment_id?: string | null;
  created_at: string;
}

export interface ReconTotals {
  gross_minor: number;
  fee_minor: number;
  net_minor: number;
  settled_count: number;
  pending_count: number;
}

export interface Reconciliation {
  bill_public_id: string;
  currency: string;
  rows: ReconRow[];
  totals: ReconTotals;
}

export interface VerifyResult {
  verified: boolean;
  algorithm?: string | null;
  signed_at?: string | null;
  payload_hash?: string | null;
  note: string;
}

export interface NotificationRow {
  id: string;
  channel: string;
  bill_id?: string | null;
  body: string;
  status: string;
  created_at: string;
  sent_at?: string | null;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("brivia_token");
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers as Record<string, string>) },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

// --- Public ---------------------------------------------------------------

export function getCare(shareToken: string) {
  return request<CarePayload>(`/v2/public/bills/${shareToken}/care`);
}

export function getCircle(shareToken: string) {
  return request<CircleEntry[]>(`/v2/public/bills/${shareToken}/circle`);
}

export function getQuote(
  shareToken: string,
  body: { amount_minor: number; currency: string; line_id?: string | null; sender_wallet_url?: string | null }
) {
  return request<Quote>(`/v2/public/bills/${shareToken}/quote`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function claim(
  shareToken: string,
  body: {
    amount_minor: number;
    contributor_name: string;
    idempotency_key: string;
    line_id?: string | null;
  }
) {
  return request<ClaimResult>(`/v2/public/bills/${shareToken}/claim`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getReceipt(reference: string) {
  return request<Receipt>(`/v2/public/receipts/${reference}`);
}

export function subscribeTelegram(
  shareToken: string,
  body: { chat_id?: string | null; handle?: string | null }
) {
  return request<{ subscribed: boolean; telegram: TelegramStatus; delivery: { status: string } }>(
    `/v2/public/bills/${shareToken}/telegram`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

/** Start a real wallet payment. The backend returns the wallet approval URL. */
export function startWalletPayment(
  shareToken: string,
  body: {
    amount_minor: number;
    contributor_name: string;
    sender_wallet_url: string;
    line_id?: string | null;
  }
) {
  return request<{ payment_id: string; redirect_url: string; message: string }>(
    `/public/bills/${shareToken}/pay/open-payments`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

// --- Provider -------------------------------------------------------------

export function getLines(billId: string) {
  return request<BillLine[]>(`/v2/bills/${billId}/lines`);
}

export function setLines(billId: string, lines: { label: string; amount_minor: number }[]) {
  return request<BillLine[]>(`/v2/bills/${billId}/lines`, {
    method: "POST",
    body: JSON.stringify({ lines }),
  });
}

export function getReconciliation(billId: string) {
  return request<Reconciliation>(`/v2/bills/${billId}/reconciliation`);
}

export function signBill(billId: string) {
  return request<VerifyResult>(`/v2/bills/${billId}/verify`, { method: "POST" });
}

export function verifyBill(billId: string) {
  return request<VerifyResult>(`/v2/bills/${billId}/verify`);
}

export function flushNotifications() {
  return request<{ sent: number; pending: number; configured: boolean }>(
    `/v2/notifications/flush`,
    { method: "POST" }
  );
}

export async function downloadReconciliationCsv(billId: string, filename: string) {
  const res = await fetch(`${API_BASE}/v2/bills/${billId}/reconciliation?format=csv`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Could not export the reconciliation.");

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// --- Formatting -----------------------------------------------------------

export function money(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

export function shortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" });
}
