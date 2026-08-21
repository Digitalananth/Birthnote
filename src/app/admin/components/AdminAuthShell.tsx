import React from 'react';

/** The frame around the admin sign-in, forgot and reset screens. */
export default function AdminAuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-secondary/30 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <p className="text-xs uppercase tracking-widest text-primary font-bold mb-2 text-center">
          BirthNote
        </p>
        <h1 className="font-sans font-extrabold text-2xl text-foreground mb-2 text-center">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground text-center mb-8 leading-relaxed">
            {subtitle}
          </p>
        )}
        <div className="card-warm p-8">{children}</div>
      </div>
    </main>
  );
}
