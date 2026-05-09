'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';

import { mapAiError } from '@/lib/ai/errors';
import {
  isCopilotError,
  type CopilotResponse,
} from '@/lib/ai/route-handler-client';
import { Button } from '@/components/atoms/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/atoms/ui/form';

const formSchema = z.object({
  prompt: z
    .string()
    .min(5, 'Prompt must be at least 5 characters.')
    .max(500, 'Prompt must be 500 characters or fewer.'),
});

type FormValues = z.infer<typeof formSchema>;

export function BlogCopilotForm() {
  const router = useRouter();
  const [noopMessage, setNoopMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { prompt: '' },
  });

  const onSubmit = async (values: FormValues) => {
    setNoopMessage(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/blog-copilot/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: values.prompt }),
      });

      const body = (await res.json()) as CopilotResponse;

      if (res.status === 401) {
        router.push('/sign-in?next=%2Fblog-copilot');
        return;
      }

      if (!res.ok || isCopilotError(body)) {
        toast.error(mapAiError(body));
        return;
      }

      switch (body.action) {
        case 'CREATED':
        case 'UPDATED':
          if (body.post) {
            toast.success(body.message || `Post ${body.action.toLowerCase()}.`);
            router.push(`/blog/${body.post.slug}`);
          }
          break;
        case 'DELETED':
          toast.success(body.message || 'Post deleted.');
          router.push('/blog');
          break;
        case 'NOOP':
          setNoopMessage(body.message);
          break;
      }
    } catch (err) {
      toast.error(mapAiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="prompt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>What should the copilot do?</FormLabel>
              <FormControl>
                <textarea
                  className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder='e.g., "Write a short post about Apollo Federation" or "Delete the post titled My intro"'
                  disabled={submitting}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {noopMessage ? (
          <p className="text-sm text-muted-foreground" role="status">
            {noopMessage}
          </p>
        ) : null}
        <Button type="submit" disabled={submitting || form.formState.isSubmitting}>
          {submitting ? 'Working…' : 'Send'}
        </Button>
      </form>
    </Form>
  );
}
