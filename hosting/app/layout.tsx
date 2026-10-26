import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Doorlist Mobile",
  description: "Connect your Doorlist account to view your events and invites.",
  icons: {
    icon: "/mobile/icon-192.png",
    shortcut: "/mobile/icon-192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
