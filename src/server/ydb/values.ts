import { Optional } from "@ydbjs/value/optional";
import { Bool, BoolType, Datetime, DatetimeType, Int32, Int32Type, JsonDocument, JsonDocumentType, Text, TextType } from "@ydbjs/value/primitive";

/**
 * Typed parameter helpers. The SDK maps plain JS values (string→Text, integer→Int32, boolean→Bool,
 * Date→Datetime) but rejects null, so nullable columns must be bound as typed Optionals.
 * Text and Utf8 are the same YQL type.
 */
export const optText = (v: string | null | undefined) => new Optional(v == null ? null : new Text(v), new TextType());
export const optInt = (v: number | null | undefined) => new Optional(v == null ? null : new Int32(v), new Int32Type());
export const optBool = (v: boolean | null | undefined) => new Optional(v == null ? null : new Bool(v), new BoolType());
export const optDate = (v: Date | null | undefined) => new Optional(v == null ? null : new Datetime(v), new DatetimeType());
export const optJson = (v: unknown) => new Optional(v == null ? null : new JsonDocument(JSON.stringify(v)), new JsonDocumentType());
export const json = (v: unknown) => new JsonDocument(JSON.stringify(v ?? null));

/** Datetime has second precision: round so values read back equal what was written. */
export const nowSec = () => new Date(Math.floor(Date.now() / 1000) * 1000);
/** COUNT(*) and other Uint64 results arrive as bigint. */
export const num = (v: unknown) => (typeof v === "bigint" ? Number(v) : Number(v ?? 0));
