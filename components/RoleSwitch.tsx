"use client";
import { switchUser } from "@/app/actions";
import { USERS } from "@/lib/users";

export function RoleSwitch({ current }: { current: string }) {
  return (
    <form action={switchUser} className="flex items-center gap-2">
      <label htmlFor="user" className="label hidden !text-white/70 sm:inline">Viewing as</label>
      <select
        id="user"
        name="user"
        defaultValue={current}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="!bg-white/10 !text-white !border-white/20 text-sm"
      >
        {USERS.map((u) => (
          <option key={u.id} value={u.id} className="text-black">
            {u.name} ({u.role === "karandeep" ? "Karandeep, CEO" : u.title})
          </option>
        ))}
      </select>
    </form>
  );
}
