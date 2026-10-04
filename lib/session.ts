import { cookies } from "next/headers";
import { USER_COOKIE, userById, type User } from "./users";

export async function currentUser(): Promise<User> {
  const jar = await cookies();
  return userById(jar.get(USER_COOKIE)?.value);
}
