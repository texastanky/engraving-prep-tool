import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Frame,
  Layers,
  FileOutput,
  ShieldCheck,
  WifiOff,
  PenTool,
  Crosshair,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";

const PAGE_TITLE = "Engraving Prep Tool — ForgeMark Industries";
const PAGE_DESCRIPTION =
  "Lay out and export laser engraving and marking work: design preparation, FFL and NFA marking blocks, masks, vector tools, and actual-size export.";

const FEATURES = [
  {
    icon: Crosshair,
    title: "FFL and NFA marking blocks",
    body: "Build the marking from your saved shop details, at the character height you specify, with the required lines laid out for you to verify.",
  },
  {
    icon: Frame,
    title: "Masks that behave like clipping",
    body: "Clip artwork into a shape and adjust it any time. The original art is never modified, so nothing is lost when requirements change.",
  },
  {
    icon: PenTool,
    title: "Bring in Illustrator files as vectors",
    body: "Import SVG artwork as editable paths, draw new shapes, and use the built-in part silhouettes for slides, lowers, magazines and tags.",
  },
  {
    icon: Layers,
    title: "Prepare art for the material",
    body: "Warp, crop, erase, trace, and offset paths. Work against the real part photo at true size so placement is decided on screen.",
  },
  {
    icon: FileOutput,
    title: "Actual-size export",
    body: "True-vector SVG with cut and engrave grouped separately, plus PNG, JPEG and PDF at your material size.",
  },
  {
    icon: WifiOff,
    title: "Local-first",
    body: "Your artwork, shop details and presets stay on your machine. Licensed installs keep working offline.",
  },
];

/** Public page: what this software is, for customers and for underwriting. */
export default function Landing() {
  useEffect(() => {
    document.title = PAGE_TITLE;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", PAGE_DESCRIPTION);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <div className="leading-tight">
              <div className="font-serif text-sm font-bold">ForgeMark Industries</div>
              <div className="text-[11px] text-muted-foreground">Engraving Prep Tool</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="#pricing"
              className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
            >
              Pricing
            </a>
            <Link to="/terms" className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline">
              Terms
            </Link>
            <Button asChild size="sm">
              <Link to="/canvas">
                Open the app <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </nav>

      <section className="mx-auto max-w-6xl px-4 pt-16 pb-12">
        <p className="text-xs uppercase tracking-[0.2em] text-primary">For laser engraving and marking</p>
        <h1 className="mt-3 max-w-3xl font-serif text-4xl leading-tight font-bold sm:text-5xl">
          Prepare engraving artwork, including marking blocks, without leaving your desk.
        </h1>
        <p className="mt-5 max-w-2xl text-muted-foreground">
          Engraving Prep Tool is a desktop workspace for shops that mark metal. Bring in artwork, lay it
          against the real part at true size, mask and adjust it, add a marking block from your saved shop
          details, and export files your laser software can open at actual size.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/canvas">
              Open the app <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <a href="#features">See what it does</a>
          </Button>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="font-serif text-2xl font-bold">What it does</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-lg border border-border bg-card p-4">
              <feature.icon className="h-4 w-4 text-primary" />
              <h3 className="mt-3 text-sm font-semibold">{feature.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="font-serif text-2xl font-bold">Who it is for</h2>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>
                Shops that mark firearms: manufacturer marking and NFA marking, engraving businesses, and
                laser marking services
              </li>
              <li>
                Anyone doing vector cutting or raster engraving on metal, anodized parts, polymer, and
                coated blanks
              </li>
            </ul>
          </div>
          <div>
            <h2 className="font-serif text-2xl font-bold">What you need</h2>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>A Windows 10 or 11 PC</li>
              <li>Laser software that can import SVG, PNG, JPEG or PDF at actual size</li>
              <li>No internet connection required to work, once a licence is activated</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="font-serif text-2xl font-bold">Pricing</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold">Free</h3>
            <p className="mt-1 font-serif text-3xl font-bold">$0</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Full design toolset with a monthly export allowance and a daily limit on AI features. No
              payment details required.
            </p>
          </div>
          <div className="rounded-lg border border-primary/40 bg-card p-5">
            <h3 className="text-sm font-semibold">Licensed</h3>
            <p className="mt-1 font-serif text-3xl font-bold">Contact us</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Unlimited exports, higher AI limits, and offline use. Email{" "}
              <a className="text-primary hover:underline" href="mailto:support@forgemarkindustries.com">
                support@forgemarkindustries.com
              </a>{" "}
              for current pricing and a licence key.
            </p>
          </div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Purchases are covered by our{" "}
          <Link className="text-primary hover:underline" to="/refunds">
            14-day refund policy
          </Link>
          .
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">A layout tool, not legal advice</h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            This software helps you lay out and export artwork, including marking blocks. It does not
            determine whether a marking satisfies any requirement, and any default size or layout it offers
            is a starting point only. You are responsible for confirming current requirements and for
            measuring a test mark before marking a finished part. See the{" "}
            <Link className="text-primary hover:underline" to="/terms">
              Terms of Service
            </Link>
            .
          </p>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 md:flex-row md:items-center md:justify-between">
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground">ForgeMark Industries</p>
            <p>a d/b/a of Petes Guns and Stuff LLC</p>
            <p className="mt-1">
              <a className="text-primary hover:underline" href="mailto:support@forgemarkindustries.com">
                <Mail className="mr-1 inline h-3 w-3" />
                support@forgemarkindustries.com
              </a>
            </p>
          </div>

          <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <Link to="/terms" className="hover:text-foreground">
              Terms of Service
            </Link>
            <Link to="/privacy" className="hover:text-foreground">
              Privacy Policy
            </Link>
            <Link to="/refunds" className="hover:text-foreground">
              Refunds &amp; Support
            </Link>
            <Link to="/canvas" className="hover:text-foreground">
              Open the app
            </Link>
          </nav>
        </div>
        <div className="border-t border-border/60">
          <p className="mx-auto max-w-6xl px-4 py-4 text-[11px] text-muted-foreground">
            &copy; {new Date().getFullYear()} Petes Guns and Stuff LLC d/b/a ForgeMark Industries. All
            rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
