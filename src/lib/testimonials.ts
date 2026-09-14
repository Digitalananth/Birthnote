import 'server-only';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { query } from '@/lib/db';
import type { ContentStatus, Testimonial, TestimonialInput } from '@/lib/content-types';

export type { Testimonial, TestimonialInput } from '@/lib/content-types';

interface TestimonialRow extends RowDataPacket {
  id: number;
  quote: string;
  name: string;
  role: string | null;
  location: string | null;
  image_url: string | null;
  date_label: string | null;
  sort_order: number;
  status: ContentStatus;
}

function mapTestimonial(row: TestimonialRow): Testimonial {
  return {
    id: row.id,
    quote: row.quote,
    name: row.name,
    role: row.role,
    location: row.location,
    imageUrl: row.image_url,
    dateLabel: row.date_label,
    sortOrder: row.sort_order,
    status: row.status,
  };
}

const ORDER = 'ORDER BY sort_order ASC, id ASC';

export async function listTestimonials(): Promise<Testimonial[]> {
  const rows = await query<TestimonialRow[]>(`SELECT * FROM testimonials ${ORDER}`);
  return rows.map(mapTestimonial);
}

export async function listPublishedTestimonials(): Promise<Testimonial[]> {
  const rows = await query<TestimonialRow[]>(
    `SELECT * FROM testimonials WHERE status = 'published' ${ORDER}`
  );
  return rows.map(mapTestimonial);
}

export async function getTestimonialById(id: number): Promise<Testimonial | null> {
  const rows = await query<TestimonialRow[]>('SELECT * FROM testimonials WHERE id = ? LIMIT 1', [
    id,
  ]);
  return rows.length ? mapTestimonial(rows[0]) : null;
}

function params(input: TestimonialInput, actor: string) {
  return [
    input.quote.trim(),
    input.name.trim(),
    input.role?.trim() || null,
    input.location?.trim() || null,
    input.imageUrl?.trim() || null,
    input.dateLabel?.trim() || null,
    input.sortOrder ?? 0,
    input.status,
    actor,
  ];
}

export async function createTestimonial(
  input: TestimonialInput,
  actor: string
): Promise<Testimonial> {
  const result = await query<ResultSetHeader>(
    `INSERT INTO testimonials
       (quote, name, role, location, image_url, date_label, sort_order, status, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params(input, actor)
  );
  const created = await getTestimonialById(result.insertId);
  if (!created) throw new Error('Testimonial vanished immediately after insert.');
  return created;
}

export async function updateTestimonial(
  id: number,
  input: TestimonialInput,
  actor: string
): Promise<Testimonial | null> {
  await query(
    `UPDATE testimonials
        SET quote = ?, name = ?, role = ?, location = ?, image_url = ?, date_label = ?,
            sort_order = ?, status = ?, updated_by = ?
      WHERE id = ?`,
    [...params(input, actor), id]
  );
  return getTestimonialById(id);
}

export async function deleteTestimonial(id: number): Promise<void> {
  await query('DELETE FROM testimonials WHERE id = ?', [id]);
}
