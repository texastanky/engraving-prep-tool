/**
 * Template gallery contents.
 *
 * Deliberately EMPTY. The previous contents were third-party design files
 * licensed from elsewhere and bundled into the app; shipping them inside a
 * product that is sold is exactly the kind of thing that creates a licensing
 * problem later, so they have been removed along with their assets.
 *
 * The gallery still works — it renders nothing while this list is empty, and
 * the card is hidden entirely. To ship templates again, add entries here and
 * put the matching files in `public/templates/`, but only with artwork you own
 * the rights to distribute. Anything bought, downloaded or traced from someone
 * else's work needs to stay out of the bundle.
 */

export type EngravingTemplate = {
  id: string;
  name: string;
  category: string;
  url: string;
};

export const ENGRAVING_TEMPLATES: EngravingTemplate[] = [];

export const TEMPLATE_CATEGORIES: string[] = [];
