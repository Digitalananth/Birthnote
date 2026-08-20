'use client';

import { useEffect } from 'react';

/**
 * One IntersectionObserver for every scroll-reveal on the page.
 *
 * Each marketing section used to be a client component solely to run its own
 * copy of this observer, which shipped all of their markup to the browser as
 * JavaScript. Hoisting the behaviour here lets those sections be server
 * components: their HTML is rendered once on the server and React never has
 * to diff it on the client at all. This file is the only JS the effect costs.
 *
 * It also watches for nodes added later (client-rendered success states), and
 * respects prefers-reduced-motion by revealing everything immediately.
 */
export default function ScrollReveal() {
  useEffect(() => {
    const targets = () => Array.from(document.querySelectorAll('.reveal-warm:not(.active)'));

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      targets().forEach((el) => el.classList.add('active'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('active');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -30px 0px' }
    );

    const observeAll = () => targets().forEach((el) => observer.observe(el));
    observeAll();

    // Sections that mount after hydration (e.g. a form's success view).
    const mutations = new MutationObserver(observeAll);
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, []);

  return null;
}
