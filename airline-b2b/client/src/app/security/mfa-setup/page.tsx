"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RetiredMfaSetupPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/settings');
  }, [router]);

  return <main className="min-h-dvh bg-[#030710]" />;
}
