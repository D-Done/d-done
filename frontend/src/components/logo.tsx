import Image from "next/image";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={className} style={{ display: "inline-block" }}>
      <Image
        src="/logo.png"
        alt="D-Done logo"
        width={48}
        height={48}
        className="h-full w-full object-contain"
        aria-label="D-Done logo"
        priority
      />
    </span>
  );
}
