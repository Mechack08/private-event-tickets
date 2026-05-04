import type { UseWalletReturn } from "@/hooks/useWallet";

export interface FormState {
  eventName:    string;
  totalTickets: string;
  minAge:       string;
  description:  string;
  startDate:    string;
  startTime:    string;
  endDate:      string;
  endTime:      string;
  country:      string;
  city:         string;
  address:      string;
  lat:          number | null;
  lng:          number | null;
}

export type ProgressStatus = "idle" | "active" | "done" | "error";

export interface ProgressStep {
  id:      string;
  label:   string;
  detail?: string;
  status:  ProgressStatus;
}

export interface DeploySuccess {
  contractAddress:   string;
  eventName:         string;
  backendSyncFailed?: boolean;
}

export interface PreflightState {
  phase:       "connecting" | "ready" | "error";
  walletName:  string;
  walletIcon?: string;
  dustBalance: bigint | null;
  dustCap:     bigint | null;
  dustAddress: string | null;
  error:       string | null;
}

/** Connected wallet type — avoids importing dapp-connector-api directly in the page. */
export type ConnectedWallet = Awaited<ReturnType<UseWalletReturn["connect"]>>;
