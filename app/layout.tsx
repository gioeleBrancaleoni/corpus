import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Corpus",
  description: "Local, privacy-first RAG over your own files. Nothing leaves your machine.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
