/**
 * Brivia demo-only payment adapter.
 * This simulates an authoritative provider response for local UI testing only.
 * Replace this module with a server call to the FastAPI PaymentProvider interface in production.
 */
import {
  type Bill,
  type Payment,
  makeDemoId,
  remainingMinor,
} from "./brivia-demo";

export type DemoPaymentRequest = {
  contributorName: string;
  amountMinor: number;
  idempotencyKey: string;
};

export type DemoPaymentResult = {
  payment: Payment;
  updatedBill: Bill;
  idempotentReplay: boolean;
};

export const demoPaymentAdapter = {
  mode: "demo" as const,
  label: "DEMO PAYMENT — no funds move",

  createVerifiedContribution(bill: Bill, request: DemoPaymentRequest): DemoPaymentResult {
    const existingPayment = bill.payments.find((payment) => payment.idempotencyKey === request.idempotencyKey);
    if (existingPayment) {
      return { payment: existingPayment, updatedBill: bill, idempotentReplay: true };
    }

    const outstanding = remainingMinor(bill);
    if (!Number.isInteger(request.amountMinor) || request.amountMinor <= 0) {
      throw new Error("Enter a valid contribution amount.");
    }
    if (bill.status === "PAID") {
      throw new Error("This bill has already been fully funded.");
    }
    if (request.amountMinor > outstanding) {
      throw new Error("Your contribution is higher than the remaining balance.");
    }

    const payment: Payment = {
      id: makeDemoId("pay"),
      paymentReference: `BRV-PAY-${Math.floor(10000 + Math.random() * 89999)}`,
      contributorName: request.contributorName.trim() || "Anonymous supporter",
      amountMinor: request.amountMinor,
      currency: "NGN",
      status: "COMPLETED",
      createdAt: new Date().toISOString(),
      idempotencyKey: request.idempotencyKey,
      providerMode: "demo",
    };
    const amountPaidMinor = bill.amountPaidMinor + payment.amountMinor;
    const updatedBill: Bill = {
      ...bill,
      amountPaidMinor,
      status: amountPaidMinor >= bill.amountMinor ? "PAID" : "PARTIALLY_PAID",
      payments: [payment, ...bill.payments],
    };

    return { payment, updatedBill, idempotentReplay: false };
  },
};
