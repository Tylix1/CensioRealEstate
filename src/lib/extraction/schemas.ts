/**
 * Structured-output schema for reading one uploaded PDF (spec §6.1). Claude classifies the document and fills only the
 * section of its type; the other sections stay null. Every extracted value is cited with its 1-based page and the
 * verbatim quote it was read from, because the Citations API cannot be combined with structured outputs.
 * Values are normalised (English labels and names); quotes stay in the document's language.
 */
import { z } from "zod";
import type { Confidence } from "@/lib/deal/types";

/** A value with the 1-based page and the verbatim quote it was read from, and how sure the model is of it. */
export const cited = <T extends z.ZodType>(v: T) =>
  z.object({ value: v, page: z.number().int(), quote: z.string(), confidence: z.enum(["high", "medium", "low"]) });

/** The parsed shape of a `cited(...)` field. */
export interface Cited<T> {
  value: T;
  page: number;
  quote: string;
  confidence: Confidence;
}

export const ExtractionResultSchema = z.object({
  documentType: z.enum([
    "tenant_list",
    "land_register",
    "condo_land_register",
    "energy_certificate",
    "refurbishment_sheet",
    "zoning_plan",
    "unknown",
  ]),
  summary: z.string().describe('One English line, e.g. "Land register · plot 480 m² · 1 easement in section II"'),
  tenantList: z
    .object({
      units: z.array(
        z.object({
          label: cited(z.string().describe('English unit label, e.g. "GF left", "1F right", "Attic"')),
          floor: cited(z.enum(["GF", "1F", "2F", "3F", "4F", "attic"])),
          areaM2: cited(z.number()),
          rooms: cited(z.number()),
          rentPerMonth: cited(z.number().describe("Net cold rent (Nettokaltmiete) in euro per month")).nullable(),
          leaseSinceYear: cited(z.number().int()).nullable(),
          features: z.array(z.enum(["balcony", "roof_terrace", "renovated_bath", "street", "courtyard"])),
          vacant: z.boolean(),
        }),
      ),
      totalAreaM2: cited(z.number()),
      totalRentPerMonth: cited(z.number()),
      address: cited(z.string()),
    })
    .nullable(),
  landRegister: z
    .object({
      kind: z.enum(["Grundbuch", "Wohnungsgrundbuch"]),
      parcel: cited(z.string().describe('e.g. "Gemarkung Leipzig, Flur 12, Flurstück 123/4"')),
      plotM2: cited(z.number()),
      address: cited(z.string()),
      easements: z.array(
        z.object({
          text: cited(z.string().describe("The Abteilung II entry, verbatim")),
          translationEn: z.string(),
        }),
      ),
      landChargesCount: z.number().int().describe("Number of Abteilung III entries (financing, never easements)"),
    })
    .nullable(),
  energyCertificate: z
    .object({
      address: cited(z.string()),
      builtYear: cited(z.number().int()),
      heatingYear: cited(z.number().int()),
      energyCarrier: cited(z.string().describe('English, e.g. "Gas"')),
      energyClass: cited(z.string()),
      demandKwh: cited(z.number()),
      livingAreaM2: cited(z.number()),
    })
    .nullable(),
  refurbishmentSheet: z
    .object({
      measures: z.array(
        z.object({
          name: cited(z.string().describe('English, e.g. "Roof incl. insulation"')),
          year: cited(z.number().int()),
          category: z.enum(["roof", "windows", "pipes", "heating", "exterior_walls", "bathrooms", "interior", "floor_plan"]),
          extent: z.enum(["full", "partial"]),
        }),
      ),
    })
    .nullable(),
  zoningPlan: z
    .object({
      areaType: cited(z.string().describe('English with the plan\'s abbreviation, e.g. "General residential area (WA)"')),
      residentialAllowed: cited(z.boolean()),
    })
    .nullable(),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
