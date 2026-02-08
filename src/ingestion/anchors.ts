export interface AnchorInput {
  heading: string;
}

export const normalizeHeadingSlug = (heading: string): string => {
  const normalized = heading.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const dashed = normalized.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const fallback = dashed.length > 0 ? dashed : 'section';
  return fallback.slice(0, 80);
};

export const buildAnchorKey = (slug: string, ordinal: number): string => {
  return `${slug}#${ordinal}`;
};

export const buildAnchors = (sections: AnchorInput[]): string[] => {
  const counts = new Map<string, number>();

  return sections.map((section) => {
    const slug = normalizeHeadingSlug(section.heading);
    const nextOrdinal = (counts.get(slug) ?? 0) + 1;
    counts.set(slug, nextOrdinal);
    return buildAnchorKey(slug, nextOrdinal);
  });
};
