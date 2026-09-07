import { useEffect, useState } from "react";

// Reusable breakpoint check for pages that need a genuinely different
// layout on a phone (a card list instead of a wide table), not just a
// squeezed version of the desktop one. 720px matches the breakpoints
// already used in App.css.
export function useIsMobile(breakpoint = 720) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= breakpoint : false
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [breakpoint]);

  return isMobile;
}
