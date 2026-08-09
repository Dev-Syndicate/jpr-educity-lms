import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/toast";
import "./globals.css";

// globals.css maps --font-sans/--font-mono into the Tailwind theme, so the
// CSS variable names here must match what it expects.
const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    // Each page sets only its own name; the suffix is appended here, so the
    // product name is written once rather than in every page's metadata.
    template: "%s · Jeppiaar Educity Library Management System",
    default: "Jeppiaar Educity Library Management System",
  },
  // The title already says "Library Management System", so repeating it here
  // wastes the one line a link preview gives us. Say what it does instead.
  description:
    "Issue, return and renew books at the counter. Members check their due dates and fines.",
  // Without these, a chat app scrapes whatever it can infer. Setting them
  // makes the shared-link card deliberate.
  openGraph: {
    title: "Jeppiaar Educity Library Management System",
    description:
      "Issue, return and renew books at the counter. Members check their due dates and fines.",
    siteName: "Jeppiaar Educity Library Management System",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* Toaster wraps the tree: Base UI's toast manager is context-based, so
          anything calling toast() must render inside the provider. */}
      <body className="min-h-full flex flex-col">
        <Toaster>{children}</Toaster>
      </body>
    </html>
  );
}
