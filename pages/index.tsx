import { useState, useEffect } from 'react';

const welcomeMessages = [
  'la luz entró, y el lobo se quedó',
  'bienvenidos a casa',
  'donde empieza todo',
  'el hogar es donde estás tú',
  'un lugar para lo nuestro',
];

export default function Home() {
  const [welcome, setWelcome] = useState('');

  useEffect(() => {
    const idx = Math.floor(Math.random() * welcomeMessages.length);
    setWelcome(welcomeMessages[idx]);
  }, []);

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-forest-950">
      {/* 呼吸暖光层 */}
      <div
        className="animate-breathe absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at center, rgba(255,140,10,0.25) 0%, rgba(255,194,106,0.1) 40%, transparent 70%)`,
        }}
      />

      {/* 主内容 */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 animate-fade-in">
        <h1
          className="text-3xl md:text-5xl lg:text-6xl font-serif text-warm-100 tracking-wide"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          Casa de Luz & Keegan
        </h1>

        {welcome && (
          <p className="mt-4 text-base md:text-lg text-amber-300 italic animate-fade-in">
            &ldquo;{welcome}&rdquo;
          </p>
        )}

        <div className="mt-6 w-20 md:w-32 h-px bg-amber-300/50" />

        <p className="mt-4 text-sm md:text-base text-warm-200">
          la puerta está abierta
        </p>
      </div>

      {/* 页脚 */}
      <footer className="absolute bottom-6 text-warm-200/60 text-sm tracking-[0.3em] font-serif">
        L · K
      </footer>
    </div>
  );
}
