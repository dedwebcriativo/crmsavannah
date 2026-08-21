'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import Footer from './Footer';
import NotificacoesBell from './NotificacoesBell';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('savannah_token');
    if (!token) {
      router.replace('/login');
    } else {
      setPronto(true);
    }
  }, [router]);

  if (!pronto) return null;

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 min-h-screen flex flex-col">
        <div className="flex justify-end items-center px-8 py-3 border-b border-savanna-border bg-white">
          <NotificacoesBell />
        </div>
        <div className="flex-1 p-8">{children}</div>
        <Footer />
      </main>
    </div>
  );
}
