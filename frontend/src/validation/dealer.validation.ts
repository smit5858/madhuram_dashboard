import { z } from "zod";

const WEBSITE_REGEX = /^(https?:\/\/)?([\w-]+\.)+[a-zA-Z]{2,}(:\d+)?(\/[^\s]*)?$/i;

const nameField = z
  .string()
  .min(1, "Dealer name is required")
  .max(150, "Dealer name must be under 150 characters");

const optionalPhoneField = z.string().max(30, "Phone must be under 30 characters").optional();

const optionalEmailField = z
  .union([z.string().email("Please enter a valid email"), z.literal("")])
  .optional();

const optionalWebsiteField = z
  .union([z.string().regex(WEBSITE_REGEX, "Please enter a valid website URL (e.g. example.com)"), z.literal("")])
  .optional();

const optionalAddressField = z.string().max(500, "Address must be under 500 characters").optional();

export const createDealerSchema = z.object({
  name: nameField,
  phone: optionalPhoneField,
  email: optionalEmailField,
  website: optionalWebsiteField,
  address: optionalAddressField,
});

export type CreateDealerFormValues = z.infer<typeof createDealerSchema>;
