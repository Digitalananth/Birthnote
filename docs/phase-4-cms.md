# Phase 4 — Static pages, blog and SEO

Marketing copy moves out of the repo and into the database, editable from the
admin panel without a deploy.

```
/<slug>                    an editable page          (pages)
/blog                      the index
/blog/<slug>               a post                    (blog_posts)
/blog/category/<slug>      one category              (blog_categories)
```

## Who can edit

Any signed-in admin — owners and staff alike. A blog only the owner can write
to is not much of a blog, and the owner/staff split is about managing people,
not about copy. Everything goes through one gate, `requireContentAdmin` in
`src/lib/content-admin.ts`, so narrowing it to owners is a one-line change in
one place rather than six.

The README's role table was updated to match: staff now covers orders, pages
and the blog; owner adds managing admins.

## Markdown, and why raw HTML is escaped

Bodies are Markdown. `src/lib/markdown.ts` closes both routes to stored XSS:

1. **Raw HTML is escaped, not passed through.** marked emits it verbatim by
   default, which would make the editor a way to run script on this site's own
   origin.
2. **Link and image URLs are limited to an allow-list of schemes**
   (`http`, `https`, `mailto`, `tel`, plus relative paths and anchors).
   `[click](javascript:alert(1))` is valid Markdown that marked renders as-is
   — no HTML involved — so escaping alone would not have been enough. A
   blocked link keeps its text and loses its destination.

The alternative, sanitising the rendered output, means running a DOM
implementation on the server for a feature nobody asked for.

Verified by publishing a page containing every vector and reading back what
the route actually served:

```
input                                   rendered
--------------------------------------  ----------------------------------------
<script>alert(1)</script>               <p>&lt;script&gt;alert(1)&lt;/script&gt;</p>
Inline <img src=x onerror=alert(2)>     Inline &lt;img src=x onerror=alert(2)&gt;
[js link](javascript:alert(3))          <p>js link</p>
[data link](data:text/html,<script>…)   <p>data link</p>
![img](javascript:alert(5))             <p>img</p>
[ok link](https://example.com)          <a href="https://example.com" rel="noopener noreferrer">
[relative](/terms)                      <a href="/terms">
```

## Reserved slugs

Next.js matches its own static routes before `/[slug]`, so a page slugged
"login" would save happily and then never be reachable. `RESERVED_SLUGS`
refuses those names at validation time — far kinder than shipping a page that
silently never appears.

Posts are exempt: they live under `/blog/`, where they cannot collide with
anything of ours.

## Caching

No CMS route is prerendered at build. The dynamic routes return an empty
`generateStaticParams`, so **a deploy never needs a reachable database** —
each URL is generated on first request and cached for an hour from there.

Saving in the admin calls `revalidatePath` on both the old and new paths, so
an edit is live immediately and a renamed slug does not leave the previous URL
serving a cached copy of a page that has moved.

`/blog` and `/sitemap.xml` read the whole collection and are rendered per
request instead — simpler than invalidating them from six places. The sitemap
falls back to the fixed routes if the database is unreachable, because a
sitemap missing the blog beats a 500 where the sitemap should be.

## SEO

Every page, post and category carries its own `meta_title` and
`meta_description`, falling back to the title and an excerpt derived from the
body. Posts also emit Open Graph tags including `publishedTime` and the cover
image. The sitemap is generated from the database, so publishing puts a URL in
it without a deploy; drafts never appear.

## Verified end to end

Against a real MySQL, over HTTP:

| Check | Result |
| --- | --- |
| Page published, then fetched at its slug | Renders; Markdown becomes real headings, lists and links |
| Every XSS vector above | Neutralised in the served HTML |
| Reserved slug ("login") | Refused |
| Duplicate slug | Refused |
| Create while signed out | 401 |
| Draft page, draft post | 404 on the public site |
| Blog index and category page | Published posts only |
| Sitemap | Published pages, posts and non-empty categories; no drafts |
| Deleted page | 404, and gone from the sitemap |
| Renamed slug | New URL live, old URL 404 — no stale cache |
| Editing a published post | `published_at` unchanged |
| Deleted category | Posts survive with `category_id` null; post still live |
| Staff on /admin/blog and creating a post | Allowed |
| Staff on /admin/users | Redirected to /admin |
| `npm run build` with no database | Succeeds |
| Phases 1–3 regression | Orders, accounts and admin roles unaffected |

## Not included

Image uploads (cover images are URLs); scheduled publishing; revision history;
a rich-text editor — the body field is a Markdown textarea. The spec's "up to
10 pages" is not enforced as a limit; nothing breaks at eleven.
