import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "PokeDexAlert",
  description: "Pokémon 30th Anniversary stock monitor",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
