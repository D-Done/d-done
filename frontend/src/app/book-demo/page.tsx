"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle } from "lucide-react";

export default function BookDemoPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    role: "",
    message: "",
  });
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");

    try {
      const res = await fetch("/api/book-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        setStatus("sent");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <div dir="ltr" className="min-h-screen bg-[#fbfbf9] text-[#0a0a0a]">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 md:px-12 lg:px-20 py-5 bg-[#fbfbf9]/90 backdrop-blur-md sticky top-0 z-50 border-b border-[#0a0a0a]/5">
        <Link href="/" className="flex items-center gap-3">
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
        </Link>

        <Link
          href="/"
          className="flex items-center gap-2 text-[13px] font-medium text-[#0a0a0a] hover:text-[#989898] transition-colors tracking-[-0.01em]"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </Link>
      </nav>

      {/* Content */}
      <div className="flex items-center justify-center min-h-[calc(100vh-73px)] px-6 py-20">
        <div className="w-full max-w-5xl grid md:grid-cols-2 gap-16 md:gap-24 items-center">
          {/* Left — copy */}
          <div>
            <span className="text-[12px] font-medium tracking-[0.08em] uppercase text-[#967868] block mb-4">
              Book a Demo
            </span>
            <h1 className="text-[clamp(2rem,4vw,3.2rem)] font-light leading-[1.1] tracking-[-0.03em] mb-6">
              See how D-Done AI can{" "}
              <span className="italic font-normal">transform</span> your
              diligence workflow
            </h1>
            <p className="text-[15px] leading-[1.7] text-[#555] tracking-[-0.01em] mb-8">
              Schedule a personalized walkthrough with our team. We&apos;ll show
              you how D-Done AI executes end-to-end due diligence — from
              document upload to a complete, source-linked report.
            </p>

            <div className="space-y-4 text-[14px] text-[#555] tracking-[-0.01em]">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#f5f4f0] flex items-center justify-center mt-0.5 shrink-0">
                  <span className="text-[#967868] text-[10px] font-bold">1</span>
                </div>
                <span>Live walkthrough of the platform with your documents</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#f5f4f0] flex items-center justify-center mt-0.5 shrink-0">
                  <span className="text-[#967868] text-[10px] font-bold">2</span>
                </div>
                <span>See real extraction, analysis, and report generation</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#f5f4f0] flex items-center justify-center mt-0.5 shrink-0">
                  <span className="text-[#967868] text-[10px] font-bold">3</span>
                </div>
                <span>Discuss how it fits your firm&apos;s workflow</span>
              </div>
            </div>
          </div>

          {/* Right — form */}
          <div>
            {status === "sent" ? (
              <div className="bg-white rounded-2xl border border-[#e8e6e1] p-10 text-center">
                <CheckCircle className="w-12 h-12 text-[#967868] mx-auto mb-5" />
                <h2 className="text-[22px] font-light tracking-[-0.02em] mb-3">
                  Request received
                </h2>
                <p className="text-[14px] leading-[1.7] text-[#555] tracking-[-0.01em] mb-6">
                  Thank you, {form.name}. We&apos;ll be in touch shortly to
                  schedule your demo.
                </p>
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 bg-[#0a0a0a] text-[#fbfbf9] px-6 py-2.5 rounded-full text-[13px] font-medium hover:bg-[#2a2a2a] transition-colors tracking-[-0.01em]"
                >
                  Back to Home
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="bg-white rounded-2xl border border-[#e8e6e1] p-8 md:p-10 space-y-5"
              >
                <div>
                  <label className="block text-[12px] font-medium tracking-[0.02em] uppercase text-[#555] mb-2">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) =>
                      setForm({ ...form, name: e.target.value })
                    }
                    className="w-full px-4 py-3 rounded-lg border border-[#e8e6e1] bg-[#fbfbf9] text-[14px] tracking-[-0.01em] focus:outline-none focus:border-[#967868] transition-colors"
                    placeholder="Jane Smith"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-medium tracking-[0.02em] uppercase text-[#555] mb-2">
                    Work Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    className="w-full px-4 py-3 rounded-lg border border-[#e8e6e1] bg-[#fbfbf9] text-[14px] tracking-[-0.01em] focus:outline-none focus:border-[#967868] transition-colors"
                    placeholder="jane@firm.com"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[12px] font-medium tracking-[0.02em] uppercase text-[#555] mb-2">
                      Company
                    </label>
                    <input
                      type="text"
                      value={form.company}
                      onChange={(e) =>
                        setForm({ ...form, company: e.target.value })
                      }
                      className="w-full px-4 py-3 rounded-lg border border-[#e8e6e1] bg-[#fbfbf9] text-[14px] tracking-[-0.01em] focus:outline-none focus:border-[#967868] transition-colors"
                      placeholder="Firm name"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium tracking-[0.02em] uppercase text-[#555] mb-2">
                      Role
                    </label>
                    <input
                      type="text"
                      value={form.role}
                      onChange={(e) =>
                        setForm({ ...form, role: e.target.value })
                      }
                      className="w-full px-4 py-3 rounded-lg border border-[#e8e6e1] bg-[#fbfbf9] text-[14px] tracking-[-0.01em] focus:outline-none focus:border-[#967868] transition-colors"
                      placeholder="Partner, Associate..."
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] font-medium tracking-[0.02em] uppercase text-[#555] mb-2">
                    Message
                  </label>
                  <textarea
                    value={form.message}
                    onChange={(e) =>
                      setForm({ ...form, message: e.target.value })
                    }
                    rows={3}
                    className="w-full px-4 py-3 rounded-lg border border-[#e8e6e1] bg-[#fbfbf9] text-[14px] tracking-[-0.01em] focus:outline-none focus:border-[#967868] transition-colors resize-none"
                    placeholder="Tell us about your use case (optional)"
                  />
                </div>

                {status === "error" && (
                  <p className="text-[13px] text-[#777] tracking-[-0.01em]">
                    Something went wrong. Please try again.
                  </p>
                )}

                <button
                  type="submit"
                  disabled={status === "sending"}
                  className="w-full inline-flex items-center justify-center gap-2 bg-[#0a0a0a] text-[#fbfbf9] px-7 py-3.5 rounded-full text-[13px] font-medium hover:bg-[#2a2a2a] transition-colors tracking-[-0.01em] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {status === "sending" ? "Sending..." : "Request a Demo"}
                  {status !== "sending" && (
                    <ArrowRight className="w-3.5 h-3.5" />
                  )}
                </button>

                <p className="text-[12px] text-[#989898] tracking-[-0.01em] text-center">
                  We&apos;ll respond within one business day.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
