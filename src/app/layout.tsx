import React from 'react';
import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, Fraunces } from 'next/font/google';
import '../styles/tailwind.css';
import ScrollReveal from '@/components/ScrollReveal';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';
import InstallPrompt from '@/components/InstallPrompt';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-plus-jakarta-sans',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-fraunces',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Tints the browser chrome on Android and the status bar in an installed
  // app, so the frame around the site matches the site.
  themeColor: '#8B5A2B',
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: {
    default: 'My Lucky Dates — A Banknote From Your Most Memorable Date',
    template: '%s',
  },
  description:
    'Discover a genuine banknote printed on your most memorable date — a birthday, anniversary, wedding day, or special moment. Submit your date, we confirm availability, and deliver a treasured keepsake.',
  icons: {
    icon: [{ url: '/favicon.ico', type: 'image/x-icon' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  // iOS still reads these rather than the manifest for a home-screen launch.
  appleWebApp: {
    capable: true,
    title: 'My Lucky Dates',
    statusBarStyle: 'default',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${plusJakartaSans.variable} ${fraunces.variable}`}>
      <body className={plusJakartaSans.className}>
        {children}

        {/*
          A single client component driving every scroll reveal on the site.
          Mounted once here so the marketing sections themselves can stay
          server components.
        */}
        <ScrollReveal />
        <ServiceWorkerRegistration />
        <InstallPrompt />

        <script
          type="module"
          async
          src="https://static.rocket.new/rocket-web.js?_cfg=https%3A%2F%2Fbirthnote3189back.builtwithrocket.new&_be=https%3A%2F%2Fappanalytics.rocket.new&_v=0.1.20"
        />
        <script type="module" defer src="https://static.rocket.new/rocket-shot.js?v=0.0.2" />
      </body>
    </html>
  );
}
