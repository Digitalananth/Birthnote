'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';

/**
 * The "Install My Lucky Dates" banner.
 *
 * The manifest and service worker already make the site installable; without
 * this, the only way in is Chrome's overflow menu, which nobody opens. This is
 * the discovery half of that feature and nothing more — it installs the app,
 * it does not ask for notifications or anything else.
 *
 * Two platforms, two mechanisms:
 *
 *   Android/desktop Chromium fires `beforeinstallprompt`. We suppress the
 *   browser's own mini-infobar and hold the event so our button can trigger it.
 *
 *   iOS fires nothing and has no programmatic install at all. The only route is
 *   Share -> Add to Home Screen, so there we show instructions rather than a
 *   button that cannot work.
 */

/** How long a dismissal is honoured. Long enough not to nag, short enough that
 *  someone who comes back months later is asked once more. */
const DISMISS_DAYS = 30;
// Deliberately keeps its pre-rename name: it is invisible to the visitor, and
// renaming it would re-show the banner to everyone who had dismissed it.
const STORAGE_KEY = 'birthnote:install-prompt-dismissed';

/**
 * Paths where an install banner would be an interruption rather than an offer.
 *
 * Checkout and auth are someone in the middle of a task with their card or
 * password out; admin is staff, who are not the audience for this at all.
 */
const NEVER_PROMPT = [
  '/payment',
  '/admin',
  '/login',
  '/signup',
  '/reset-password',
  '/forgot-password',
];

/** The Chromium-only event. Not in TypeScript's DOM lib, so it is named here. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isDismissed(): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const at = Number(raw);
    // A corrupt value should not silence the banner forever.
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    // Private mode or blocked storage: treat as never dismissed. The banner is
    // then per-session, which is the right failure direction.
    return false;
  }
}

function rememberDismissal() {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // Nothing to do — the banner simply reappears next visit.
  }
}

/** True when the page is already running as an installed app. */
function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's own flag, which predates the standard media query.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iOS Safari, the only iOS browser that can add to the home screen. */
function isIosSafari(): boolean {
  const ua = window.navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports itself as a Mac; the touch points give it away.
    (ua.includes('Macintosh') && window.navigator.maxTouchPoints > 1);
  if (!ios) return false;
  // Chrome and Firefox on iOS cannot install, so instructions would be a lie.
  return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

export default function InstallPrompt() {
  const pathname = usePathname();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  const dismiss = useCallback(() => {
    setVisible(false);
    rememberDismissal();
  }, []);

  useEffect(() => {
    if (isStandalone() || isDismissed()) return;

    const onBeforeInstallPrompt = (event: Event) => {
      // Without this Chrome shows its own mini-infobar instead of letting us
      // choose the moment.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
      // So a later uninstall does not immediately re-prompt.
      rememberDismissal();
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    // iOS has no event to wait for, so the banner is on a short timer instead —
    // late enough that it never competes with the first paint.
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (isIosSafari()) {
      timer = setTimeout(() => {
        setShowIosHint(true);
        setVisible(true);
      }, 4000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    // The event is single-use: hide the banner regardless of the answer, since
    // a second prompt() on the same event throws.
    setVisible(false);
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === 'dismissed') rememberDismissal();
  }, [deferred]);

  if (!visible) return null;
  if (NEVER_PROMPT.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-label="Install My Lucky Dates"
      className="fixed inset-x-0 bottom-0 z-[60] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pointer-events-none"
    >
      <div className="pointer-events-auto mx-auto max-w-md rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-lg p-4 flex items-start gap-3">
        <div className="w-11 h-11 shrink-0 rounded-xl bg-accent/15 flex items-center justify-center">
          <Icon
            name={showIosHint ? 'ShareIcon' : 'ArrowDownTrayIcon'}
            size={20}
            className="text-accent"
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-sans font-semibold text-sm text-foreground">
            Keep My Lucky Dates on your phone
          </p>

          {showIosHint ? (
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              Tap{' '}
              <Icon name="ShareIcon" size={12} className="inline align-[-1px] mx-0.5" aria-hidden />
              <span className="font-medium text-foreground">Share</span>, then{' '}
              <span className="font-medium text-foreground">Add to Home Screen</span>.
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Look up a date and check your order in one tap, straight from your home screen.
              </p>
              <button
                type="button"
                onClick={install}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-full text-xs font-semibold hover:bg-primary/90 transition-colors"
              >
                Install
                <Icon name="ArrowRightIcon" size={12} />
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Not now"
          className="shrink-0 -mt-1 -mr-1 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Icon name="XMarkIcon" size={16} />
        </button>
      </div>
    </div>
  );
}
