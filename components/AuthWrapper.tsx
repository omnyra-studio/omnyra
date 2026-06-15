'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router  = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F0A1F] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0F0A1F] flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="text-4xl mb-4">👻</div>
          <h1 className="text-3xl font-bold text-white mb-3">Welcome to Omnyra</h1>
          <p className="text-purple-300 mb-8">Sign in to start creating Ghost Test videos</p>
          <div className="flex flex-col gap-3">
            <a
              href="/signup"
              className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-fuchsia-600 rounded-2xl text-white font-semibold text-center hover:brightness-110 transition-all"
            >
              Create Account
            </a>
            <a
              href="/login"
              className="w-full py-3.5 border border-purple-700 rounded-2xl text-purple-300 font-medium text-center hover:bg-purple-950 transition-all"
            >
              Sign In
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
