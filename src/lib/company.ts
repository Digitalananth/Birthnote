/**
 * Who runs the site and how to reach them — shown in the footer on every page.
 *
 * Kept in code rather than read from the invoice settings: several pages are
 * built once with no database to hand (privacy, terms, track-order), and a
 * footer read from the database would be blank on those for good. The
 * invoice's seller details are set separately in admin → Settings.
 */
export const COMPANY = {
  legalName: 'Timeless Legacy Collections Pvt Ltd',
  addressLines: [
    'No 75, Shantha Arcade, 3rd Floor',
    '2nd Block, Dr Rajkumar Road',
    'Rajajinagar, Bangalore 560010',
    'Karnataka, India',
  ],
  /** As written for people; `phoneHref` is the dialable form. */
  phone: '+91 96320 92626',
  phoneHref: 'tel:+919632092626',
  email: 'support@msphilately.in',
  gstin: '29AAMCT0299F1ZW',
} as const;

/**
 * The company's social profiles, in the order the footer shows them. An entry
 * with no URL still shows its icon, but not as a link — fill in the URL and it
 * becomes clickable, with nothing else to change.
 */
export const SOCIAL_PROFILES: ReadonlyArray<{
  network: 'facebook' | 'instagram' | 'x' | 'linkedin' | 'youtube';
  label: string;
  url: string;
}> = [
  { network: 'facebook', label: 'Facebook', url: '' },
  { network: 'instagram', label: 'Instagram', url: '' },
  { network: 'x', label: 'X (Twitter)', url: '' },
  { network: 'linkedin', label: 'LinkedIn', url: '' },
  { network: 'youtube', label: 'YouTube', url: '' },
];
