"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { Nav } from "@/components/Nav";
import { EventPlaceholder } from "@/components/EventPlaceholder";
import { useWallet } from "@/contexts/WalletContext";
import type { AvailableWallet } from "@/hooks/useWallet";
import { useAuth } from "@/contexts/AuthContext";
import { saveEvent, saveCallerSecret } from "@/lib/storage";
import { api as backendApi } from "@/lib/api";
import { COUNTRY_NAMES } from "@/lib/countries";
import type { LocationResult } from "@/components/LocationPickerMap";
import type { FormState, ProgressStatus, ProgressStep, DeploySuccess, PreflightState, ConnectedWallet } from "./types";
import { INITIAL_PROGRESS } from "./constants";
import { WalletPreflightModal } from "./_components/WalletPreflightModal";
import { WalletPickerModal } from "./_components/WalletPickerModal";
import { Stepper } from "./_components/Stepper";
import { DeployOverlay } from "./_components/DeployOverlay";
import { Step0 } from "./_components/Step0";
import { Step1 } from "./_components/Step1";
import { ReviewStep } from "./_components/ReviewStep";
import { KeyWarningPanel } from "./_components/KeyWarningPanel";
import { SuccessScreen } from "./_components/SuccessScreen";

// ─── Animation variants ────────────────────────────────────────────────────────────────────────────

const stepVariants = {
  enter:  (dir: number) => ({ opacity: 0, x: dir > 0 ?  32 : -32 }),
  center: {
    opacity: 1, x: 0,
    transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
  exit: (dir: number) => ({
    opacity: 0, x: dir > 0 ? -32 :  32,
    transition: { duration: 0.18, ease: "easeIn" as const },
  }),
};

// ─── Page ──────────────────────────────────────────────────────────────────────────────────

export default function NewEventPage() {
  const router      = useRouter();
  const queryClient = useQueryClient();
  const { wallet, connect } = useWallet();
  const { user: authUser }  = useAuth();

  const [form, setForm] = useState<FormState>({
    eventName: "", totalTickets: "100", minAge: "0",
    description: "",
    startDate: "", startTime: "18:00",
    endDate:   "", endTime:   "21:00",
    country: "", city: "", address: "",
    lat: null, lng: null,
  });

  const [step,        setStep]       = useState(0);
  const [dir,         setDir]        = useState(1);
  const [progress,    setProgress]   = useState<ProgressStep[]>([]);
  const [loading,     setLoading]    = useState(false);
  const [error,       setError]      = useState<string | null>(null);
  const [success,     setSuccess]    = useState<DeploySuccess | null>(null);
  const [mapFlyQuery, setMapFlyQuery] = useState("");

  // Wallet picker — shown when multiple Midnight wallets are detected.
  const [walletChoices, setWalletChoices] = useState<AvailableWallet[] | null>(null);
  const walletPickerResolveRef = useRef<((key: string | null) => void) | null>(null);

  function requestWalletPick(choices: AvailableWallet[]): Promise<string | null> {
    return new Promise((resolve) => {
      walletPickerResolveRef.current = resolve;
      setWalletChoices(choices);
    });
  }

  function onWalletChosen(key: string | null) {
    setWalletChoices(null);
    walletPickerResolveRef.current?.(key);
    walletPickerResolveRef.current = null;
  }

  // Wallet pre-flight — connects wallet, fetches balance, waits for user confirmation.
  const [preflight, setPreflight] = useState<PreflightState | null>(null);
  const preflightWalletRef  = useRef<ConnectedWallet | null>(null);
  const preflightResolveRef = useRef<((w: ConnectedWallet | null) => void) | null>(null);

  /**
   * Async preflight: shows the modal, connects the wallet, fetches balance,
   * then waits for the user to explicitly click "Deploy Contract →" or "Cancel".
   *
   * The user-confirmation Promise is set up only AFTER "ready" state is reached
   * so React has already painted the modal before we block on user input.
   */
  async function launchPreflight(
    walletKey: string,
    walletName: string,
    walletIcon?: string,
  ): Promise<ConnectedWallet | null> {
    // Show connecting state — React will paint this before the await below.
    setPreflight({ phase: "connecting", walletName, walletIcon, dustBalance: null, dustCap: null, dustAddress: null, error: null });

    // Connect directly to the selected wallet key — bypasses the hook's
    // cached walletRef so switching wallets always reads the correct balance.
    type MW = { connect: (network: string) => Promise<ConnectedWallet> };
    const midnightObj = (window as unknown as { midnight?: Record<string, MW> }).midnight;
    const initialApi  = midnightObj?.[walletKey];
    if (!initialApi) {
      setPreflight((p) => p ? { ...p, phase: "error", error: "Wallet not found in window.midnight." } : null);
      // handleDeploy will get null and exit; user dismisses via Cancel button.
      return null;
    }

    let connected: ConnectedWallet;
    try {
      connected = await initialApi.connect("preprod");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPreflight((p) => p ? { ...p, phase: "error", error: msg } : null);
      return null;
    }

    preflightWalletRef.current = connected;

    // Fetch balance — show "ready" regardless of whether this succeeds.
    try {
      const [{ balance, cap }, { shieldedAddress }] = await Promise.all([
        connected.getDustBalance(),
        connected.getShieldedAddresses(),
      ]);
      setPreflight((p) => p ? { ...p, phase: "ready", dustBalance: balance, dustCap: cap, dustAddress: shieldedAddress } : null);
    } catch {
      // Balance unavailable — still require explicit confirmation.
      setPreflight((p) => p ? { ...p, phase: "ready" } : null);
    }

    // Wait for the user to click "Deploy Contract →" or "Cancel" in the modal.
    // The resolve ref is set HERE — after "ready" is painted — so onPreflightConfirm
    // is always wired up after the modal is visible.
    return new Promise<ConnectedWallet | null>((resolve) => {
      preflightResolveRef.current = resolve;
    });
  }

  function onPreflightConfirm() {
    const w = preflightWalletRef.current;
    preflightWalletRef.current = null;
    setPreflight(null);
    preflightResolveRef.current?.(w);
    preflightResolveRef.current = null;
  }

  function onPreflightCancel() {
    preflightWalletRef.current = null;
    setPreflight(null);
    preflightResolveRef.current?.(null);
    preflightResolveRef.current = null;
  }

  function onChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  function onTextAreaChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  function onCountryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setForm((f) => ({ ...f, country: v }));
    if (COUNTRY_NAMES.includes(v)) setMapFlyQuery(v);
  }

  function onLocation(r: LocationResult) {
    setForm((f) => ({
      ...f,
      lat:     r.lat,
      lng:     r.lng,
      address: r.address,
      city:    r.city    || f.city,
      country: r.country || f.country,
    }));
  }

  function goTo(next: number) {
    setDir(next > step ? 1 : -1);
    setStep(next);
  }

  function bumpProgress(id: string, s: ProgressStatus, detail?: string) {
    setProgress((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: s, ...(detail ? { detail } : {}) } : p))
    );
  }

  async function handleDeploy() {
    // Prevent double-invoke while preflight or deploy is already in progress.
    if (preflight !== null || loading) return;

    // Always run through preflight (balance check + confirmation) on every
    // attempt — even if a wallet is already connected from a prior run.
    let liveWallet: ConnectedWallet | null = null;
    {
      type MW = { name?: string; icon?: string };
      const midnightObj = (window as unknown as { midnight?: Record<string, MW> }).midnight;
      if (!midnightObj || Object.keys(midnightObj).length === 0) {
        setError(
          "No Midnight wallet detected. Install a Midnight-compatible wallet (e.g. Lace) and enable the Midnight network.",
        );
        return;
      }
      const keys = Object.keys(midnightObj);
      let walletKey: string;
      if (keys.length > 1) {
        const choices: AvailableWallet[] = keys.map((k) => ({
          key: k,
          name: midnightObj[k]!.name || k.replace(/^mn/i, "").replace(/([a-z])([A-Z])/g, "$1 $2"),
          icon: midnightObj[k]!.icon,
        }));
        const chosen = await requestWalletPick(choices);
        if (!chosen) return;
        walletKey = chosen;
      } else {
        walletKey = keys[0]!;
      }
      const meta = midnightObj[walletKey]!;
      liveWallet = await launchPreflight(
        walletKey,
        meta.name || walletKey.replace(/^mn/i, "").replace(/([a-z])([A-Z])/g, "$1 $2"),
        meta.icon,
      );
      if (!liveWallet) return;
    }

    setLoading(true);
    setError(null);
    setProgress(INITIAL_PROGRESS.map((s) => ({ ...s })));

    try {
      const [{ createEventTicketProviders }, { EventTicketAPI }, { PREPROD_CONFIG }] =
        await Promise.all([
          import("@sdk/providers"),
          import("@sdk/contract-api"),
          import("@sdk/types"),
        ]);

      const providers = await createEventTicketProviders(liveWallet!, PREPROD_CONFIG);
      const api       = await EventTicketAPI.deploy(providers);
      bumpProgress("deploy", "done", api.contractAddress);
      bumpProgress("circuit", "active");

      await api.createEvent(form.eventName.trim(), BigInt(form.totalTickets), parseInt(form.minAge || "0"));
      bumpProgress("circuit", "done");
      bumpProgress("key", "active");

      const toIso = (d: string, t: string) =>
        d && t ? new Date(`${d}T${t}:00`).toISOString() : new Date().toISOString();

      const startDateIso = toIso(form.startDate, form.startTime);
      const endDateIso   = toIso(form.endDate,   form.endTime);
      const locationStr  = form.address.trim() ||
        [form.city, form.country].filter(Boolean).join(", ") || "TBD";

      // callerSecret is the only copy — save before anything else.
      saveCallerSecret(api.contractAddress, api.callerSecretHex());
      saveEvent({
        contractAddress: api.contractAddress,
        eventName:       form.eventName.trim(),
        totalTickets:    parseInt(form.totalTickets, 10),
        txId:            "",
        createdAt:       new Date().toISOString(),
        callerSecretHex: api.callerSecretHex(),
        description:     form.description.trim(),
        location:        locationStr,
        country:         form.country   || undefined,
        city:            form.city      || undefined,
        latitude:        form.lat       ?? undefined,
        longitude:       form.lng       ?? undefined,
        startDate:       startDateIso,
        endDate:         endDateIso,
        minAge:          parseInt(form.minAge || "0", 10),
      });

      bumpProgress("key", "done");
      bumpProgress("backend", "active");

      let backendSyncFailed = false;
      try {
        await backendApi.events.create({
          contractAddress: api.contractAddress,
          name:            form.eventName.trim(),
          description:     form.description.trim() || "—",
          location:        locationStr,
          country:         form.country  || undefined,
          city:            form.city     || undefined,
          latitude:        form.lat      ?? undefined,
          longitude:       form.lng      ?? undefined,
          startDate:       startDateIso,
          endDate:         endDateIso,
          maxCapacity:     parseInt(form.totalTickets, 10),
          minAge:          parseInt(form.minAge || "0", 10),
        });
        await queryClient.invalidateQueries({ queryKey: ["events"] });
        bumpProgress("backend", "done");
      } catch (syncErr) {
        backendSyncFailed = true;
        const syncMsg = syncErr instanceof Error ? syncErr.message : String(syncErr);
        console.warn("Backend sync failed:", syncMsg);
        bumpProgress("backend", "error", syncMsg.slice(0, 60));
      }

      setSuccess({ contractAddress: api.contractAddress, eventName: form.eventName.trim(), backendSyncFailed });
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const isInsufficientFunds   = /insufficient|not enough|balance|funds|dust/i.test(raw);
      const isProofServerForbidden = /403|forbidden|requires internal auth/i.test(raw);
      const isProofServerDown     = !isProofServerForbidden && /proof.server|503|unreachable|fetch failed/i.test(raw);
      const msg = isInsufficientFunds
        ? "Insufficient DUST balance. You need DUST to pay transaction fees. Get tNight from the faucet at faucet.preprod.midnight.network (use your unshielded address), then generate DUST inside Lace."
        : isProofServerForbidden
        ? "The proof server rejected the request (403). Make sure the Docker proof server is running: docker run -d --rm -p 6300:6300 midnightntwrk/proof-server"
        : isProofServerDown
        ? "The ZK proof server is unreachable. Please try again in a few moments. If the issue persists, contact the site operator."
        : raw;
      setError(msg);
      setProgress((prev) =>
        prev.map((s) => (s.status === "active" ? { ...s, status: "error" } : s))
      );
    } finally {
      setLoading(false);
    }
  }

  async function retryBackendSync() {
    if (!success) return;
    const toIso = (d: string, t: string) =>
      d && t ? new Date(`${d}T${t}:00`).toISOString() : new Date().toISOString();
    const locationStr = form.address.trim() ||
      [form.city, form.country].filter(Boolean).join(", ") || "TBD";
    try {
      await backendApi.events.create({
        contractAddress: success.contractAddress,
        name:            form.eventName.trim(),
        description:     form.description.trim() || "—",
        location:        locationStr,
        country:         form.country  || undefined,
        city:            form.city     || undefined,
        latitude:        form.lat      ?? undefined,
        longitude:       form.lng      ?? undefined,
        startDate:       toIso(form.startDate, form.startTime),
        endDate:         toIso(form.endDate,   form.endTime),
        maxCapacity:     parseInt(form.totalTickets, 10),
        minAge:          parseInt(form.minAge || "0", 10),
      });
      await queryClient.invalidateQueries({ queryKey: ["events"] });
      setSuccess((s) => s ? { ...s, backendSyncFailed: false } : s);
    } catch (err) {
      console.warn("Retry backend sync failed:", err instanceof Error ? err.message : String(err));
    }
  }

  // authUser !== null means the user is signed in with Google (backend session).
  void authUser;

  return (
    <>
      <Nav />

      <AnimatePresence>
        {loading && progress.length > 0 && (
          <DeployOverlay steps={progress} eventName={form.eventName} />
        )}
      </AnimatePresence>

      <main className="min-h-dvh bg-[#080808] pt-14">
        <div className="grid-lines absolute inset-0 pointer-events-none opacity-40" />

        <div className="relative mx-auto max-w-5xl px-5 pt-10 pb-28">

          <div className="flex items-center gap-2 text-xs text-zinc-700 mb-10">
            <Link href="/events" className="hover:text-zinc-400 transition-colors">Events</Link>
            <span>/</span>
            <span className="text-zinc-500">New</span>
          </div>

          <div className="mb-8">
            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-2">Organizer</p>
            <h1 className="text-2xl font-bold text-white tracking-tight mb-2">Create Event</h1>
            <p className="text-sm text-zinc-600 max-w-md">
              Deploy a zero-knowledge ticketing contract on Midnight.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-10 items-start">

            {walletChoices && (
              <WalletPickerModal
                wallets={walletChoices}
                onPick={(key) => onWalletChosen(key)}
                onCancel={() => onWalletChosen(null)}
              />
            )}

            {preflight && (
              <WalletPreflightModal
                state={preflight}
                onConfirm={onPreflightConfirm}
                onCancel={onPreflightCancel}
              />
            )}

            {/* Left: wizard / success */}
            <AnimatePresence mode="wait">
              {success ? (
                <SuccessScreen
                  key="success" result={success} form={form}
                  onManage={() => router.push(`/events/${encodeURIComponent(success.contractAddress)}`)}
                  onRetryBackend={success.backendSyncFailed ? retryBackendSync : undefined}
                />
              ) : (
                <motion.div key="wizard"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Stepper current={step} />
                  <AnimatePresence custom={dir} mode="wait">
                    {step === 0 && (
                      <motion.div key="s0" custom={dir} variants={stepVariants}
                        initial="enter" animate="center" exit="exit">
                        <Step0 form={form} onChange={onChange} onNext={() => goTo(1)} />
                      </motion.div>
                    )}
                    {step === 1 && (
                      <motion.div key="s1" custom={dir} variants={stepVariants}
                        initial="enter" animate="center" exit="exit">
                        <Step1
                          form={form} onChange={onChange}
                          onTextAreaChange={onTextAreaChange}
                          onLocation={onLocation}
                          onCountryChange={onCountryChange}
                          mapFlyQuery={mapFlyQuery}
                          onBack={() => goTo(0)} onNext={() => goTo(2)}
                        />
                      </motion.div>
                    )}
                    {step === 2 && (
                      <motion.div key="s2" custom={dir} variants={stepVariants}
                        initial="enter" animate="center" exit="exit">
                        <ReviewStep
                          form={form} progress={progress}
                          loading={loading} error={error}
                          onBack={() => goTo(1)} onDeploy={handleDeploy}
                          onDismissError={() => { setError(null); setProgress([]); }}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Right: live preview + context */}
            <div className="space-y-4 lg:sticky lg:top-20">
              <EventPlaceholder name={form.eventName} />

              {step < 2 && (
                <div className="border border-white/6 bg-white/[0.015] p-4 space-y-3">
                  <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">
                    {step === 0 ? "On-chain data" : "Off-chain data"}
                  </p>
                  {step === 0 ? (
                    <ul className="space-y-2">
                      {[
                        { f: "event_name",    t: "Bytes<32>", n: "UTF-8 padded"  },
                        { f: "total_tickets", t: "Uint<32>",  n: "immutable cap" },
                        { f: "organizer",     t: "Bytes<32>", n: "hash only"     },
                        { f: "is_active",     t: "Boolean",   n: ""              },
                        { f: "is_cancelled",  t: "Boolean",   n: "permanent"     },
                      ].map(({ f, t, n }) => (
                        <li key={f} className="flex items-baseline gap-1.5 flex-wrap">
                          <code className="text-[11px] font-mono text-zinc-400">{f}</code>
                          <span className="text-[10px] font-mono text-zinc-700">:{t}</span>
                          {n && <span className="text-[9px] text-zinc-800 italic">{n}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="space-y-1.5">
                      {["description","location","country","city","startDate","endDate","maxCapacity"].map((f) => (
                        <li key={f} className="flex items-center gap-1.5">
                          <code className="text-[11px] font-mono text-zinc-500">{f}</code>
                          <span className="text-[9px] text-zinc-800 italic">backend</span>
                        </li>
                      ))}
                      <li className="flex items-center gap-1.5 pt-1">
                        <code className="text-[11px] font-mono text-amber-500/80">callerSecretHex</code>
                        <span className="text-[9px] font-semibold text-amber-700 uppercase tracking-wide">critical</span>
                      </li>
                    </ul>
                  )}
                </div>
              )}

              {step === 2 && <KeyWarningPanel />}
            </div>

          </div>
        </div>
      </main>
    </>
  );
}
