// The built-in topic packs (data/skills/*.json), bundled into the page.
export interface Pack {
  id: string;
  name: string;
  description: string;
  terms: string[];
  hint: string;
}

const files = import.meta.glob<Pack>('../../../data/skills/*.json', {
  eager: true,
  import: 'default',
});

export const PACKS: Pack[] = Object.values(files).sort((a, b) => a.name.localeCompare(b.name));
