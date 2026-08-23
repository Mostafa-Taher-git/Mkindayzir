import { z } from "zod";

export const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const RegisterSchema = z.object({
  email: z.string().email("Invalid email address"),
  displayName: z.string().min(1, "Display name is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const CreateProjectSchema = z.object({
  key: z.string().min(2, "Key must be at least 2 characters").max(10, "Key must be at most 10 characters").regex(/^[A-Z0-9]+$/, "Key must be uppercase letters and numbers only"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  visibility: z.enum(["PRIVATE", "TEAM", "PUBLIC"]).default("TEAM"),
});

export const UpdateProjectSchema = CreateProjectSchema.partial();

export const CreateWorkItemSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional().nullable(),
  type: z.enum(["TASK", "BUG", "FEATURE", "IMPROVEMENT"]).default("TASK"),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
  status: z.string().optional(),
  assigneeId: z.string().optional().nullable(),
  initiativeId: z.string().optional().nullable(),
  iterationId: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  storyPoints: z.coerce.number().int().positive().optional().nullable(),
});

export const UpdateWorkItemSchema = CreateWorkItemSchema.partial();

export const CreateIterationSchema = z.object({
  name: z.string().min(1, "Name is required"),
  goal: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
});

export const CreateInitiativeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  targetDate: z.string().optional().nullable(),
});

export const SetupSchema = z.object({
  mode: z.enum(["personal", "team", "enterprise"]),
  email: z.string().email("Invalid email address"),
  displayName: z.string().min(1, "Display name is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;
export type CreateWorkItemInput = z.infer<typeof CreateWorkItemSchema>;
export type UpdateWorkItemInput = z.infer<typeof UpdateWorkItemSchema>;
export type CreateIterationInput = z.infer<typeof CreateIterationSchema>;
export type CreateInitiativeInput = z.infer<typeof CreateInitiativeSchema>;
export type SetupInput = z.infer<typeof SetupSchema>;
