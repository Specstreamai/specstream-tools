import type { Auth } from "convex/server";

/**
 * Every function in this example resolves a caller before it does anything.
 * Components can't see `ctx.auth`, so the app is the only place authorization
 * can happen, and these endpoints spend money.
 *
 * A real app would use Convex Auth, Clerk, WorkOS, or similar. This example has
 * no auth provider wired up, so `DEMO_ALLOW_ANONYMOUS` exists purely to keep the
 * `npx convex run` walkthrough usable on a local deployment. It defaults to off
 * and must never be set on anything reachable from the internet.
 */
export async function requireUser(ctx: { auth: Auth }): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity) return identity.subject;

  if (process.env.DEMO_ALLOW_ANONYMOUS === "true") return "demo-user";

  throw new Error(
    "Not signed in. This example requires an authenticated caller. " +
      "For the local CLI walkthrough only: npx convex env set DEMO_ALLOW_ANONYMOUS true",
  );
}
