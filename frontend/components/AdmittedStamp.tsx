"use client";

import { motion } from "framer-motion";

interface AdmittedStampProps {
  /** When the ticket was admitted — displayed on the stamp. */
  admittedDate: Date | null;
}

/**
 * Animated circular "ADMITTED" rubber-stamp overlay.
 * Used on top of a desaturated QR code in both the attendee ticket view
 * and the my-tickets wallet.
 */
export function AdmittedStamp({ admittedDate }: AdmittedStampProps) {
  return (
    <motion.div
      initial={{ scale: 2.2, opacity: 0, rotate: -28 }}
      animate={{ scale: 1, opacity: 1, rotate: -14 }}
      transition={{ type: "spring", stiffness: 500, damping: 24 }}
      className="absolute inset-0 flex items-center justify-center"
    >
      <div className="relative flex items-center justify-center w-[168px] h-[168px]">
        <div className="absolute inset-0 rounded-full border-[3px] border-amber-400/85 shadow-[0_0_30px_rgba(245,158,11,0.22)]" />
        <div className="absolute inset-[7px] rounded-full border border-amber-400/30" />
        <div className="flex flex-col items-center gap-0.5 z-10">
          <p className="text-amber-400 font-black text-[21px] leading-none tracking-[0.32em]">ADMITTED</p>
          <div className="w-[88px] h-px bg-amber-400/50 my-1.5" />
          <p className="text-amber-400/65 text-[9px] font-bold tracking-[0.28em] uppercase">Entry Granted</p>
          {admittedDate && (
            <p className="text-amber-400/45 text-[9px] font-mono mt-1.5">
              {admittedDate.toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
