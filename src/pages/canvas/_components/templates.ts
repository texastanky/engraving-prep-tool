export type EngravingTemplate = {
  id: string;
  name: string;
  category: string;
  url: string;
};

export const ENGRAVING_TEMPLATES: EngravingTemplate[] = [
  {
    id: "sig-scroll-365-macro",
    name: "Sig 365 Macro Scroll",
    category: "SIG Sauer",
    url: "/templates/sig-scroll-365-macro.svg",
  },
  {
    id: "sig-scroll-duo",
    name: "Sig Scroll Duo",
    category: "SIG Sauer",
    url: "/templates/sig-scroll-duo.svg",
  },
  {
    id: "sw-full",
    name: "S&W Full",
    category: "Smith & Wesson",
    url: "/templates/sw-full.svg",
  },
  {
    id: "colt",
    name: "Colt",
    category: "Colt",
    url: "/templates/colt.svg",
  },
  { id: "glock-01", name: "Glock 01", category: "Glock", url: "/templates/glock-01.svg" },
  { id: "glock-02", name: "Glock 02", category: "Glock", url: "/templates/glock-02.svg" },
  { id: "glock-03", name: "Glock 03", category: "Glock", url: "/templates/glock-03.svg" },
  { id: "glock-04", name: "Glock 04", category: "Glock", url: "/templates/glock-04.svg" },
  { id: "glock-05", name: "Glock 05", category: "Glock", url: "/templates/glock-05.svg" },
  { id: "glock-06", name: "Glock 06", category: "Glock", url: "/templates/glock-06.svg" },
  { id: "glock-07", name: "Glock 07", category: "Glock", url: "/templates/glock-07.svg" },
  { id: "glock-08", name: "Glock 08", category: "Glock", url: "/templates/glock-08.svg" },
  { id: "glock-09", name: "Glock 09", category: "Glock", url: "/templates/glock-09.svg" },
  { id: "glock-10", name: "Glock 10", category: "Glock", url: "/templates/glock-10.svg" },
  { id: "glock-11", name: "Glock 11", category: "Glock", url: "/templates/glock-11.svg" },
  { id: "glock-12", name: "Glock 12", category: "Glock", url: "/templates/glock-12.svg" },
  { id: "glock-13", name: "Glock 13", category: "Glock", url: "/templates/glock-13.svg" },
  { id: "glock-14", name: "Glock 14", category: "Glock", url: "/templates/glock-14.svg" },
  { id: "glock-15", name: "Glock 15", category: "Glock", url: "/templates/glock-15.svg" },
  { id: "glock-16", name: "Glock 16", category: "Glock", url: "/templates/glock-16.svg" },
  { id: "glock-17", name: "Glock 17", category: "Glock", url: "/templates/glock-17.svg" },
  { id: "glock-18", name: "Glock 18", category: "Glock", url: "/templates/glock-18.svg" },
  { id: "glock-19", name: "Glock 19", category: "Glock", url: "/templates/glock-19.svg" },
  { id: "glock-20", name: "Glock 20", category: "Glock", url: "/templates/glock-20.svg" },
  { id: "glock-21", name: "Glock 21", category: "Glock", url: "/templates/glock-21.svg" },
  { id: "glock-22", name: "Glock 22", category: "Glock", url: "/templates/glock-22.svg" },
  { id: "glock-23", name: "Glock 23", category: "Glock", url: "/templates/glock-23.svg" },
  { id: "glock-24", name: "Glock 24", category: "Glock", url: "/templates/glock-24.svg" },
  { id: "glock-25", name: "Glock 25", category: "Glock", url: "/templates/glock-25.svg" },
  { id: "glock-26", name: "Glock 26", category: "Glock", url: "/templates/glock-26.svg" },
  { id: "glock-27", name: "Glock 27", category: "Glock", url: "/templates/glock-27.svg" },
  { id: "glock-28", name: "Glock 28", category: "Glock", url: "/templates/glock-28.svg" },
  { id: "glock-29", name: "Glock 29", category: "Glock", url: "/templates/glock-29.svg" },
  { id: "glock-30", name: "Glock 30", category: "Glock", url: "/templates/glock-30.svg" },
  { id: "glock-31", name: "Glock 31", category: "Glock", url: "/templates/glock-31.svg" },
  { id: "glock-32", name: "Glock 32", category: "Glock", url: "/templates/glock-32.svg" },
  { id: "glock-33", name: "Glock 33", category: "Glock", url: "/templates/glock-33.svg" },
  { id: "glock-34", name: "Glock 34", category: "Glock", url: "/templates/glock-34.svg" },
  {
    id: "springfield-bundle",
    name: "Springfield Bundle",
    category: "Springfield",
    url: "/templates/springfield-bundle.svg",
  },
  {
    id: "taurus-ready",
    name: "Taurus Ready",
    category: "Taurus",
    url: "/templates/taurus-ready.svg",
  },
  {
    id: "kimber",
    name: "Kimber",
    category: "Kimber",
    url: "/templates/kimber.svg",
  },
  {
    id: "kimber-2",
    name: "Kimber 2",
    category: "Kimber",
    url: "/templates/kimber-2.svg",
  },
  {
    id: "ar15-scroll-pattern",
    name: "AR-15 Scroll Pattern",
    category: "AR-15",
    url: "/templates/ar15-scroll-pattern.svg",
  },
  {
    id: "ar15-topography",
    name: "AR-15 Topography Pattern",
    category: "AR-15",
    url: "/templates/ar15-topography.svg",
  },
];

export const TEMPLATE_CATEGORIES = [...new Set(ENGRAVING_TEMPLATES.map((t) => t.category))];
