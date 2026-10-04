"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { USER_COOKIE, userById } from "@/lib/users";

export async function switchUser(formData: FormData) {
  const user = userById(String(formData.get("user") || ""));
  const jar = await cookies();
  jar.set(USER_COOKIE, user.id, { path: "/", sameSite: "lax", httpOnly: true });
  redirect("/");
}
