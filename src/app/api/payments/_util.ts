import { NextResponse } from "next/server";
import { appUrl } from "@/server/payments/types";

export const redirectTo = (path: string, status = 303) => NextResponse.redirect(appUrl(path), status);
export const billing = (status: string) => redirectTo(`/app/billing?status=${status}`);
