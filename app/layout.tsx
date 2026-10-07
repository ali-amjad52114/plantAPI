export const metadata = {
  title: "PlantAPI — your plant's AI maintenance team",
  description: "A digital maintenance department on Agent37",
};

const FONTS =
  "https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Rubik:wght@400;500;700&family=JetBrains+Mono:wght@400;500;700&display=swap";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ background: "#0B0F14", colorScheme: "dark" }}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONTS} />
        <meta name="theme-color" content="#0B0F14" />
      </head>
      <body
        style={{
          margin: 0,
          background: "#0B0F14",
          color: "#F3EFE7",
          fontFamily: "'Rubik', Arial, sans-serif",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
          textRendering: "optimizeLegibility",
        }}
      >
        {children}
      </body>
    </html>
  );
}
