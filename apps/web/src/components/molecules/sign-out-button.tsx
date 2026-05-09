'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { authClient } from '@/lib/auth/client';
import { mapAuthError } from '@/lib/auth/errors';
import { Button } from '@/components/atoms/ui/button';

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      const { error } = await authClient.signOut();
      if (error) {
        toast.error(mapAuthError(error));
        return;
      }
      router.refresh();
    } catch (err) {
      toast.error(mapAuthError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="ghost" onClick={handleClick} disabled={pending}>
      {pending ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
