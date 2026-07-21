import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rinat has the best team",
  icons: {
    icon: "/arnon-logo-light.svg",
    apple: "/arnon-logo-light.svg",
    shortcut: "/arnon-logo-light.svg",
  },
};

export default function TeamTasksMetadataLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
