import React from 'react';

/**
 * Shared shell for policy pages so privacy and terms stay visually identical
 * and only the copy differs.
 */
export interface LegalSection {
  heading: string;
  body: string[];
}

export default function LegalPage({
  title,
  updated,
  sections,
}: {
  title: string;
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <main className="min-h-screen bg-background pt-32 pb-24">
      <article className="max-w-2xl mx-auto px-6 md:px-12">
        <h1
          className="font-sans font-extrabold text-foreground mb-3"
          style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', letterSpacing: '-0.03em', lineHeight: 1.05 }}
        >
          {title}
        </h1>
        <p className="text-sm text-muted-foreground mb-12">Last updated {updated}</p>

        <div className="flex flex-col gap-10">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-sans font-bold text-lg text-foreground mb-3">
                {section.heading}
              </h2>
              <div className="flex flex-col gap-3">
                {section.body.map((paragraph, index) => (
                  <p
                    key={index}
                    className="text-[15px] text-muted-foreground leading-relaxed"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
