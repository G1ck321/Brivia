/**
 * Brivia API client
 * 
 * All calls go through FastAPI backend → Node.js Open Payments server
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

// --- Types ---

export interface User {
  id: string;
  email: string;
  name: string;
  role: "provider" | "patient";
  facility_name?: string;
  created_at: string;
}

export interface Bill {
  id: string;
  public_bill_id: string;
  provider_id: string;
  patient_name: string;
  description: string;
  amount_minor: number;
  currency: string;
  amount_paid_minor: number;
  remaining_balance_minor: number;
  status: string;
  due_date: string;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  bill_id: string;
  contributor_name: string;
  amount_minor: number;
  currency: string;
  status: string;
  payment_reference: string;
  created_at: string;
}

export interface PublicBill {
  public_bill_id: string;
  provider_name: string;
  facility_name: string;
  description: string;
  amount_minor: number;
  currency: string;
  amount_paid_minor: number;
  remaining_balance_minor: number;
  status: string;
  due_date: string;
}

// --- Helpers ---

let authToken: string | null = null;

function setAuthToken(token: string | null) {
  authToken = token;
  if (typeof window !== "undefined") {
    if (token) localStorage.setItem("brivia_token", token);
    else localStorage.removeItem("brivia_token");
  }
}

function getAuthToken(): string | null {
  if (authToken) return authToken;
  if (typeof window !== "undefined") {
    authToken = localStorage.getItem("brivia_token");
  }
  return authToken;
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API error ${res.status}`);
  }

  return res.json();
}

// --- Auth ---

export async function register(data: {
  email: string;
  password: string;
  name: string;
  role: "provider" | "patient";
  facility_name?: string;
}) {
  const result = await apiRequest<{
    access_token: string;
    user: User;
  }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
  setAuthToken(result.access_token);
  return result;
}

export async function login(email: string, password: string) {
  const result = await apiRequest<{
    access_token: string;
    user: User;
  }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setAuthToken(result.access_token);
  return result;
}

export async function getMe() {
  return apiRequest<User>("/auth/me");
}

// --- Bills ---

export async function createBill(data: {
  patient_name: string;
  description: string;
  amount_minor: number;
  currency?: string;
  due_date: string;
}) {
  return apiRequest<Bill>("/bills/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getMyBills() {
  return apiRequest<Bill[]>("/bills/");
}

export async function getBill(billId: string) {
  return apiRequest<Bill>(`/bills/${billId}`);
}

export async function shareBill(billId: string) {
  return apiRequest<{ share_token: string; share_url: string; bill_id: string }>(
    `/bills/${billId}/share`,
    { method: "POST" }
  );
}

// --- Public (no auth) ---

export async function getPublicBill(shareToken: string) {
  return apiRequest<PublicBill>(`/public/bills/${shareToken}`);
}

export async function contributeToBill(
  shareToken: string,
  data: {
    amount_minor: number;
    contributor_name?: string;
    idempotency_key: string;
  }
) {
  return apiRequest<Payment>(`/public/bills/${shareToken}/pay`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// --- Payments (authenticated) ---

export async function getBillPayments(billId: string) {
  return apiRequest<Payment[]>(`/payments/bill/${billId}`);
}

// --- Open Payments flow ---

export async function setupIncomingPayment(billId: string) {
  return apiRequest<{
    incoming_payment_id: string;
    wallet_address: string;
    access_token: string;
  }>(`/payments/bill/${billId}/incoming`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function createOutgoingGrant(billId: string, senderWalletUrl: string, amountMinor: number) {
  return apiRequest<{
    payment_id: string;
    interact_redirect: string;
  }>(`/payments/bill/${billId}/outgoing-grant`, {
    method: "POST",
    body: JSON.stringify({
      sender_wallet_url: senderWalletUrl,
      amount_minor: amountMinor,
    }),
  });
}

export async function initiateOutgoingGrant(publicBillId: string, senderWalletUrl: string, amountMinor: number) {
  // First, we need to get the bill ID from the public bill ID
  // This is a simplified version - in production, you'd look up the bill properly
  return apiRequest<{
    payment_id: string;
    interact_redirect: string;
    continue_uri: string;
    continue_token: string;
  }>(`/payments/outgoing-grant`, {
    method: "POST",
    body: JSON.stringify({
      public_bill_id: publicBillId,
      sender_wallet_url: senderWalletUrl,
      amount_minor: amountMinor,
    }),
  });
}

// --- Open Payments Flow ---

export async function initiateOpenPayments(
  shareToken: string,
  data: {
    amount_minor: number;
    contributor_name: string;
    sender_wallet_url: string;
  }
) {
  return apiRequest<{
    payment_id: string;
    redirect_url: string;
    message: string;
  }>(`/public/bills/${shareToken}/pay/open-payments`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getOpenPaymentsCallback(
  shareToken: string,
  paymentId: string
) {
  return apiRequest<{
    payment: Payment;
    bill_status: string;
    received_amount: number;
    gross_amount: number;
    platform_fee: number;
    net_amount: number;
    message: string;
  }>(`/public/bills/${shareToken}/pay/callback?payment_id=${paymentId}`);
}

export async function pollSettlement(billId: string) {
  return apiRequest<{
    status: string;
    received_amount: { value: string };
    completed: boolean;
  }>(`/payments/bill/${billId}/poll`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export { setAuthToken };
