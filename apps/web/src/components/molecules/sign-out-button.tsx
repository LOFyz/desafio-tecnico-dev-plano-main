'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/atoms/ui/button';
import { signOut } from '@/lib/auth/client';

export function SignOutButton() {
  const router = useRouter();

  async function handleClick() {
    try {
      await signOut();
      toast.success('Signed out');
      router.refresh();
    } catch {
      toast.error('Sign out failed');
    }
  }

  return (
    <Button variant="ghost" onClick={handleClick}>
      Sign out
    </Button>
  );
}
