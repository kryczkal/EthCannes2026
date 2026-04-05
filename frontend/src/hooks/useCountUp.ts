import { useState, useEffect } from "react";

export function useCountUp(target: number, durationMs = 1000): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target === 0) { setVal(0); return; }
    const steps = 20;
    const interval = durationMs / steps;
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setVal(+(target * (i / steps)).toFixed(1));
      if (i >= steps) clearInterval(timer);
    }, interval);
    return () => clearInterval(timer);
  }, [target, durationMs]);
  return val;
}
