export type BillStatus = "ISSUED" | "PARTIALLY_PAID" | "PAID";
export type PaymentStatus = "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type Payment = {
  id: string;
  paymentReference: string;
  contributorName: string;
  amountMinor: number;
  currency: "NGN";
  status: PaymentStatus;
  createdAt: string;
  idempotencyKey: string;
  providerMode: "demo";
};

export type Bill = {
  id: string;
  publicBillId: string;
  shareToken: string;
  patientName: string;
  providerName: string;
  facilityName: string;
  description: string;
  dueDate: string;
  currency: "NGN";
  amountMinor: number;
  amountPaidMinor: number;
  status: BillStatus;
  createdAt: string;
  payments: Payment[];
};

export type DemoState = {
  bills: Bill[];
  activeBillId: string;
};

export const DEMO_STORAGE_KEY = "brivia-demo-ledger-v1";

export const seedDemoState: DemoState = {
  activeBillId: "bill_seed_01",
  bills: [
    {
      id: "bill_seed_01",
      publicBillId: "BRV-7F4A8C2",
      shareToken: "care-7f4a8c2-mg2p",
      patientName: "Amara Okafor",
      providerName: "Dr. Temi Adebayo",
      facilityName: "Ivycare Medical Centre",
      description: "Outpatient treatment support",
      dueDate: "2026-09-05",
      currency: "NGN",
      amountMinor: 18500000,
      amountPaidMinor: 6500000,
      status: "PARTIALLY_PAID",
      createdAt: "2026-08-16T09:30:00.000Z",
      payments: [
        {
          id: "pay_seed_01",
          paymentReference: "BRV-PAY-48291",
          contributorName: "M. Okafor",
          amountMinor: 4000000,
          currency: "NGN",
          status: "COMPLETED",
          createdAt: "2026-08-16T11:12:00.000Z",
          idempotencyKey: "seed-payment-one",
          providerMode: "demo",
        },
        {
          id: "pay_seed_02",
          paymentReference: "BRV-PAY-59016",
          contributorName: "Ada N.",
          amountMinor: 2500000,
          currency: "NGN",
          status: "COMPLETED",
          createdAt: "2026-08-16T14:46:00.000Z",
          idempotencyKey: "seed-payment-two",
          providerMode: "demo",
        },
      ],
    },
  ],
};

export function formatMoney(amountMinor: number, currency: string = "NGN") {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

export function formatDate(value: string, withTime = false) {
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

export function remainingMinor(bill: Bill) {
  return Math.max(bill.amountMinor - bill.amountPaidMinor, 0);
}

export function billProgress(bill: Bill) {
  return Math.min(Math.round((bill.amountPaidMinor / bill.amountMinor) * 100), 100);
}

export function makeDemoId(prefix: string) {
  const bytes = new Uint32Array(2);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
    return `${prefix}_${bytes[0].toString(36)}${bytes[1].toString(36)}`;
  }
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function createDemoBill(input: {
  patientName: string;
  description: string;
  amountMinor: number;
  dueDate: string;
}): Bill {
  const createdAt = new Date().toISOString();
  return {
    id: makeDemoId("bill"),
    publicBillId: `BRV-${makeDemoId("x").replace("x_", "").slice(0, 8).toUpperCase()}`,
    shareToken: makeDemoId("care"),
    patientName: input.patientName.trim(),
    providerName: "Dr. Temi Adebayo",
    facilityName: "Ivycare Medical Centre",
    description: input.description.trim(),
    dueDate: input.dueDate,
    currency: "NGN",
    amountMinor: input.amountMinor,
    amountPaidMinor: 0,
    status: "ISSUED",
    createdAt,
    payments: [],
  };
}
