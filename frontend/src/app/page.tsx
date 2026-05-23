"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
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

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: i * 0.1 },
  }),
};

const fadeIn = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
  },
};

export default function LandingPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();
  const navBg = useTransform(scrollY, [0, 60], ["rgba(251,251,249,0)", "rgba(251,251,249,0.95)"]);
  const navBorder = useTransform(scrollY, [0, 60], ["rgba(10,10,10,0)", "rgba(10,10,10,0.07)"]);

  useEffect(() => {
    const unsubscribe = scrollY.on("change", (v) => setScrolled(v > 20));
    return unsubscribe;
  }, [scrollY]);

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
      <motion.nav
        style={{ backgroundColor: navBg, borderColor: navBorder }}
        className="flex items-center justify-between px-6 md:px-12 lg:px-20 py-5 backdrop-blur-md sticky top-0 z-50 border-b"
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-3"
        >
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
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex items-center gap-10"
        >
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
        </motion.div>
      </motion.nav>

      {/* Hero Section */}
      <section className="relative w-full min-h-[92vh] overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/background.jpeg')" }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-[#fbfbf9] via-[#fbfbf9]/75 to-[#fbfbf9]/20" />
        </div>

        <div className="relative z-10 flex flex-col justify-center h-full min-h-[92vh] max-w-2xl px-6 md:px-12 lg:px-20">
          <motion.span
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={0}
            className="text-[13px] font-medium tracking-[0.08em] uppercase text-[#967868] mb-6"
          >
            AI-Powered Legal Intelligence
          </motion.span>

          <motion.h1
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={1}
            className="text-[clamp(3rem,6vw,5rem)] font-light leading-[1.05] tracking-[-0.03em] mb-8"
          >
            <span className="whitespace-nowrap">Complete Due Diligence</span>
            <br />
            <span className="italic font-normal whitespace-nowrap">
              for Every Transaction
            </span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={2}
            className="text-[15px] leading-[1.7] max-w-md text-[#555] mb-10 tracking-[-0.01em]"
          >
            We read the documents, surface every risk, and deliver a complete
            report — so your team can focus on strategy and decision making.
          </motion.p>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={3}
            className="flex items-center gap-4"
          >
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
          </motion.div>
        </div>
      </section>

      {/* About / Features Section */}
      <section
        id="about"
        className="min-h-screen flex items-center py-28 px-6 md:px-12 lg:px-20 bg-white"
      >
        <div className="max-w-5xl mx-auto">
          <motion.span
            variants={fadeIn}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            className="text-[12px] font-medium tracking-[0.08em] uppercase text-[#967868] block mb-4"
          >
            Capabilities
          </motion.span>
          <motion.h2
            variants={fadeIn}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            className="text-[clamp(2.2rem,5vw,3.8rem)] font-light leading-[1.15] tracking-[-0.02em] mb-20 max-w-lg"
          >
            <span className="whitespace-nowrap">No document goes</span>{" "}
            <span className="italic font-normal">unread.</span>
            <br />
            <span className="whitespace-nowrap">No risk goes unnoticed.</span>
          </motion.h2>

          <div className="grid md:grid-cols-3 gap-x-12 gap-y-16">
            {[
              {
                icon: <Shield className="w-4.5 h-4.5 text-[#967868]" />,
                title: "Audit-Ready Reports",
                desc: "Generate complete, structured diligence reports from complex legal documents in minutes — ready for review, sharing, and decision-making.",
              },
              {
                icon: <FileText className="w-4.5 h-4.5 text-[#967868]" />,
                title: "Built for Complexity",
                desc: "Adapts to any transaction type and document structure — delivering precise, complete diligence outputs every time.",
              },
              {
                icon: <Zap className="w-4.5 h-4.5 text-[#967868]" />,
                title: "Instant Extraction",
                desc: "Upload documents and instantly generate a complete diligence report — identifying key terms, obligations, and risks, with every finding fully grounded in the underlying documents.",
              },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-60px" }}
                custom={i}
                className="group"
              >
                <div className="w-10 h-10 rounded-full bg-[#f5f4f0] flex items-center justify-center mb-5 group-hover:bg-[#967868]/10 transition-colors">
                  {item.icon}
                </div>
                <h3 className="text-[15px] font-medium mb-3 tracking-[-0.01em]">
                  {item.title}
                </h3>
                <p className="text-[14px] leading-[1.7] text-[#777] tracking-[-0.01em]">
                  {item.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section
        id="how"
        className="min-h-screen flex items-center py-28 px-6 md:px-12 lg:px-20 bg-[#fbfbf9]"
      >
        <div className="max-w-5xl mx-auto">
          <motion.span
            variants={fadeIn}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            className="text-[12px] font-medium tracking-[0.08em] uppercase text-[#967868] block mb-4"
          >
            Process
          </motion.span>
          <motion.h2
            variants={fadeIn}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            className="text-[clamp(2.2rem,5vw,3.8rem)] font-light leading-[1.15] tracking-[-0.02em] mb-20 max-w-lg"
          >
            From documents to{" "}
            <span className="italic font-normal">decisions</span> in three steps
          </motion.h2>

          <div className="grid md:grid-cols-3 gap-x-12 gap-y-16">
            {[
              {
                step: "01",
                title: "Upload Documents",
                desc: "Upload financing agreements, M&A documents, or any legal materials into the platform — no setup or configuration required.",
              },
              {
                step: "02",
                title: "AI Analysis",
                desc: "AI agents analyze your documents — extracting key data, identifying risks, and connecting insights across documents with legal-grade precision.",
              },
              {
                step: "03",
                title: "Review & Export",
                desc: "Receive a complete, structured report — ready to review, annotate, and share across your team.",
              },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-60px" }}
                custom={i}
              >
                <span className="text-[11px] font-medium tracking-[0.06em] uppercase text-[#989898] block mb-4">
                  {item.step}
                </span>
                <h3 className="text-[15px] font-medium mb-3 tracking-[-0.01em]">
                  {item.title}
                </h3>
                <p className="text-[14px] leading-[1.7] text-[#777] tracking-[-0.01em]">
                  {item.desc}
                </p>
              </motion.div>
            ))}
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
            <div>
              <motion.span
                variants={fadeIn}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-80px" }}
                className="text-[12px] font-medium tracking-[0.08em] uppercase text-[#967868] block mb-4"
              >
                Security & Compliance
              </motion.span>
              <motion.h2
                variants={fadeIn}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-80px" }}
                className="text-[clamp(2.2rem,5vw,3.8rem)] font-light leading-[1.15] tracking-[-0.02em] mb-8"
              >
                Your documents{" "}
                <span className="italic font-normal">stay yours.</span> Full
                stop.
              </motion.h2>
              <motion.p
                variants={fadeIn}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-80px" }}
                className="text-[15px] leading-[1.7] text-[#555] tracking-[-0.01em] mb-10"
              >
                Legal documents contain highly sensitive information. D-Done AI
                is designed with enterprise-grade security at its core —
                ensuring your data remains private, isolated, and fully
                protected at every stage.
              </motion.p>

              <motion.div
                variants={fadeIn}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-80px" }}
                className="flex items-center gap-5"
              >
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
              </motion.div>
            </div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-10">
              {[
                {
                  icon: <Lock className="w-4 h-4 text-[#967868]" />,
                  title: "End-to-End Encryption",
                  desc: "All data is encrypted at rest using AES-256 and protected in transit via TLS — handled at the infrastructure level by Google Cloud.",
                },
                {
                  icon: <Eye className="w-4 h-4 text-[#967868]" />,
                  title: "Zero Data Retention",
                  desc: "AI models never train on your data. Documents are processed in memory and not stored beyond your session.",
                },
                {
                  icon: <KeyRound className="w-4 h-4 text-[#967868]" />,
                  title: "Role-Based Access",
                  desc: "Granular permissions ensure team members only access what they need. Full audit trails on every action.",
                },
                {
                  icon: <Server className="w-4 h-4 text-[#967868]" />,
                  title: "Isolated Infrastructure",
                  desc: "Dedicated tenant environments with network isolation. No shared resources between organizations.",
                },
                {
                  icon: <Database className="w-4 h-4 text-[#967868]" />,
                  title: "Data Residency",
                  desc: "Choose where your data is processed and stored. Regional hosting options to meet local regulations.",
                },
                {
                  icon: <ShieldCheck className="w-4 h-4 text-[#967868]" />,
                  title: "Continuous Monitoring",
                  desc: "24/7 threat detection, vulnerability scanning, and incident response protocols to protect your data.",
                },
              ].map((item, i) => (
                <motion.div
                  key={item.title}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: "-40px" }}
                  custom={i * 0.5}
                  className="group"
                >
                  <div className="w-9 h-9 rounded-full bg-[#f5f4f0] flex items-center justify-center mb-4 group-hover:bg-[#967868]/10 transition-colors">
                    {item.icon}
                  </div>
                  <h3 className="text-[14px] font-medium mb-2 tracking-[-0.01em]">
                    {item.title}
                  </h3>
                  <p className="text-[13px] leading-[1.65] text-[#777] tracking-[-0.01em]">
                    {item.desc}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-28 px-6 md:px-12 lg:px-20 bg-[#0a0a0a] text-[#fbfbf9]">
        <div className="max-w-3xl mx-auto text-center">
          <motion.h2
            variants={fadeIn}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            className="text-[clamp(2.2rem,5vw,3.8rem)] font-light leading-[1.15] tracking-[-0.02em] mb-6"
          >
            Your next deal{" "}
            <span className="italic font-normal">deserves</span> better
            diligence.
          </motion.h2>
          <motion.p
            variants={fadeIn}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            className="text-[15px] leading-[1.7] text-[#999] mb-10 max-w-md mx-auto tracking-[-0.01em]"
          >
            One platform handles what used to take your team days — so you
            review conclusions, not raw documents.
          </motion.p>
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            custom={2}
          >
            <Link
              href="/book-demo"
              className="inline-flex items-center gap-2 bg-[#fbfbf9] text-[#0a0a0a] px-8 py-3.5 rounded-full text-[13px] font-medium hover:bg-[#e8e8e4] transition-colors tracking-[-0.01em]"
            >
              Book a Demo
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </motion.div>
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
