'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';

const testimonials = [
  {
    quote: "Omnyra turned my rough script into a cinematic trailer in 14 minutes. The emotion detection is actually scary good. Saved me weeks of work.",
    name: "Sarah Jensen",
    role: "Indie Director • 2.4M followers",
    avatar: "https://randomuser.me/api/portraits/women/44.jpg",
    initials: "SJ",
    gradient: "from-purple-400 to-fuchsia-500",
    rating: 5,
  },
  {
    quote: "Campaign Mode is a game changer. Generated 8 consistent scenes with the same character across different locations. My audience thought it was shot with real actors.",
    name: "Marcus Rivera",
    role: "YouTube Filmmaker • 890K subs",
    avatar: "https://randomuser.me/api/portraits/men/32.jpg",
    initials: "MR",
    gradient: "from-rose-400 to-purple-500",
    rating: 5,
  },
  {
    quote: "The micro-expressions in the characters are insane. I went from heartbroken scene to full victory arc in one flow. This is the future of storytelling.",
    name: "Aisha Laurent",
    role: "Short Film Creator • Cannes 2025",
    avatar: "https://randomuser.me/api/portraits/women/65.jpg",
    initials: "AL",
    gradient: "from-emerald-400 to-cyan-500",
    rating: 5,
  },
  {
    quote: "I've never seen AI understand emotional timing like this. The final stitched video felt like it came from a professional editor.",
    name: "Liam Chen",
    role: "Content Creator & Editor",
    avatar: "https://randomuser.me/api/portraits/men/78.jpg",
    initials: "LC",
    gradient: "from-amber-400 to-orange-500",
    rating: 5,
  },
];

export default function TestimonialsCarousel() {
  const [current, setCurrent] = useState(0);

  const next = () => setCurrent((prev) => (prev + 1) % testimonials.length);
  const prev = () => setCurrent((prev) => (prev - 1 + testimonials.length) % testimonials.length);

  useEffect(() => {
    const interval = setInterval(next, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="py-24 bg-[#0F0A1F] border-t border-purple-900/50 relative overflow-hidden">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-purple-950 text-purple-400 text-sm px-4 py-2 rounded-full mb-4">
            ❤️ Loved by Creators
          </div>
          <h2 className="text-5xl font-bold tracking-tight mb-4">
            Real creators. Real results.
          </h2>
          <p className="text-xl text-purple-300 max-w-2xl mx-auto">
            Don&apos;t just take our word for it.
          </p>
        </div>

        <div className="relative">
          <div className="overflow-hidden rounded-3xl">
            <div
              className="flex transition-transform duration-700 ease-out"
              style={{ transform: `translateX(-${current * 100}%)` }}
            >
              {testimonials.map((t, idx) => (
                <div key={idx} className="min-w-full bg-purple-950/40 border border-purple-900/50 p-10 md:p-16">
                  <div className="max-w-2xl mx-auto text-center">
                    <div className="flex justify-center gap-1 mb-8">
                      {Array.from({ length: t.rating }).map((_, i) => (
                        <Star key={i} className="w-7 h-7 text-amber-400 fill-amber-400" />
                      ))}
                    </div>
                    <p className="text-2xl md:text-3xl leading-tight text-purple-100 font-light italic mb-12">
                      &ldquo;{t.quote}&rdquo;
                    </p>
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-purple-700">
                        <img
                          src={t.avatar}
                          alt={t.name}
                          className="w-full h-full object-cover"
                          onError={e => {
                            const el = e.currentTarget as HTMLImageElement;
                            el.style.display = 'none';
                            const parent = el.parentElement!;
                            parent.className = `w-20 h-20 rounded-2xl bg-gradient-to-br ${t.gradient} flex items-center justify-center text-white font-bold text-2xl`;
                            parent.textContent = t.initials;
                          }}
                        />
                      </div>
                      <div>
                        <div className="font-semibold text-white text-xl">{t.name}</div>
                        <div className="text-purple-400">{t.role}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={prev}
            className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-4 rounded-full transition-all backdrop-blur-md border border-purple-900/50"
            aria-label="Previous testimonial"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          <button
            onClick={next}
            className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-4 rounded-full transition-all backdrop-blur-md border border-purple-900/50"
            aria-label="Next testimonial"
          >
            <ChevronRight className="w-6 h-6" />
          </button>

          <div className="flex justify-center gap-3 mt-10">
            {testimonials.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrent(idx)}
                className={`w-3 h-3 rounded-full transition-all ${
                  idx === current ? 'bg-purple-400 scale-125' : 'bg-purple-800 hover:bg-purple-700'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="mt-20 flex flex-wrap justify-center items-center gap-x-12 gap-y-8 opacity-75 text-center">
          <div className="text-2xl font-bold text-purple-400">✓ 12k+ creators</div>
          <div className="text-2xl font-bold text-purple-400">4.98/5 Rating</div>
          <div className="text-2xl font-bold text-purple-400">Featured in IndieWire</div>
        </div>
      </div>
    </section>
  );
}
