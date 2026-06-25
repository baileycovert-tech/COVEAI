"use client";
import { ThemeProvider as NextThemes } from "next-themes";

// Dark by default (Bailey stares at this all day), with a light option.
// Class strategy drives the .dark token set in globals.css.
export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
