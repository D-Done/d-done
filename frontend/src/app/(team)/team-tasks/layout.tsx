import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ארנון תדמור-לוי",
  icons: {
    icon: "/arnon-vertical.png",
    apple: "/arnon-vertical.png",
    shortcut: "/arnon-vertical.png",
  },
};

export default function TeamTasksMetadataLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
