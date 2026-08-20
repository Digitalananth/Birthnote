import React from 'react';

interface Banknote {
  denomination: string;
  value: number;
  color: string;
  borderColor: string;
  textColor: string;
  accentColor: string;
  series: string;
  motif: string;
}

const banknotes: Banknote[] = [
  {
    denomination: '₹1',
    value: 1,
    color: 'from-[#c8b89a]/30 to-[#a89070]/20',
    borderColor: 'border-[#c8b89a]/40',
    textColor: 'text-[#c8b89a]',
    accentColor: 'bg-[#c8b89a]/20',
    series: 'Government of India',
    motif: 'One Rupee Coin',
  },
  {
    denomination: '₹2',
    value: 2,
    color: 'from-[#b8c4a0]/30 to-[#8fa070]/20',
    borderColor: 'border-[#b8c4a0]/40',
    textColor: 'text-[#b8c4a0]',
    accentColor: 'bg-[#b8c4a0]/20',
    series: 'Government of India',
    motif: 'Aryabhata Satellite',
  },
  {
    denomination: '₹5',
    value: 5,
    color: 'from-[#d4b896]/30 to-[#b09060]/20',
    borderColor: 'border-[#d4b896]/40',
    textColor: 'text-[#d4b896]',
    accentColor: 'bg-[#d4b896]/20',
    series: 'Reserve Bank of India',
    motif: 'Tractor & Farmer',
  },
  {
    denomination: '₹10',
    value: 10,
    color: 'from-[#c8a060]/30 to-[#a07840]/20',
    borderColor: 'border-[#c8a060]/40',
    textColor: 'text-[#c8a060]',
    accentColor: 'bg-[#c8a060]/20',
    series: 'Reserve Bank of India',
    motif: 'Sun Temple, Konark',
  },
  {
    denomination: '₹20',
    value: 20,
    color: 'from-[#d4c060]/30 to-[#b09840]/20',
    borderColor: 'border-[#d4c060]/40',
    textColor: 'text-[#d4c060]',
    accentColor: 'bg-[#d4c060]/20',
    series: 'Reserve Bank of India',
    motif: 'Ellora Caves',
  },
  {
    denomination: '₹50',
    value: 50,
    color: 'from-[#90b8d0]/30 to-[#6090a8]/20',
    borderColor: 'border-[#90b8d0]/40',
    textColor: 'text-[#90b8d0]',
    accentColor: 'bg-[#90b8d0]/20',
    series: 'Reserve Bank of India',
    motif: 'Hampi with Chariot',
  },
  {
    denomination: '₹100',
    value: 100,
    color: 'from-[#a0b8a0]/30 to-[#708870]/20',
    borderColor: 'border-[#a0b8a0]/40',
    textColor: 'text-[#a0b8a0]',
    accentColor: 'bg-[#a0b8a0]/20',
    series: 'Reserve Bank of India',
    motif: 'Rani ki Vav',
  },
  {
    denomination: '₹200',
    value: 200,
    color: 'from-[#d4b060]/30 to-[#b08840]/20',
    borderColor: 'border-[#d4b060]/40',
    textColor: 'text-[#d4b060]',
    accentColor: 'bg-[#d4b060]/20',
    series: 'Reserve Bank of India',
    motif: 'Sanchi Stupa',
  },
  {
    denomination: '₹500',
    value: 500,
    color: 'from-[#b8a8c8]/30 to-[#8878a0]/20',
    borderColor: 'border-[#b8a8c8]/40',
    textColor: 'text-[#b8a8c8]',
    accentColor: 'bg-[#b8a8c8]/20',
    series: 'Reserve Bank of India',
    motif: 'Red Fort, Delhi',
  },
];

export default function BanknotesDisplaySection() {

  return (
    <section className="bg-background py-20 md:py-28 relative overflow-hidden">
      {/* Background vol number */}
      <div
        className="absolute top-4 right-6 md:right-12 pointer-events-none select-none font-sans font-extrabold text-foreground/4"
        style={{ fontSize: 'clamp(5rem, 14vw, 12rem)', lineHeight: 1 }}>
        03
      </div>

      {/* Subtle warm blob */}
      <div className="absolute bottom-0 left-0 w-96 h-96 blob-warm rounded-full pointer-events-none opacity-20 -translate-x-1/2 translate-y-1/2" />

      <div className="max-w-7xl mx-auto px-6 md:px-12 relative z-10">
        {/* Header */}
        <div className="reveal-warm mb-14 md:mb-18">
          <span className="text-xs uppercase tracking-widest text-accent font-semibold block mb-4">
            Our Collection
          </span>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <h2 className="text-section-xl font-sans font-extrabold text-foreground leading-none">
              Indian Banknotes
              <br />
              <span className="font-serif font-light italic text-accent">on display.</span>
            </h2>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed md:text-right">
              Every denomination sourced from genuine circulation — each one a piece of India&apos;s monetary history.
            </p>
          </div>
        </div>

        {/* Banknote grid — asymmetric bento layout */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
          {banknotes.map((note, i) => (
            <div
              key={note.denomination}
              className="reveal-warm"
              style={{ animationDelay: `${i * 0.06}s` }}>

              {/* Banknote card */}
              <div
                className={`group relative rounded-2xl border ${note.borderColor} bg-gradient-to-br ${note.color} backdrop-blur-sm overflow-hidden cursor-default transition-all duration-500 hover:-translate-y-1 hover:shadow-xl`}
                style={{ aspectRatio: '1.6 / 1', minHeight: '110px' }}>

                {/* Watermark pattern */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  <div
                    className={`absolute -bottom-4 -right-4 w-20 h-20 rounded-full ${note.accentColor} opacity-60`}
                    style={{ filter: 'blur(16px)' }} />
                  <div
                    className={`absolute top-2 left-2 w-8 h-8 rounded-full ${note.accentColor} opacity-40`}
                    style={{ filter: 'blur(8px)' }} />
                  {/* Micro guilloche lines */}
                  <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <pattern id={`lines-${i}`} x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
                        <path d="M0 8 L8 0" stroke="currentColor" strokeWidth="0.5" fill="none" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill={`url(#lines-${i})`} className={note.textColor} />
                  </svg>
                </div>

                {/* Card content */}
                <div className="relative z-10 h-full flex flex-col justify-between p-3 md:p-4">
                  {/* Top row */}
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-widest text-foreground/40 leading-none mb-0.5">
                        India
                      </p>
                      <p className={`text-[10px] font-mono uppercase tracking-wide ${note.textColor} opacity-70 leading-none`}>
                        {note.series}
                      </p>
                    </div>
                    {/* RBI emblem placeholder */}
                    <div className={`w-6 h-6 rounded-full border ${note.borderColor} flex items-center justify-center`}>
                      <span className={`text-[8px] font-bold font-mono ${note.textColor}`}>RBI</span>
                    </div>
                  </div>

                  {/* Denomination — large */}
                  <div className="flex items-end justify-between">
                    <div>
                      <p
                        className={`font-sans font-extrabold ${note.textColor} leading-none`}
                        style={{ fontSize: 'clamp(1.4rem, 4vw, 2rem)' }}>
                        {note.denomination}
                      </p>
                      <p className="text-[9px] text-foreground/35 font-mono uppercase tracking-wider mt-0.5 leading-none">
                        {note.motif}
                      </p>
                    </div>
                    {/* Corner denomination repeat */}
                    <p className={`text-[10px] font-mono font-bold ${note.textColor} opacity-40 self-start`}>
                      {note.denomination}
                    </p>
                  </div>
                </div>

                {/* Hover shimmer */}
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none group-hover:translate-x-full transition-transform duration-700" />
              </div>
            </div>
          ))}
        </div>

        {/* Bottom note */}
        <div className="mt-10 flex items-center gap-3">
          <span className="h-px flex-1 bg-border/50" />
          <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest whitespace-nowrap">
            All denominations available · DD/MM/YY format · Genuine circulated notes
          </p>
          <span className="h-px flex-1 bg-border/50" />
        </div>
      </div>
    </section>
  );
}
