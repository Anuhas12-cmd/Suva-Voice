import { z } from 'zod';
import { normalizePhone } from './util/phone.js';

export const passwordSchema = z.string()
  .min(8, 'Use at least 8 characters')
  .max(72)
  .regex(/[A-Za-z]/, 'Include a letter')
  .regex(/\d/, 'Include a number');

const phoneMessage = 'Enter a 10-digit Sri Lankan number, for example 0771234567';
const phoneSchema = z.string().trim().min(1, phoneMessage).max(20, phoneMessage)
  .transform(normalizePhone)
  .refine((value) => /^0\d{9}$/.test(value), phoneMessage);

const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM');
const daysSchema = z.array(z.number().int().min(1).max(7)).min(1).max(7);
const uuid = z.string().uuid();

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(120),
  email: z.string().trim().email('Enter a valid email address').max(160).transform((value) => value.toLowerCase()),
  phone: phoneSchema,
  password: passwordSchema,
  confirmPassword: z.string()
}).refine((value) => value.password === value.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword']
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(160),
  password: z.string().min(1).max(72)
});

export const otpSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code')
});

export const forgotSchema = z.object({
  identifier: z.string().trim().min(3).max(160)
});

export const resetSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
  confirmPassword: z.string()
}).refine((value) => value.password === value.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword']
});

export const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: phoneSchema.optional(),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(80).optional(),
  preferredLanguage: z.enum(['en', 'si', 'ta']).optional()
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: passwordSchema,
  confirmPassword: z.string()
}).refine((value) => value.newPassword === value.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword']
});

export const staffSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  phone: phoneSchema,
  password: passwordSchema,
  role: z.enum(['admin', 'staff'])
});

export const elderlySchema = z.object({
  customerId: uuid.optional(),
  fullName: z.string().trim().min(2).max(120),
  age: z.number().int().min(40).max(120),
  phone: phoneSchema,
  address: z.string().trim().max(300).optional(),
  preferredLanguage: z.enum(['en', 'si', 'ta']),
  preferredCheckInTime: timeSchema,
  healthNotes: z.string().trim().max(2000).optional(),
  daysOfWeek: daysSchema.optional(),
  retryAttempts: z.number().int().min(1).max(5).optional(),
  retryDelaySeconds: z.number().int().min(0).max(3600).optional()
});

export const elderlyPatchSchema = elderlySchema.partial().omit({ customerId: true }).extend({
  status: z.enum(['all_good', 'assistance_required', 'missed_checkin', 'emergency', 'unknown']).optional()
});

export const contactSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: phoneSchema,
  relationship: z.string().trim().max(80).optional(),
  priority: z.number().int().min(1).max(9).default(1),
  notifyOnAssistance: z.boolean().default(true),
  notifyOnEmergency: z.boolean().default(true),
  notifyOnMissed: z.boolean().default(false)
});

export const contactPatchSchema = contactSchema.partial();

export const scheduleSchema = z.object({
  elderlyId: uuid,
  timeOfDay: timeSchema,
  daysOfWeek: daysSchema,
  enabled: z.boolean().default(true),
  retryAttempts: z.number().int().min(1).max(5).default(2),
  retryDelaySeconds: z.number().int().min(0).max(3600).default(30)
});

export const schedulePatchSchema = scheduleSchema.partial().omit({ elderlyId: true });

export const dtmfSchema = z.object({
  digit: z.string().regex(/^[0-9*#]$/, 'Press a single keypad key'),
  holdMs: z.number().int().min(0).max(10000).optional()
});

export const simulateSchema = z.object({
  outcome: z.enum(['no_answer', 'failed', 'no_response'])
});

export const voiceEventSchema = z.object({
  callId: uuid,
  event: z.enum(['ringing', 'connected', 'playing', 'waiting_dtmf', 'dtmf', 'no_answer', 'failed', 'no_response', 'hangup']),
  digit: z.string().optional(),
  reason: z.string().max(300).optional()
});

export const reminderSchema = z.object({
  elderlyId: uuid,
  type: z.enum(['medication', 'meal', 'rest', 'other']),
  title: z.string().trim().min(2).max(120),
  notes: z.string().trim().max(500).optional(),
  timeOfDay: timeSchema,
  daysOfWeek: daysSchema.default([1, 2, 3, 4, 5, 6, 7]),
  enabled: z.boolean().default(true)
});

export const reminderPatchSchema = reminderSchema.partial().omit({ elderlyId: true });

const orderItem = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0)
});

export const orderSchema = z.object({
  elderlyId: uuid,
  type: z.enum(['grocery', 'essential', 'doctor', 'transport']),
  notes: z.string().trim().max(1000).optional(),
  amount: z.number().min(0).optional(),
  items: z.array(orderItem).optional(),
  doctor: z.object({
    preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    preferredTime: timeSchema.optional(),
    doctorOrHospital: z.string().trim().min(2).max(160),
    notes: z.string().max(1000).optional()
  }).optional(),
  transport: z.object({
    pickupLocation: z.string().trim().min(2).max(200),
    destination: z.string().trim().min(2).max(200),
    travelDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    travelTime: timeSchema.optional(),
    notes: z.string().max(1000).optional()
  }).optional()
}).superRefine((value, ctx) => {
  if (value.type === 'doctor' && !value.doctor?.doctorOrHospital) {
    ctx.addIssue({ code: 'custom', path: ['doctor'], message: 'Add the doctor or hospital' });
  }
  if (value.type === 'transport' && (!value.transport?.pickupLocation || !value.transport?.destination)) {
    ctx.addIssue({ code: 'custom', path: ['transport'], message: 'Add the pickup location and destination' });
  }
});

export const orderPatchSchema = z.object({
  status: z.enum(['requested', 'accepted', 'processing', 'out_for_delivery', 'completed', 'cancelled']).optional(),
  providerId: uuid.nullable().optional(),
  notes: z.string().max(1000).optional(),
  estimatedArrival: z.string().datetime().nullable().optional()
});

export const providerSchema = z.object({
  name: z.string().trim().min(2).max(160),
  contactName: z.string().trim().max(120).optional(),
  phone: phoneSchema.optional(),
  email: z.string().trim().email().optional(),
  serviceType: z.enum(['grocery', 'essential', 'doctor', 'transport', 'general']),
  availability: z.string().trim().max(200).optional(),
  status: z.enum(['active', 'inactive']).default('active')
});

export const providerPatchSchema = providerSchema.partial();

export const alertPatchSchema = z.object({
  status: z.enum(['new', 'reviewing', 'contacted', 'resolved'])
});

export const paymentSchema = z.object({
  orderId: uuid.optional(),
  customerId: uuid.optional(),
  service: z.string().trim().max(160).optional(),
  amount: z.number().min(0).optional(),
  status: z.enum(['successful', 'pending', 'failed']).optional(),
  transactionRef: z.string().trim().max(80).optional()
});

export const planSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers, and dashes'),
  description: z.string().trim().max(500).optional(),
  priceLkr: z.number().min(0),
  billingPeriod: z.enum(['monthly', 'yearly']).default('monthly'),
  services: z.array(z.string().trim().min(1).max(120)).default([]),
  active: z.boolean().default(true)
});

export const planPatchSchema = planSchema.partial().omit({ code: true });

export const subscribeSchema = z.object({ planId: uuid });

export const supportSchema = z.object({
  subject: z.string().trim().min(3).max(160),
  message: z.string().trim().min(5).max(2000)
});

export const supportPatchSchema = z.object({
  status: z.enum(['open', 'in_progress', 'closed']).optional(),
  staffResponse: z.string().trim().max(2000).optional()
});

export const settingsSchema = z.object({
  notifyMissed: z.boolean().optional(),
  notifyCheckins: z.boolean().optional(),
  notifyOrders: z.boolean().optional(),
  notifyPayments: z.boolean().optional(),
  notifyReminders: z.boolean().optional(),
  preferredLanguage: z.enum(['en', 'si', 'ta']).optional()
});

export const systemSettingsSchema = z.object({
  retryAttempts: z.number().int().min(1).max(5).optional(),
  retryDelaySeconds: z.number().int().min(0).max(3600).optional(),
  escalationDelaySeconds: z.number().int().min(0).max(86400).optional(),
  schedulerEnabled: z.boolean().optional()
});

export const appointmentPatchSchema = z.object({
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  preferredTime: timeSchema.optional(),
  doctorOrHospital: z.string().trim().min(2).max(160).optional(),
  notes: z.string().max(1000).optional(),
  status: z.enum(['requested', 'scheduled', 'completed', 'cancelled']).optional(),
  providerId: uuid.nullable().optional()
});

export const transportPatchSchema = z.object({
  pickupLocation: z.string().trim().min(2).max(200).optional(),
  destination: z.string().trim().min(2).max(200).optional(),
  travelDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  travelTime: timeSchema.optional(),
  notes: z.string().max(1000).optional(),
  status: z.enum(['requested', 'assigned', 'in_progress', 'completed', 'cancelled']).optional(),
  providerId: uuid.nullable().optional()
});

export const accountStatusSchema = z.object({
  status: z.enum(['active', 'disabled'])
});
