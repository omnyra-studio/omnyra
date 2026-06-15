'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LogOut, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';

export default function Navbar() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  return (
    <nav className="border-b border-purple-900 bg-[#0F0A1F]/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold tracking-tighter text-white">
          OMNYRA
        </Link>

        <div className="flex items-center gap-6">
          <Link href="/create" className="text-purple-300 hover:text-white transition-colors text-sm font-medium">
            Create
          </Link>
          <Link href="/dashboard" className="text-purple-300 hover:text-white transition-colors text-sm font-medium">
            Dashboard
          </Link>

          {user ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-3 bg-purple-950 border border-purple-800 rounded-2xl px-3 py-2">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-fuchsia-500 rounded-full flex items-center justify-center text-xs font-semibold text-white">
                  {user.email ? user.email[0].toUpperCase() : <User className="w-4 h-4" />}
                </div>
                <div className="text-sm hidden sm:block">
                  <div className="text-white font-medium">{user.email?.split('@')[0]}</div>
                  <div className="text-xs text-purple-400">Pro</div>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-2.5 hover:bg-purple-950 rounded-xl transition-colors text-purple-400 hover:text-red-400"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link
              href="/signup"
              className="px-5 py-2.5 bg-purple-700 hover:bg-purple-600 rounded-full text-sm font-semibold text-white transition-colors"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
