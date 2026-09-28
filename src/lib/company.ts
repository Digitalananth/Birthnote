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
