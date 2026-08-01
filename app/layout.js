import "./globals.css";

export const metadata = {
  title: "Flight Claim Desk",
  description: "Check if you're owed compensation for a delayed or cancelled flight.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
