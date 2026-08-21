import 'server-only';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { query } from '@/lib/db';
import type {
  BlogCategory,
  BlogPost,
  ContentStatus,
  Page,
  PageInput,
  PostInput,
} from '@/lib/content-types';

export type { BlogCategory, BlogPost, Page } from '@/lib/content-types';

/** Thrown when a slug is already taken. */
export class SlugTakenError extends Error {
  constructor() {
    super('That slug is already in use.');
    this.name = 'SlugTakenError';
  }
}

function duplicate(error: unknown): boolean {
  return (error as { code?: string }).code === 'ER_DUP_ENTRY';
}

/* ------------------------------------------------------------------ pages */

interface PageRow extends RowDataPacket {
  id: number;
  slug: string;
  title: string;
  body_markdown: string;
  meta_title: string | null;
  meta_description: string | null;
  status: ContentStatus;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapPage(row: PageRow): Page {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    bodyMarkdown: row.body_markdown,
    metaTitle: row.meta_title,
    metaDescription: row.meta_description,
    status: row.status,
    updatedBy: row.updated_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listPages(): Promise<Page[]> {
  const rows = await query<PageRow[]>('SELECT * FROM pages ORDER BY title ASC');
  return rows.map(mapPage);
}

export async function getPageById(id: number): Promise<Page | null> {
  const rows = await query<PageRow[]>('SELECT * FROM pages WHERE id = ? LIMIT 1', [id]);
  return rows.length ? mapPage(rows[0]) : null;
}

/**
 * A page for the public site.
 *
 * Filters to `published` in the SQL rather than in the caller, so there is no
 * route that can accidentally serve a draft.
 */
export async function getPublishedPage(slug: string): Promise<Page | null> {
  const rows = await query<PageRow[]>(
    "SELECT * FROM pages WHERE slug = ? AND status = 'published' LIMIT 1",
    [slug]
  );
  return rows.length ? mapPage(rows[0]) : null;
}

export async function createPage(input: PageInput, actor: string): Promise<Page> {
  try {
    const result = await query<ResultSetHeader>(
      `INSERT INTO pages (slug, title, body_markdown, meta_title, meta_description, status, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.slug,
        input.title,
        input.bodyMarkdown,
        input.metaTitle || null,
        input.metaDescription || null,
        input.status,
        actor,
      ]
    );
    const page = await getPageById(result.insertId);
    if (!page) throw new Error('Page vanished immediately after insert.');
    return page;
  } catch (error) {
    if (duplicate(error)) throw new SlugTakenError();
    throw error;
  }
}

export async function updatePage(
  id: number,
  input: PageInput,
  actor: string
): Promise<Page | null> {
  try {
    await query(
      `UPDATE pages
          SET slug = ?, title = ?, body_markdown = ?, meta_title = ?,
              meta_description = ?, status = ?, updated_by = ?
        WHERE id = ?`,
      [
        input.slug,
        input.title,
        input.bodyMarkdown,
        input.metaTitle || null,
        input.metaDescription || null,
        input.status,
        actor,
        id,
      ]
    );
  } catch (error) {
    if (duplicate(error)) throw new SlugTakenError();
    throw error;
  }
  return getPageById(id);
}

export async function deletePage(id: number): Promise<void> {
  await query('DELETE FROM pages WHERE id = ?', [id]);
}

/* ------------------------------------------------------------- categories */

interface CategoryRow extends RowDataPacket {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  meta_title: string | null;
  meta_description: string | null;
}

function mapCategory(row: CategoryRow): BlogCategory {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    metaTitle: row.meta_title,
    metaDescription: row.meta_description,
  };
}

export async function listCategories(): Promise<BlogCategory[]> {
  const rows = await query<CategoryRow[]>('SELECT * FROM blog_categories ORDER BY name ASC');
  return rows.map(mapCategory);
}

export async function getCategoryBySlug(slug: string): Promise<BlogCategory | null> {
  const rows = await query<CategoryRow[]>('SELECT * FROM blog_categories WHERE slug = ? LIMIT 1', [
    slug,
  ]);
  return rows.length ? mapCategory(rows[0]) : null;
}

export async function getCategoryById(id: number): Promise<BlogCategory | null> {
  const rows = await query<CategoryRow[]>('SELECT * FROM blog_categories WHERE id = ? LIMIT 1', [
    id,
  ]);
  return rows.length ? mapCategory(rows[0]) : null;
}

export interface CategoryInput {
  slug: string;
  name: string;
  description?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
}

export async function createCategory(input: CategoryInput): Promise<BlogCategory> {
  try {
    const result = await query<ResultSetHeader>(
      `INSERT INTO blog_categories (slug, name, description, meta_title, meta_description)
       VALUES (?, ?, ?, ?, ?)`,
      [
        input.slug,
        input.name,
        input.description || null,
        input.metaTitle || null,
        input.metaDescription || null,
      ]
    );
    const category = await getCategoryById(result.insertId);
    if (!category) throw new Error('Category vanished immediately after insert.');
    return category;
  } catch (error) {
    if (duplicate(error)) throw new SlugTakenError();
    throw error;
  }
}

export async function updateCategory(
  id: number,
  input: CategoryInput
): Promise<BlogCategory | null> {
  try {
    await query(
      `UPDATE blog_categories
          SET slug = ?, name = ?, description = ?, meta_title = ?, meta_description = ?
        WHERE id = ?`,
      [
        input.slug,
        input.name,
        input.description || null,
        input.metaTitle || null,
        input.metaDescription || null,
        id,
      ]
    );
  } catch (error) {
    if (duplicate(error)) throw new SlugTakenError();
    throw error;
  }
  return getCategoryById(id);
}

/** Posts keep their writing; the FK sets their category to null. */
export async function deleteCategory(id: number): Promise<void> {
  await query('DELETE FROM blog_categories WHERE id = ?', [id]);
}

/* ------------------------------------------------------------------ posts */

interface PostRow extends RowDataPacket {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  body_markdown: string;
  category_id: number | null;
  category_name: string | null;
  category_slug: string | null;
  cover_image_url: string | null;
  meta_title: string | null;
  meta_description: string | null;
  status: ContentStatus;
  published_at: Date | null;
  author_name: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

const SELECT_POST = `
  SELECT p.*, c.name AS category_name, c.slug AS category_slug
    FROM blog_posts p
    LEFT JOIN blog_categories c ON c.id = p.category_id`;

function mapPost(row: PostRow): BlogPost {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    bodyMarkdown: row.body_markdown,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categorySlug: row.category_slug,
    coverImageUrl: row.cover_image_url,
    metaTitle: row.meta_title,
    metaDescription: row.meta_description,
    status: row.status,
    publishedAt: row.published_at ? row.published_at.toISOString() : null,
    authorName: row.author_name,
    updatedBy: row.updated_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Every post, drafts included — the admin list. */
export async function listAllPosts(): Promise<BlogPost[]> {
  const rows = await query<PostRow[]>(`${SELECT_POST} ORDER BY p.updated_at DESC`);
  return rows.map(mapPost);
}

export async function listPublishedPosts(categorySlug?: string): Promise<BlogPost[]> {
  const rows = categorySlug
    ? await query<PostRow[]>(
        `${SELECT_POST} WHERE p.status = 'published' AND c.slug = ?
          ORDER BY p.published_at DESC, p.id DESC`,
        [categorySlug]
      )
    : await query<PostRow[]>(
        `${SELECT_POST} WHERE p.status = 'published'
          ORDER BY p.published_at DESC, p.id DESC`
      );
  return rows.map(mapPost);
}

export async function getPostById(id: number): Promise<BlogPost | null> {
  const rows = await query<PostRow[]>(`${SELECT_POST} WHERE p.id = ? LIMIT 1`, [id]);
  return rows.length ? mapPost(rows[0]) : null;
}

export async function getPublishedPost(slug: string): Promise<BlogPost | null> {
  const rows = await query<PostRow[]>(
    `${SELECT_POST} WHERE p.slug = ? AND p.status = 'published' LIMIT 1`,
    [slug]
  );
  return rows.length ? mapPost(rows[0]) : null;
}

export async function createPost(input: PostInput, actor: string): Promise<BlogPost> {
  try {
    const result = await query<ResultSetHeader>(
      `INSERT INTO blog_posts
         (slug, title, excerpt, body_markdown, category_id, cover_image_url,
          meta_title, meta_description, status, published_at, author_name, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.slug,
        input.title,
        input.excerpt || null,
        input.bodyMarkdown,
        input.categoryId || null,
        input.coverImageUrl || null,
        input.metaTitle || null,
        input.metaDescription || null,
        input.status,
        // Stamped only when it actually goes live.
        input.status === 'published' ? new Date() : null,
        actor,
        actor,
      ]
    );
    const post = await getPostById(result.insertId);
    if (!post) throw new Error('Post vanished immediately after insert.');
    return post;
  } catch (error) {
    if (duplicate(error)) throw new SlugTakenError();
    throw error;
  }
}

export async function updatePost(
  id: number,
  input: PostInput,
  actor: string
): Promise<BlogPost | null> {
  const existing = await getPostById(id);
  if (!existing) return null;

  /*
   * published_at is stamped the first time a post goes live and then left
   * alone. Re-stamping on every save would shuffle an old post back to the
   * top of the blog because someone fixed a typo in it.
   */
  const publishedAt =
    input.status === 'published'
      ? existing.publishedAt
        ? new Date(existing.publishedAt)
        : new Date()
      : existing.publishedAt
        ? new Date(existing.publishedAt)
        : null;

  try {
    await query(
      `UPDATE blog_posts
          SET slug = ?, title = ?, excerpt = ?, body_markdown = ?, category_id = ?,
              cover_image_url = ?, meta_title = ?, meta_description = ?, status = ?,
              published_at = ?, updated_by = ?
        WHERE id = ?`,
      [
        input.slug,
        input.title,
        input.excerpt || null,
        input.bodyMarkdown,
        input.categoryId || null,
        input.coverImageUrl || null,
        input.metaTitle || null,
        input.metaDescription || null,
        input.status,
        publishedAt,
        actor,
        id,
      ]
    );
  } catch (error) {
    if (duplicate(error)) throw new SlugTakenError();
    throw error;
  }
  return getPostById(id);
}

export async function deletePost(id: number): Promise<void> {
  await query('DELETE FROM blog_posts WHERE id = ?', [id]);
}

/** Slugs and timestamps for the sitemap — no bodies fetched. */
export async function listPublishedForSitemap(): Promise<{
  pages: Array<{ slug: string; updatedAt: string }>;
  posts: Array<{ slug: string; updatedAt: string }>;
  categories: Array<{ slug: string }>;
}> {
  const [pageRows, postRows, categoryRows] = await Promise.all([
    query<(RowDataPacket & { slug: string; updated_at: Date })[]>(
      "SELECT slug, updated_at FROM pages WHERE status = 'published'"
    ),
    query<(RowDataPacket & { slug: string; updated_at: Date })[]>(
      "SELECT slug, updated_at FROM blog_posts WHERE status = 'published'"
    ),
    // Only categories that have something to show.
    query<(RowDataPacket & { slug: string })[]>(
      `SELECT DISTINCT c.slug FROM blog_categories c
         JOIN blog_posts p ON p.category_id = c.id AND p.status = 'published'`
    ),
  ]);

  return {
    pages: pageRows.map((row) => ({ slug: row.slug, updatedAt: row.updated_at.toISOString() })),
    posts: postRows.map((row) => ({ slug: row.slug, updatedAt: row.updated_at.toISOString() })),
    categories: categoryRows.map((row) => ({ slug: row.slug })),
  };
}
