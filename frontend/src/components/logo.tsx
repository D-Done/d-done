import Image from "next/image";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <Image
        src="/logo.png"
        alt="D-Done logo"
        width={44}
        height={44}
        className="h-full w-full object-contain drop-shadow-sm"
        aria-label="D-Done logo"
        priority
      />
    </span>
  );
}
