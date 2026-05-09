'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@apollo/client/react';
import { toast } from 'sonner';

import { RUN_POST_AGENT_MUTATION } from '@/lib/ai/operations/run-post-agent.mutation';
import { mapAiError } from '@/lib/ai/errors';
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

  const [runPostAgent, { loading }] = useMutation(RUN_POST_AGENT_MUTATION);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { prompt: '' },
  });

  const onSubmit = async (values: FormValues) => {
    setNoopMessage(null);
    try {
      const { data } = await runPostAgent({
        variables: { input: { prompt: values.prompt } },
      });
      const result = data?.runPostAgent;
      if (!result) {
        toast.error('No response from copilot.');
        return;
      }
      switch (result.action) {
        case 'CREATED':
        case 'UPDATED':
          if (result.post) {
            toast.success(result.message || `Post ${result.action.toLowerCase()}.`);
            router.push(`/blog/${result.post.slug}`);
          }
          break;
        case 'DELETED':
          toast.success(result.message || 'Post deleted.');
          router.push('/blog');
          break;
        case 'NOOP':
          setNoopMessage(result.message);
          break;
      }
    } catch (err) {
      toast.error(mapAiError(err));
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
                  disabled={loading}
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
        <Button type="submit" disabled={loading || form.formState.isSubmitting}>
          {loading ? 'Working…' : 'Send'}
        </Button>
      </form>
    </Form>
  );
}
