import { useEffect } from "react";

/** Scroll: o próprio bloco sobe quando entra na tela. */
export function useLandingMotion(rootSelector = ".lp") {
  useEffect(() => {
    const root = document.querySelector(rootSelector);
    if (!root) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );

    root.classList.add("lp-motion-ready");
    const watchReveal = () => {
      root.querySelectorAll<HTMLElement>(".lp-reveal:not(.is-in)").forEach((el) => io.observe(el));
    };
    watchReveal();
    const mo = new MutationObserver(watchReveal);
    mo.observe(root, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
      root.classList.remove("lp-motion-ready");
    };
  }, [rootSelector]);
}
