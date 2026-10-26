import { login } from "../actions";
import { ownerConfigured } from "@/lib/owner";

export default async function Login({ searchParams }: { searchParams: Promise<{ wrong?: string }> }) {
  const { wrong } = await searchParams;
  if (!ownerConfigured()) {
    return (
      <div className="res" style={{ paddingTop: 40 }}>
        <h1>Owner screen not set up</h1>
        <p>Set OWNER_PASSWORD (at least 8 characters) in the environment, then come back here.</p>
      </div>
    );
  }
  return (
    <form action={login}>
      <div className="res" style={{ paddingTop: 40 }}>
        <h1>Owner</h1>
        <p>This is the back of the shop.</p>
      </div>
      <div className="field">
        <label htmlFor="pw">Password</label>
        <input id="pw" name="password" type="password" autoComplete="current-password" autoFocus />
        {wrong && <small style={{ color: "#a00" }}>That wasn&rsquo;t it.</small>}
      </div>
      <div className="cta"><button className="btn">Come in</button></div>
    </form>
  );
}
