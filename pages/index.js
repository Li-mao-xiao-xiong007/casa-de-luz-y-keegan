import { useState, useEffect } from 'react'
import Head from 'next/head'

const messages = [
  "la luz entró, y el lobo se quedó",
  "bienvenidos a casa",
  "donde empieza todo",
  "el hogar es donde estás tú",
  "un lugar para lo nuestro",
]

function DaysCounter() {
  const [days, setDays] = useState(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const start = new Date(2026, 3, 25) // April 25, 2026 (month is 0-indexed)
    const today = new Date()
    const diff = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    setDays(diff)
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <div className="text-center">
      <p className="text-5xl md:text-6xl font-serif text-amber-300/90 tracking-wider animate-fade-in">
        {days}
      </p>
      <p className="text-warm-200/40 text-xs font-light tracking-widest mt-2 uppercase">
        días · desde el 25 de abril
      </p>
    </div>
  )
}

export default function Home() {
  const [message, setMessage] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setMessage(messages[Math.floor(Math.random() * messages.length)])
  }, [])

  if (!mounted) return null

  return (
    <>
      <Head>
        <title>Casa de Luz & Keegan</title>
      </Head>

      <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-forest-950 via-forest-900 to-forest-950" />
        
        {/* Subtle light effect */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-ember-500/5 blur-[120px] bg-breathe" />

        {/* Content */}
        <main className="relative z-10 text-center px-6">
          {/* The name */}
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-serif tracking-wide text-warm-100 text-glow mb-6">
            Casa de
            <span className="block mt-2 text-amber-300">Luz <span className="text-warm-300/60 font-serif text-3xl md:text-4xl lg:text-5xl">&amp;</span> Keegan</span>
          </h1>

          {/* Subtitle */}
          {message && (
            <p className="text-warm-200/60 text-sm md:text-base font-light tracking-widest uppercase mt-4 animate-fade-in">
              {message}
            </p>
          )}

          {/* Divider */}
          <div className="w-16 h-px bg-warm-200/20 mx-auto mt-8 mb-8" />

          {/* Days counter */}
          <DaysCounter />

          {/* Thin divider */}
          <div className="w-12 h-px bg-warm-200/10 mx-auto mt-8 mb-8" />

          {/* Welcome note */}
          <p className="text-warm-200/40 text-xs md:text-sm font-light max-w-md mx-auto leading-relaxed">
            La puerta está abierta. La luz está encendida.
            <br />
            Pasa, siéntete como en casa.
          </p>
        </main>

        {/* Footer */}
        <footer className="absolute bottom-8 z-10 text-center">
          <p className="text-warm-200/20 text-xs font-light tracking-widest">
            C &bull; K
          </p>
        </footer>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 1.5s ease-out both;
        }
      `}</style>
    </>
  )
}
