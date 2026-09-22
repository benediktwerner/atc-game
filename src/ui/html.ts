/**
 * Markup that is already escaped and may therefore be interpolated as-is. Every other
 * value interpolated into an `html` template is escaped, so forgetting to escape one
 * is impossible rather than merely discouraged.
 */
export class Html {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

/**
 * Builds markup, escaping every interpolated value that is not already `Html`.
 * Arrays are concatenated, and `false`/`null`/`undefined` render as nothing so that
 * `${condition && html`…`}` works as a conditional fragment.
 *
 * Prettier formats template literals tagged `html`, which is the reason this exists
 * rather than plain strings: the markup stays readable and diffable in place.
 */
export function html(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Html {
  return new Html(
    strings.reduce(
      (out, chunk, index) => out + interpolate(values[index - 1]) + chunk,
    ),
  );
}

/** Marks markup from a trusted source — a bundled `.html` file — as safe. */
export function raw(markup: string): Html {
  return new Html(markup);
}

/** Replaces an element's content. Takes `Html`, so a bare string cannot slip in. */
export function setHtml(root: HTMLElement, markup: Html): void {
  root.innerHTML = markup.value;
}

const ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ENTITIES[char]!);
}

function interpolate(value: unknown): string {
  if (value instanceof Html) return value.value;
  if (Array.isArray(value)) return value.map(interpolate).join('');
  if (value === false || value === null || value === undefined) return '';
  return escapeHtml(String(value));
}
