"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  Shield,
  FileText,
  Zap,
  ArrowRight,
  Mail,
  Lock,
  Eye,
  Server,
  KeyRound,
  ShieldCheck,
  Database,
} from "lucide-react";
import { getMe } from "@/lib/api";
import { getInviteCookie, clearInviteCookie } from "@/lib/invite-cookie";

export default function LandingPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const pendingInvite = getInviteCookie();
    if (pendingInvite) {
      clearInviteCookie();
      router.replace(`/invite?token=${encodeURIComponent(pendingInvite)}`);
      return;
    }

    getMe()
      .then((me) => {
        if (me?.approval_status === "approved") {
          router.replace("/dashboard");
        } else {
          setReady(true);
        }
      })
      .catch(() => setReady(true));
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fbfbf9]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#967868] border-t-transparent" />
      </div>
    );
  }

  return (
    <div dir="ltr" className="min-h-screen bg-[#fbfbf9] text-[#0a0a0a]">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 md:px-12 lg:px-20 py-5 bg-[#fbfbf9]/90 backdrop-blur-md sticky top-0 z-50 border-b border-[#0a0a0a]/5">
        <div className="flex items-center gap-3">
          <Image
            src="/logo-d-done-ai.png"
            alt="D-Done AI"
            width={36}
            height={36}
            className="rounded-md"
          />
          <span className="text-lg font-medium tracking-[-0.02em]">
            D-DONE AI
          </span>
        </div>

        <div className="flex items-center gap-10">
          <Link
            href="/"
            className="text-[13px] font-medium text-[#0a0a0a] hover:text-[#989898] transition-colors tracking-[-0.01em]"
          >
            Home
          </Link>
          <Link
            href="#about"
            className="text-[13px] font-medium text-[#0a0a0a] hover:text-[#989898] transition-colors tracking-[-0.01em]"
          >
            About
          </Link>
          <Link
            href="#how"
            className="text-[13px] font-medium text-[#0a0a0a] hover:text-[#989898] transition-colors tracking-[-0.01em]"
          >
            How It Works
          </Link>
          <Link
            href="#security"
            className="text-[13px] font-medium text-[#0a0a0a] hover:text-[#989898] transition-colors tracking-[-0.01em]"
          >
            Security
          </Link>
          <Link
            href="/login"
            className="text-[13px] font-medium bg-[#0a0a0a] text-[#fbfbf9] px-5 py-2 rounded-full hover:bg-[#2a2a2a] transition-colors tracking-[-0.01em]"
          >
            Log in
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative w-full min-h-[92vh] overflow-hidden">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/background.jpeg')" }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-[#fbfbf9] via-[#fbfbf9]/75 to-[#fbfbf9]/20" />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center h-full min-h-[92vh] max-w-2xl px-6 md:px-12 lg:px-20">
          <span className="text-[13px] font-medium tracking-[0.08em] uppercase text-[#967868] mb-6">
            AI-Powered Legal Intelligence
          </span>

          <h1 className="text-[clamp(3rem,6vw,5rem)] font-light leading-[1.05] tracking-[-0.03em] mb-8">
            <span className="whitespace-nowrap">Complete Due Diligence</span>
            <br />
            <span className="italic font-normal whitespace-nowrap">
              for Every Transaction.
            </span>
          </h1>

          <p className="text-[15px] leading-[1.7] max-w-md text-[#555] mb-10 tracking-[-0.01em]">
            We read the documents, surface every risk, and deliver a complete
            report — so your team can focus on strategy and decision making.
          </p>

          <div className="flex items-center gap-4">
            <Link
              href="/book-demo"
              className="inline-flex items-center gap-2 bg-[#0a0a0a] text-[#fbfbf9] px-7 py-3 rounded-full text-[13px] font-medium hover:bg-[#2a2a2a] transition-colors tracking-[-0.01em]"
            >
              Book a Demo
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              href="#about"
              className="inline-flex items-center gap-2 border border-[#0a0a0a]/15 px-7 py-3 rounded-full text-[13px] font-medium hover:border-[#0a0a0a]/40 transition-colors tracking-[-0.01em]"
            >
              Learn More
            </Link>
          </div>
        </div>
      </section>

      {/* About / Features Section */}
      <section
        id="about"
        className="min-h-screen flex items-center py-28 px-6 md:px-12 lg:px-20 bg-white"
      >
        <div className="max-w-5xl mx-auto">
          <span className="text-[12px] font-medium tracking-[0.08em] uppercase text-[#967868] block mb-4">
            Capabilities
          </span>
          <h2 className="text-[clamp(2.2rem,5vw,3.8rem)] font-light leading-[1.15] tracking-[-0.02em] mb-20 max-w-lg">
            <span className="whitespace-nowrap">No document goes</span>{" "}
            <span className="italic font-normal">unread.</span>
            <br />
            <span className="whitespace-nowrap">No risk goes unnoticed.</span>
          </h2>

          <div className="grid md:grid-cols-3 gap-x-12 gap-y-16">
            <div className="group">
              <div className="w-10 h-10 rounded-full bg-[#f5f4f0] flex items-center justify-center mb-5 group-hover:bg-[#967868]/10 transition-colors">
                <Shield className="w-4.5 h-4.5 text-[#967868]" />
              </div>
              <h3 className="text-[15px] font-medium mb-3 tracking-[-0.01em]">
                Audit-Ready Reports
              </h3>
              <p className="text-[14px] leading-[1.7] text-[#777] tracking-[-0.01em]">
                Generate complete, structured diligence reports from complex
                legal documents in minutes — ready for review, sharing, and
                decision-making.
              </p>
            </div>

            <div className="group">
              <div className="w-10 h-10 rounded-full bg-[#f5f4f0] flex items-center justify-center mb-5 group-hover:bg-[#967868]/10 transition-colors">
                <FileText className="w-4.5 h-4.5 text-[#967868]" />
              </div>
              <h3 className="text-[15px] font-medium mb-3 tracking-[-0.01em]">
                Built for Complexity
              </h3>
              <p className="text-[14px] leading-[1.7] text-[#777] tracking-[-0.01em]">
                Adapts to any transaction type and document structure —
                delivering precise, complete diligence outputs every time.
              </p>
            </div>

            <div className="group">
              <div className="w-10 h-10 rounded-full bg-[#f5f4f0] flex items-center justify-center mb-5 group-hover:bg-[#967868]/10 transition-colors">
                <Zap className="w-4.5 h-4.5 text-[#967868]" />
              </div>
              <h3 className="text-[15px] font-medium mb-3 tracking-[-0.01em]">
                Instant Extraction
              </h3>
              <p className="text-[14px] leading-[1.7] text-[#777] tracking-[-0.01em]">
                Upload documents and instantly generate a complete diligence
                report — identifying key terms, obligations, and risks, with
                every finding fully grounded in the underlying documents.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section
        id="how"
        className="min-h-screen flex items-center py-28 px-6 md:px-12 lg:px-20 bg-[#fbfbf9]"
      >
        <div className="max-w-5xl mx-auto">
          <span className="text-[12px] font-medium tracking-[0.08em] uppercase text-[#967868] block mb-4">
            Process
          </span>
          <h2 className="text-[clamp(2.2rem,5vw,3.8rem)] font-light leading-[1.15] tracking-[-0.02em] mb-20 max-w-lg">
            From documents to{" "}
            <span className="italic font-normal">decisions</span> in three steps
          </h2>

          <div className="grid md:grid-cols-3 gap-x-12 gap-y-16">
            <div>
              <span className="text-[11px] font-medium tracking-[0.06em] uppercase text-[#989898] block mb-4">
                01
              </span>
              <h3 className="text-[15px] font-medium mb-3 tracking-[-0.01em]">
                Upload Documents
              </h3>
              <p className="text-[14px] leading-[1.7] text-[#777] tracking-[-0.01em]">
                Upload financing agreements, M&A documents, or any legal
                materials into the platform — no setup or configuration
                required.
              </p>
            </div>

            <div>
              <span className="text-[11px] font-medium tracking-[0.06em] uppercase text-[#989898] block mb-4">
                02
              </span>
              <h3 className="text-[15px] font-medium mb-3 tracking-[-0.01em]">
                AI Analysis
              </h3>
              <p className="text-[14px] leading-[1.7] text-[#777] tracking-[-0.01em]">
                AI agents analyze your documents — extracting key data,
                identifying risks, and connecting insights across documents with
                legal-grade precision.
              </p>
            </div>

            <div>
              <span className="text-[11px] font-medium tracking-[0.06em] uppercase text-[#989898] block mb-4">
                03
              </span>
              <h3 className="text-[15px] font-medium mb-3 tracking-[-0.01em]">
                Review & Export
              </h3>
              <p className="text-[14px] leading-[1.7] text-[#777] tracking-[-0.01em]">
                Receive a complete, structured report — ready to review,
                annotate, and share across your team.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section
        id="security"
        className="min-h-screen flex items-center py-28 px-6 md:px-12 lg:px-20 bg-white"
      >
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-20 items-start">
            {/* Left column */}
            <div>
              <span className="text-[12px] font-medium tracking-[0.08em] uppercase text-[#967868] block mb-4">
                Security & Compliance
              </span>
              <h2 className="text-[clamp(2.2rem,5vw,3.8rem)] font-light leading-[1.15] tracking-[-0.02em] mb-8">
                Your documents{" "}
                <span className="italic font-normal">stay yours.</span> Full
                stop.
              </h2>
              <p className="text-[15px] leading-[1.7] text-[#555] tracking-[-0.01em] mb-10">
                Legal documents contain highly sensitive information. D-Done AI
                is designed with enterprise-grade security at its core —
                ensuring your data remains private, isolated, and fully
                protected at every stage.
              </p>

              {/* Trust badges */}
              <div className="flex items-center gap-5">
                <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[#f5f4f0] border border-[#e8e6e1]">
                  <Server className="w-3.5 h-3.5 text-[#967868]" />
                  <span className="text-[11px] font-medium tracking-[0.02em] uppercase text-[#555]">
                    Single Tenant
                  </span>
                </div>
                <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[#f5f4f0] border border-[#e8e6e1]">
                  <Database className="w-3.5 h-3.5 text-[#967868]" />
                  <span className="text-[11px] font-medium tracking-[0.02em] uppercase text-[#555]">
                    Data Isolation
                  </span>
                </div>
                <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[#f5f4f0] border border-[#e8e6e1]">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#967868]" />
                  <span className="text-[11px] font-medium tracking-[0.02em] uppercase text-[#555]">
                    Zero Data Sharing
                  </span>
                </div>
              </div>
            </div>

            {/* Right column */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-10">
              <div className="group">
                <div className="w-9 h-9 rounded-full bg-[#f5f4f0] flex items-center justify-center mb-4 group-hover:bg-[#967868]/10 transition-colors">
                  <Lock className="w-4 h-4 text-[#967868]" />
                </div>
                <h3 className="text-[14px] font-medium mb-2 tracking-[-0.01em]">
                  End-to-End Encryption
                </h3>
                <p className="text-[13px] leading-[1.65] text-[#777] tracking-[-0.01em]">
                  All data is encrypted at rest using AES-256 and protected in
                  transit via TLS — handled at the infrastructure level by
                  Google Cloud.
                </p>
              </div>

              <div className="group">
                <div className="w-9 h-9 rounded-full bg-[#f5f4f0] flex items-center justify-center mb-4 group-hover:bg-[#967868]/10 transition-colors">
                  <Eye className="w-4 h-4 text-[#967868]" />
                </div>
                <h3 className="text-[14px] font-medium mb-2 tracking-[-0.01em]">
                  Zero Data Retention
                </h3>
                <p className="text-[13px] leading-[1.65] text-[#777] tracking-[-0.01em]">
                  AI models never train on your data. Documents are processed in
                  memory and not stored beyond your session.
                </p>
              </div>

              <div className="group">
                <div className="w-9 h-9 rounded-full bg-[#f5f4f0] flex items-center justify-center mb-4 group-hover:bg-[#967868]/10 transition-colors">
                  <KeyRound className="w-4 h-4 text-[#967868]" />
                </div>
                <h3 className="text-[14px] font-medium mb-2 tracking-[-0.01em]">
                  Role-Based Access
                </h3>
                <p className="text-[13px] leading-[1.65] text-[#777] tracking-[-0.01em]">
                  Granular permissions ensure team members only access what they
                  need. Full audit trails on every action.
                </p>
              </div>

              <div className="group">
                <div className="w-9 h-9 rounded-full bg-[#f5f4f0] flex items-center justify-center mb-4 group-hover:bg-[#967868]/10 transition-colors">
                  <Server className="w-4 h-4 text-[#967868]" />
                </div>
                <h3 className="text-[14px] font-medium mb-2 tracking-[-0.01em]">
                  Isolated Infrastructure
                </h3>
                <p className="text-[13px] leading-[1.65] text-[#777] tracking-[-0.01em]">
                  Dedicated tenant environments with network isolation. No
                  shared resources between organizations.
                </p>
              </div>

              <div className="group">
                <div className="w-9 h-9 rounded-full bg-[#f5f4f0] flex items-center justify-center mb-4 group-hover:bg-[#967868]/10 transition-colors">
                  <Database className="w-4 h-4 text-[#967868]" />
                </div>
                <h3 className="text-[14px] font-medium mb-2 tracking-[-0.01em]">
                  Data Residency
                </h3>
                <p className="text-[13px] leading-[1.65] text-[#777] tracking-[-0.01em]">
                  Choose where your data is processed and stored. Regional
                  hosting options to meet local regulations.
                </p>
              </div>

              <div className="group">
                <div className="w-9 h-9 rounded-full bg-[#f5f4f0] flex items-center justify-center mb-4 group-hover:bg-[#967868]/10 transition-colors">
                  <ShieldCheck className="w-4 h-4 text-[#967868]" />
                </div>
                <h3 className="text-[14px] font-medium mb-2 tracking-[-0.01em]">
                  Continuous Monitoring
                </h3>
                <p className="text-[13px] leading-[1.65] text-[#777] tracking-[-0.01em]">
                  24/7 threat detection, vulnerability scanning, and incident
                  response protocols to protect your data.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-28 px-6 md:px-12 lg:px-20 bg-[#0a0a0a] text-[#fbfbf9]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-[clamp(2.2rem,5vw,3.8rem)] font-light leading-[1.15] tracking-[-0.02em] mb-6">
            Your next deal{" "}
            <span className="italic font-normal">deserves</span> better
            diligence.
          </h2>
          <p className="text-[15px] leading-[1.7] text-[#999] mb-10 max-w-md mx-auto tracking-[-0.01em]">
            One platform handles what used to take your team days — so you
            review conclusions, not raw documents.
          </p>
          <Link
            href="/book-demo"
            className="inline-flex items-center gap-2 bg-[#fbfbf9] text-[#0a0a0a] px-8 py-3.5 rounded-full text-[13px] font-medium hover:bg-[#e8e8e4] transition-colors tracking-[-0.01em]"
          >
            Book a Demo
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 md:px-12 lg:px-20 bg-[#0a0a0a] border-t border-white/5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Image
              src="/logo-d-done-ai.png"
              alt="D-Done AI"
              width={24}
              height={24}
              className="rounded-sm opacity-60"
            />
            <span className="text-[13px] text-[#666] tracking-[-0.01em]">
              D-DONE AI
            </span>
          </div>
          <a
            href="mailto:contact@d-done.com"
            className="flex items-center gap-2 text-[#666] hover:text-[#999] transition-colors"
          >
            <Mail className="w-3.5 h-3.5" />
            <span className="text-[13px] tracking-[-0.01em]">
              contact@d-done.com
            </span>
          </a>
        </div>
      </footer>
    </div>
  );
}
