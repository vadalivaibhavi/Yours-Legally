/** Demo users. A role switch stands in for real sign-in (PRD §8 Security; Build Plan §5). */
export type User = { id: string; name: string; role: "karandeep" | "seller"; title: string };

export const USERS: User[] = [
  { id: "karandeep", name: "Karandeep", role: "karandeep", title: "CEO · reviewer & signer" },
  // One shared seller view: Bhavin, Dhaval and Jay all see the same thing (no per-seller split).
  { id: "seller", name: "Seller", role: "seller", title: "Sales team" },
];

export const USER_COOKIE = "yl_user";

export function userById(id: string | undefined): User {
  return USERS.find((u) => u.id === id) ?? USERS[0];
}

export function isKarandeep(u: User): boolean {
  return u.role === "karandeep";
}
