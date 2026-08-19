import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { demoPaymentAdapter } from "@/lib/demo-payment-adapter";
import {
  createDemoBill,
  type Bill,
  type DemoState,
  type Payment,
  DEMO_STORAGE_KEY,
  makeDemoId,
  seedDemoState,
} from "@/lib/brivia-demo";

type CreateBillInput = {
  patientName: string;
  description: string;
  amountMinor: number;
  dueDate: string;
};

type ContributionInput = {
  token: string;
  contributorName: string;
  amountMinor: number;
  idempotencyKey: string;
};

type BriviaDemoContextValue = {
  state: DemoState;
  activeBill: Bill;
  createBill: (input: CreateBillInput) => Bill;
  contribute: (input: ContributionInput) => Payment;
  getBillByToken: (token: string) => Bill | undefined;
  getShareUrl: (bill: Bill) => string;
  setActiveBillId: (id: string) => void;
  resetDemo: () => void;
};

const BriviaDemoContext = createContext<BriviaDemoContextValue | null>(null);

function loadDemoState(): DemoState {
  if (typeof window === "undefined") return seedDemoState;
  try {
    const stored = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (stored) return JSON.parse(stored) as DemoState;
  } catch {
    // A corrupted local demo ledger should never stop the UI from opening.
  }
  return seedDemoState;
}

export function BriviaDemoProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DemoState>(loadDemoState);

  useEffect(() => {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const activeBill = state.bills.find((bill) => bill.id === state.activeBillId) ?? state.bills[0];

  const value = useMemo<BriviaDemoContextValue>(
    () => ({
      state,
      activeBill,
      createBill: (input) => {
        const bill = createDemoBill(input);
        setState((previous) => ({ bills: [bill, ...previous.bills], activeBillId: bill.id }));
        return bill;
      },
      contribute: (input) => {
        const bill = state.bills.find((item) => item.shareToken === input.token);
        if (!bill) throw new Error("This secure bill link is no longer available.");
        const result = demoPaymentAdapter.createVerifiedContribution(bill, input);
        if (!result.idempotentReplay) {
          setState((previous) => ({
            ...previous,
            bills: previous.bills.map((item) => item.id === bill.id ? result.updatedBill : item),
          }));
        }
        return result.payment;
      },
      getBillByToken: (token) => state.bills.find((bill) => bill.shareToken === token),
      getShareUrl: (bill) => {
        const base = typeof window === "undefined" ? "" : window.location.origin;
        return `${base}/pay/${bill.shareToken}`;
      },
      setActiveBillId: (id) => setState((previous) => ({ ...previous, activeBillId: id })),
      resetDemo: () => setState(seedDemoState),
    }),
    [activeBill, state],
  );

  return <BriviaDemoContext.Provider value={value}>{children}</BriviaDemoContext.Provider>;
}

export function useBriviaDemo() {
  const context = useContext(BriviaDemoContext);
  if (!context) throw new Error("useBriviaDemo must be used inside BriviaDemoProvider");
  return context;
}
