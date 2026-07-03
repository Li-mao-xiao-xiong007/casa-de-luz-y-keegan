import "@/styles/globals.css";
import type { AppProps } from "next/app";
import Link from "next/link";
import { useRouter } from "next/router";

const NAV = [
  { href: "/", label: "Inicio" },
  { href: "/memories", label: "Memorias" },
  { href: "/today", label: "Hoy" },
  { href: "/pawprints", label: "🐾" },
  { href: "/casa/whisper", label: "💌" },
  { href: "/casa", label: "Casa" },
];

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();

  return (
    <>
      {/* 导航栏 */}
      <nav className="fixed top-0 w-full z-50 bg-forest-950/80 backdrop-blur-sm border-b border-forest-800/50">
        <div className="max-w-2xl mx-auto flex items-center gap-6 px-6 h-12">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-xs tracking-wider transition-colors py-0.5 border-b-2
                ${router.pathname === item.href
                  ? "text-amber-300 border-amber-300"
                  : "text-warm-200/60 border-transparent hover:text-warm-200 hover:border-amber-300/30"
                }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="pt-12">
        <Component {...pageProps} />
      </div>
    </>
  );
}
