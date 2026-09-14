import type { Migration } from './types';

/**
 * Customer stories on the home page, previously hard-coded in
 * TestimonialsSection. Seeded with those same three so the section looks
 * unchanged on the first boot; from then on they are edited in the admin.
 *
 * `sort_order` decides the order on the page (lowest first). `status` reuses
 * the CMS draft/published pair so a story can be hidden without deleting it.
 */
const SEED = [
  {
    quote:
      "My mum turned 60 this year. I gave her a banknote from the 14th of March 1965 — the exact day she was born. She cried. I cried. The whole room went quiet. Nothing I've ever bought has meant more.",
    name: 'James Whitfield',
    role: "Son, gave for his mother's 60th birthday",
    location: 'Manchester',
    image: 'https://img.rocket.new/generatedImages/rocket_gen_img_1cbf4bb47-1763293058500.png',
    date: '14/03/65',
  },
  {
    quote:
      "We found a note from our wedding anniversary date in 1978. He's a collector — he's seen everything. But this? He said it was the most thoughtful gift he'd received in 40 years of marriage.",
    name: 'Patricia Osei',
    role: 'Wife, gave for their 45th anniversary',
    location: 'London',
    image: 'https://img.rocket.new/generatedImages/rocket_gen_img_19f1ca95c-1784572539049.png',
    date: '07/11/78',
  },
  {
    quote:
      "My daughter asked what I wanted for my 70th. I said 'nothing expensive.' She found a note from 1954 — the year I was born — and had it framed. I look at it every morning.",
    name: 'Harold Sutton',
    role: 'Recipient, 70th birthday gift',
    location: 'Edinburgh',
    image: 'https://images.unsplash.com/photo-1618674609573-288fb3dab13d',
    date: '22/06/54',
  },
];

export const migration: Migration = {
  version: '0024',
  name: 'testimonials',
  async up(m) {
    await m.execute(`
      CREATE TABLE IF NOT EXISTS testimonials (
        id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
        quote       TEXT         NOT NULL,
        name        VARCHAR(120) NOT NULL,
        role        VARCHAR(160)     NULL,
        location    VARCHAR(120)     NULL,
        image_url   VARCHAR(500)     NULL,
        date_label  VARCHAR(20)      NULL,
        sort_order  INT          NOT NULL DEFAULT 0,
        status      ENUM('draft','published') NOT NULL DEFAULT 'draft',
        updated_by  VARCHAR(190)     NULL,
        created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_testimonials_status_order (status, sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const [{ n }] = await m.query('SELECT COUNT(*) AS n FROM testimonials');
    if (Number(n) > 0) return;
    for (const [i, t] of SEED.entries()) {
      await m.execute(
        `INSERT INTO testimonials
           (quote, name, role, location, image_url, date_label, sort_order, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'published')`,
        [t.quote, t.name, t.role, t.location, t.image, t.date, (i + 1) * 10]
      );
    }
  },
};
