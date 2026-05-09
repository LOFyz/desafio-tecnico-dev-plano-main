'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { authClient } from '@/lib/auth/client';
import { mapAuthError } from '@/lib/auth/errors';
import { safeNextPath } from '@/lib/auth/safe-next';
import { signInSchema, type SignInValues } from '@/lib/auth/schemas';
import { Button } from '@/components/atoms/ui/button';
import { Input } from '@/components/atoms/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/atoms/ui/form';

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: SignInValues) => {
    const { error } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
    });
    if (error) {
      form.setError('root', { message: mapAuthError(error) });
      return;
    }
    router.push(safeNextPath(searchParams.get('next')));
    router.refresh();
  };

  const rootError = form.formState.errors.root?.message;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="current-password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {rootError ? (
          <p className="text-sm font-medium text-destructive" role="alert">
            {rootError}
          </p>
        ) : null}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </Form>
  );
}
