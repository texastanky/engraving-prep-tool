import {
  Crosshair,
  ShieldCheck,
  Truck,
  Mail,
  ChevronRight,
  ArrowRight,
  Clock,
  MapPin,
  BadgeCheck,
  Layers,
  Ruler,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Link } from "react-router-dom";

const SERVICES = [
  {
    icon: Crosshair,
    title: "Local Firearms",
    description:
      "On-hand inventory including Aero Precision AR-10/AR-15 platforms, Glock 9mm pistols, and more. View availability and schedule pickup.",
    cta: "View Local Inventory",
    href: "https://petesgunsandstuff.com",
  },
  {
    icon: Truck,
    title: "FFL Transfers",
    description:
      "Inbound transfers from online sellers and other FFLs. Contact us before shipping so your transfer arrives with the right information.",
    cta: "Learn About Transfers",
    href: "#transfers",
  },
  {
    icon: Layers,
    title: "Special Orders",
    description:
      "Browse distributor availability for firearms and accessories. Pricing, eligibility, and availability confirmed before purchase.",
    cta: "Browse Special Orders",
    href: "https://petesgunsandstuff.com",
  },
] as const;

const TRANSFER_STEPS = [
  "Contact us before placing or shipping your order.",
  "Confirm the seller has the correct FFL information and your contact details.",
  "The seller ships the firearm with the required transfer paperwork.",
  "We receive and log the firearm, then contact you when ready.",
  "Schedule your pickup appointment and bring valid ID plus Texas LTC if applicable.",
  "Complete all required paperwork and background check steps.",
] as const;

const PRICING = [
  { amount: "$25", label: "First firearm with valid Texas LTC" },
  { amount: "$30", label: "First firearm without LTC (NICS required)" },
  { amount: "$15", label: "Each additional firearm, same appointment" },
] as const;

const WHY_CHOOSE = [
  "Federally licensed Type 07 FFL and Class 2 SOT",
  "Owner-operated, one-on-one appointment service",
  "Flat transfer fees with no hidden costs",
  "Private pickup location shared after coordination",
  "ATF paperwork and NICS requirements handled carefully",
] as const;

export default function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Crosshair className="h-6 w-6 text-primary" />
            <span className="font-serif text-lg font-bold tracking-tight">
              Petes Guns {"&"} Stuff
            </span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm">
            <a href="#services" className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              Services
            </a>
            <a href="#transfers" className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              Transfers
            </a>
            <a href="#laser" className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              Laser Marking
            </a>
            <a href="#contact" className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              Contact
            </a>
            <Link to="/canvas" className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              Canvas Tool
            </Link>
          </div>
          <Button size="sm" className="hidden sm:flex" asChild>
            <a href="#contact">
              Request Appointment
            </a>
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-6xl px-4 py-20 md:py-32">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-primary font-medium mb-6">
            <ShieldCheck className="h-4 w-4" />
            <span>Home-Based FFL | Henderson, Texas | By Appointment Only</span>
          </div>
          <h1 className="font-serif text-4xl md:text-6xl font-bold leading-[1.1] tracking-tight max-w-4xl text-balance">
            Local Firearms, FFL Transfers {"&"} Special Orders in{" "}
            <span className="text-primary">Henderson, TX</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">
            A licensed, home-based FFL serving Henderson and Rusk County by appointment.
            No crowded counter, no waiting in line — just one-on-one service from a licensed professional.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4">
            <Button size="lg" className="text-base" asChild>
              <a href="#contact">
                Request Appointment
                <ChevronRight className="ml-1 h-4 w-4" />
              </a>
            </Button>
            <Button size="lg" variant="secondary" className="text-base" asChild>
              <a href="#services">
                View Services
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="mx-auto max-w-6xl px-4 py-20 md:py-28">
        <div className="mb-14">
          <p className="text-xs uppercase tracking-[0.2em] text-primary font-medium mb-3">
            What We Offer
          </p>
          <h2 className="font-serif text-3xl md:text-4xl font-bold">
            Start with what you need today
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {SERVICES.map((service) => (
            <div
              key={service.title}
              className="group rounded-lg border border-border bg-card p-6 hover:border-primary/40 transition-colors"
            >
              <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center mb-5">
                <service.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-serif text-xl font-bold mb-3">{service.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed mb-5">
                {service.description}
              </p>
              <a
                href={service.href}
                className="inline-flex items-center text-sm font-medium text-primary hover:underline cursor-pointer"
              >
                {service.cta}
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Transfer Pricing */}
      <section id="transfers" className="border-y border-border bg-secondary/50">
        <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
          <div className="grid md:grid-cols-2 gap-16">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-primary font-medium mb-3">
                FFL Transfers
              </p>
              <h2 className="font-serif text-3xl md:text-4xl font-bold mb-6">
                Flat, transparent pricing
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-8">
                We accept inbound firearm transfers from online sellers and other FFLs.
                Customers must contact us before shipping to prevent missing paperwork or delayed pickup.
              </p>
              <div className="space-y-4">
                {PRICING.map((price) => (
                  <div
                    key={price.label}
                    className="flex items-center gap-4 rounded-md border border-border bg-card px-5 py-4"
                  >
                    <span className="text-2xl font-bold text-primary font-serif min-w-[60px]">
                      {price.amount}
                    </span>
                    <span className="text-sm text-muted-foreground">{price.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-primary font-medium mb-3">
                Transfer Process
              </p>
              <h3 className="font-serif text-xl font-bold mb-6">
                How it works
              </h3>
              <ol className="space-y-4">
                {TRANSFER_STEPS.map((step, i) => (
                  <li key={i} className="flex gap-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {i + 1}
                    </span>
                    <span className="text-sm text-muted-foreground leading-relaxed pt-0.5">
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="mx-auto max-w-6xl px-4 py-20 md:py-28">
        <div className="grid md:grid-cols-2 gap-12 items-start">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary font-medium mb-3">
              Why Buy {"&"} Transfer With Petes
            </p>
            <h2 className="font-serif text-3xl md:text-4xl font-bold mb-4">
              Private, compliant service without the crowded counter
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Petes Guns and Stuff is built for customers who want clear pricing, appointment-based attention, and a licensed local FFL who keeps the process organized.
            </p>
          </div>
          <ul className="space-y-4 pt-2">
            {WHY_CHOOSE.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <BadgeCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm text-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Laser Marking */}
      <section id="laser" className="border-y border-border bg-secondary/50">
        <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.2em] text-primary font-medium mb-3">
              Laser Marking {"&"} Class 2 SOT Services
            </p>
            <h2 className="font-serif text-3xl md:text-4xl font-bold mb-6">
              Custom, firearm, and NFA marking by review
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-8">
              Petes Guns and Stuff LLC is a licensed Type 07 FFL and Class 2 SOT manufacturer.
              We review cosmetic laser marking, firearm manufacturer marking, and NFA marking projects
              by appointment before any work begins.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                "Custom cosmetic laser marking for non-serialized parts",
                "Type 07 manufacturer marking on firearms & receivers",
                "Class 2 SOT NFA maker/manufacturer marking",
                "Proof approval and quote confirmation before cutting",
              ].map((item) => (
                <div key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-8">
              <Button variant="secondary" asChild>
                <Link to="/canvas">
                  <Ruler className="mr-2 h-4 w-4" />
                  Open Canvas Fitting Tool
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Contact / Quick Info */}
      <section id="contact" className="mx-auto max-w-6xl px-4 py-20 md:py-28">
        <div className="grid md:grid-cols-2 gap-12">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary font-medium mb-3">
              Get In Touch
            </p>
            <h2 className="font-serif text-3xl md:text-4xl font-bold mb-6">
              Ready to schedule?
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-8">
              Contact us before shipping any firearm or visiting.
              Appointment-only service means no crowded counter, no waiting in line, and one-on-one pickup time.
              The address is shared after coordination.
            </p>
            <Button size="lg" className="text-base" asChild>
              <a href="mailto:support@petesgunsandstuff.com">
                <Mail className="mr-2 h-4 w-4" />
                support@petesgunsandstuff.com
              </a>
            </Button>
          </div>
          <div className="space-y-4">
            <h3 className="font-serif text-lg font-bold mb-4">Quick Info</h3>
            {[
              { icon: ShieldCheck, label: "License", value: "Type 07 FFL and Class 2 SOT" },
              { icon: MapPin, label: "Service Area", value: "Henderson, Texas and nearby East Texas" },
              { icon: Clock, label: "Hours", value: "By appointment only" },
              { icon: Mail, label: "Contact", value: "support@petesgunsandstuff.com" },
            ].map((info) => (
              <div
                key={info.label}
                className="flex items-start gap-4 rounded-md border border-border bg-card p-4"
              >
                <info.icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    {info.label}
                  </p>
                  <p className="text-sm text-foreground mt-0.5">{info.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Important Policies */}
      <section className="border-t border-border bg-secondary/30">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h3 className="font-serif text-lg font-bold mb-6 text-center">Important Policies</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-muted-foreground">
            <div className="rounded-md border border-border bg-card p-4">
              <p className="font-medium text-foreground mb-1">Appointment Only</p>
              <p>All visits, transfers, purchases, and pickups are by confirmed appointment only.</p>
            </div>
            <div className="rounded-md border border-border bg-card p-4">
              <p className="font-medium text-foreground mb-1">Background Checks</p>
              <p>Firearms cannot be released unless all required checks are completed and approved.</p>
            </div>
            <div className="rounded-md border border-border bg-card p-4">
              <p className="font-medium text-foreground mb-1">Multiple Firearms</p>
              <p>Some multi-firearm transactions may require federal ATF reporting.</p>
            </div>
            <div className="rounded-md border border-border bg-card p-4">
              <p className="font-medium text-foreground mb-1">Inbound Transfers</p>
              <p>Contact us before shipping. Shipments without prior communication may be delayed.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Crosshair className="h-4 w-4 text-primary" />
            <span className="font-serif text-sm font-bold">Petes Guns {"&"} Stuff LLC</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {"\u00A9"} {new Date().getFullYear()} Petes Guns {"&"} Stuff LLC. Henderson, Texas. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
