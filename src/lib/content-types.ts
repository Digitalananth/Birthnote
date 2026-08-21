/**
 * CMS record shapes and the slug rules.
 *
 * Free of server-only imports so the admin editor, which is a client
 * component, can share the validation the API enforces.
 */
export type ContentStatus = 'draft' | 'published';

export const CONTENT_STATUSES: ContentStatus[] = ['draft', 'published'];

export interface Page {
  id: number;
  slug: string;
  title: string;
  bodyMarkdown: string;
  metaTitle: string | null;
  metaDescription: string | null;
  status: ContentStatus;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BlogCategory {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

export interface BlogPost {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  bodyMarkdown: string;
  categoryId: number | null;
  categoryName: string | null;
  categorySlug: string | null;
  coverImageUrl: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  status: ContentStatus;
  publishedAt: string | null;
  authorName: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Top-level paths a page may not claim.
 *
 * Next.js matches its own static routes before `/[slug]`, so a page slugged
 * "login" would save happily and then be unreachable forever. Refusing the
 * slug is far kinder than shipping a page that silently never appears.
 */
export const RESERVED_SLUGS = [
  'account',
  'admin',
  'api',
  'blog',
  'favicon.ico',
  'forgot-password',
  'login',
  'payment',
  'privacy',
  'request-a-banknote',
  'reset-password',
  'robots.txt',
  'signup',
  'sitemap.xml',
  'terms',
  'track-order',
  '_next',
];

/** Turns a title into a URL-safe slug. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

export interface ContentErrors {
  slug?: string;
  title?: string;
  name?: string;
  bodyMarkdown?: string;
  metaTitle?: string;
  metaDescription?: string;
  excerpt?: string;
  status?: string;
  coverImageUrl?: string;
}

/**
 * Slug rules shared by pages, posts and categories.
 *
 * `reserved` is only checked for pages: a post lives under /blog/, where it
 * cannot collide with anything of ours.
 */
export function validateSlug(slug: string, { reserved = false } = {}): string | undefined {
  if (!slug) return 'Enter a slug';
  if (slug.length > 160) return 'That slug is too long';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return 'Use lower-case letters, numbers and hyphens only';
  }
  if (reserved && RESERVED_SLUGS.includes(slug)) {
    return `"${slug}" is used by the site itself — choose another`;
  }
  return undefined;
}

export interface PageInput {
  slug: string;
  title: string;
  bodyMarkdown: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  status: ContentStatus;
}

export function validatePage(values: Partial<PageInput>): {
  valid: boolean;
  errors: ContentErrors;
} {
  const errors: ContentErrors = {};
  const title = (values.title ?? '').trim();
  const slug = (values.slug ?? '').trim();
  const body = (values.bodyMarkdown ?? '').trim();

  if (!title) errors.title = 'Enter a title';
  else if (title.length > 200) errors.title = 'That title is too long';

  const slugError = validateSlug(slug, { reserved: true });
  if (slugError) errors.slug = slugError;

  if (!body) errors.bodyMarkdown = 'Write something first';

  if ((values.metaTitle ?? '').length > 200) errors.metaTitle = 'Keep this under 200 characters';
  if ((values.metaDescription ?? '').length > 320) {
    errors.metaDescription = 'Keep this under 320 characters';
  }
  if (values.status && !CONTENT_STATUSES.includes(values.status)) {
    errors.status = 'Choose draft or published';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export interface PostInput extends PageInput {
  excerpt?: string | null;
  categoryId?: number | null;
  coverImageUrl?: string | null;
}

export function validatePost(values: Partial<PostInput>): {
  valid: boolean;
  errors: ContentErrors;
} {
  const { errors } = validatePage(values);
  // A post lives under /blog/, so it cannot collide with a site route.
  const slug = (values.slug ?? '').trim();
  const slugError = validateSlug(slug);
  if (slugError) errors.slug = slugError;
  else delete errors.slug;

  if ((values.excerpt ?? '').length > 500) errors.excerpt = 'Keep this under 500 characters';
  if ((values.coverImageUrl ?? '').length > 500) errors.coverImageUrl = 'That URL is too long';

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateCategory(values: { name?: string; slug?: string; description?: string }): {
  valid: boolean;
  errors: ContentErrors;
} {
  const errors: ContentErrors = {};
  const name = (values.name ?? '').trim();
  if (!name) errors.name = 'Enter a name';
  else if (name.length > 160) errors.name = 'That name is too long';

  const slugError = validateSlug((values.slug ?? '').trim());
  if (slugError) errors.slug = slugError;

  if ((values.description ?? '').length > 500) {
    errors.metaDescription = 'Keep this under 500 characters';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
