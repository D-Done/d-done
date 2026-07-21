import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rinat has the best team",
  icons: {
    icon: "/arnon-logo.png",
    apple: "/arnon-logo.png",
    shortcut: "/arnon-logo.png",
  },
};

export default function TeamTasksMetadataLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
