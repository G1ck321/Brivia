"use client";

import { Route, Switch } from "wouter";
import { BriviaProviders } from "./providers";
import { Toaster } from "sonner";
import Home from "@/components/HomePage";
import ProviderDashboard from "@/components/ProviderDashboard";
import PatientDashboard from "@/components/PatientDashboard";
import PublicPayment from "@/components/PublicPayment";

export default function AppRouter() {
  return (
    <BriviaProviders>
      <Toaster position="top-right" richColors />
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/provider/create" component={ProviderDashboard} />
        <Route path="/patient" component={PatientDashboard} />
        <Route path="/pay/:token" component={PublicPayment} />
        <Route>
          <div className="min-h-screen flex items-center justify-center bg-[#f4f6ef]">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-[#163b30]">404</h1>
              <p className="text-[#6d8278] mt-2">Page not found</p>
              <a href="/" className="primary-button mt-4 inline-flex">Go home</a>
            </div>
          </div>
        </Route>
      </Switch>
    </BriviaProviders>
  );
}
