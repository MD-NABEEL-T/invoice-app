-- Migration 009: Make despatched_through optional
-- Drop NOT NULL constraint on despatched_through column in invoices table
-- Default to empty string '' if omitted

ALTER TABLE public.invoices ALTER COLUMN despatched_through DROP NOT NULL;
ALTER TABLE public.invoices ALTER COLUMN despatched_through SET DEFAULT '';

