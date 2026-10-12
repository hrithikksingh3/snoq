import { z } from 'zod';

export const createListSchema = z.object({
  name: z.string().trim().min(1, 'Give the list a name').max(80),
  description: z.string().trim().max(300).optional().nullable(),
  color: z.enum(['blue', 'violet', 'emerald', 'amber', 'rose']).default('blue'),
});

export const updateListSchema = createListSchema.partial();
