"use client";

import { useState, useEffect } from "react";
import { animate } from "framer-motion";

export function useCountUp(target: number, duration: number): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const ctrl = animate(0, target, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => setValue(Math.round(v)),
    });
    return ctrl.stop;
  }, [target, duration]);
  return value;
}
