/** Demo users. A role switch stands in for real sign-in (PRD §8 Security; Build Plan §5). */
export type User = { id: string; name: string; role: "karandeep" | "seller"; title: string };

export const USERS: User[] = [
  { id: "karandeep", name: "Karandeep", role: "karandeep", title: "CEO · reviewer & signer" },
  { id: "bhavin", name: "Bhavin", role: "seller", title: "Founder · seller" },
  { id: "dhaval", name: "Dhaval", role: "seller", title: "Founder · seller" },
  { id: "jay", name: "Jay", role: "seller", title: "Sales executive" },
  { id: "pranav", name: "Pranav", role: "seller", title: "CTO · prepares AtliQ paper" },
];

export const USER_COOKIE = "yl_user";

export function userById(id: string | undefined): User {
  return USERS.find((u) => u.id === id) ?? USERS[0];
}

export function isKarandeep(u: User): boolean {
  return u.role === "karandeep";
}
