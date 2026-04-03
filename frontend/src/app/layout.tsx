import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@descope/nextjs-sdk";
import "./globals.css";

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["latin", "hebrew"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "D-Done | בדיקת נאותות חכמה",
  description: "פלטפורמת בדיקת נאותות מבוססת AI לעורכי דין בתחום הנדל\"ן",
};

const descopeCookieSecure = process.env.NODE_ENV === "production";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body className={`${rubik.variable} font-sans antialiased`}>
        <AuthProvider
          projectId={process.env.NEXT_PUBLIC_DESCOPE_PROJECT_ID!}
          sessionTokenViaCookie={{ secure: descopeCookieSecure }}
          refreshTokenViaCookie={{ secure: descopeCookieSecure }}
        >
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
            {children}
            <Toaster position="top-center" dir="rtl" />
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
