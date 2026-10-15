// A stand-in for api.specstream.ai, so you can watch a list arrive without
// spending anything. It implements the calls the component makes: read a
// request, price it, approve the exact quote, check the list, read its rows.
//
//   SPECSTREAM_WEBHOOK_SECRET=whsec-mock node example/mock-specstream.mjs
//
// Set MOCK_PORT to change the port (default 4343). Every list takes about ten
// seconds and fills in one row a second. With a webhook registered through
// POST /v1/account/webhooks, the mock delivers a signed `find.completed`.
import { createHash, createHmac, randomUUID } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 4343);
const SECRET = process.env.SPECSTREAM_WEBHOOK_SECRET ?? "whsec-mock";
const SECONDS_PER_ROW = 1;
const UNIT_CENTS = 15;

const quotes = new Map();
const runs = new Map(); // idempotency key -> find id
const finds = new Map();
const hooks = new Map();

const NAMES = [
  "Houston Food Bank",
  "Central Texas Food Bank",
  "North Texas Food Bank",
  "San Antonio Food Bank",
  "Food Bank of the Rio Grande Valley",
  "Southeast Texas Food Bank",
  "West Texas Food Bank",
  "Brazos Valley Food Bank",
  "Food Bank of Corpus Christi",
  "Texas Panhandle Food Bank",
];

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
const ok = (res, data) => json(res, 200, { data });
const fail = (res, status, code, message) =>
  json(res, status, { error: { code, message } });

function row(find, index) {
  const name =
    NAMES[index % NAMES.length] +
    (index >= NAMES.length ? ` ${Math.floor(index / NAMES.length) + 1}` : "");
  const slug = name.toLowerCase().replace(/[^a-z]+/g, "-");
  const seen = new Date(
    find.startedAt + (index + 1) * SECONDS_PER_ROW * 1000,
  ).toISOString();
  return {
    entity_id: `ent_${index + 1}`,
    ordinal: index + 1,
    cells: [
      {
        column_id: "name",
        label: "Name",
        value: name,
        display: name,
        provenance: {
          source_url: `https://${slug}.example.org/`,
          observed_at: seen,
        },
      },
      {
        column_id: "revenue",
        label: "Annual revenue",
        value: 1_000_000 + index * 250_000,
        display: `$${(1 + index * 0.25).toFixed(2)}M`,
        provenance: {
          source_url: `https://${slug}.example.org/annual-report`,
          observed_at: seen,
        },
      },
    ],
  };
}

function progress(find) {
  if (find.canceled) return { status: "canceled", accepted: find.canceledAt };
  const elapsed = Math.floor(
    (Date.now() - find.startedAt) / (SECONDS_PER_ROW * 1000),
  );
  const accepted = Math.min(elapsed, find.total);
  return { status: accepted >= find.total ? "completed" : "running", accepted };
}

async function deliverWebhooks(find) {
  if (find.delivered) return;
  find.delivered = true;
  for (const url of hooks.values()) {
    const body = JSON.stringify({
      id: `dlv_${randomUUID()}`,
      event: "find.completed",
      find_id: find.id,
      records: [],
    });
    const t = String(Math.floor(Date.now() / 1000));
    const v1 = createHmac("sha256", SECRET)
      .update(`${t}.${body}`)
      .digest("hex");
    try {
      await fetch(url, {
        method: "POST",
        body,
        headers: {
          "Content-Type": "application/json",
          "Specstream-Signature": `t=${t},v1=${v1}`,
        },
      });
      console.log(`webhook delivered to ${url}`);
    } catch (error) {
      console.log(`webhook to ${url} failed: ${error.message}`);
    }
  }
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString();
  return text ? JSON.parse(text) : {};
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const route = `${req.method} ${url.pathname}`;
  console.log(route);
  if (!/^Bearer .+/.test(req.headers.authorization ?? "")) {
    return fail(res, 401, "unauthorized", "Missing API key.");
  }
  try {
    if (route === "POST /v1/parse") {
      const { q } = await readBody(req);
      const stated = /\b(\d{1,4})\b/.exec(q ?? "");
      const sentence = (q ?? "").trim().replace(/^./, (c) => c.toUpperCase());
      return ok(res, {
        status: sentence.length > 8 ? "runnable" : "needs_edit",
        ast_hash: createHash("sha256")
          .update(q ?? "")
          .digest("hex"),
        canonical_sentence: sentence,
        ast: {
          limit: { max: stated ? Number(stated[1]) : 25, inferred: !stated },
        },
      });
    }
    if (route === "POST /v1/capacity/quotes") {
      const body = await readBody(req);
      const units = Number(body.requested_units ?? 25);
      const id = `qte_${randomUUID().slice(0, 8)}`;
      const quote = {
        quote_id: id,
        quote_hash: createHash("sha256").update(id).digest("hex"),
        currency: "USD",
        maximum_cents: units * UNIT_CENTS,
        expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        can_authorize: true,
        terms: { unit_cents: UNIT_CENTS },
        units,
      };
      quotes.set(id, quote);
      return ok(res, quote);
    }
    if (route === "POST /v1/capacity/executions") {
      const body = await readBody(req);
      const quote = quotes.get(body.quote_id);
      if (!quote || quote.quote_hash !== body.quote_hash)
        return fail(res, 409, "unquoted_plan", "Unknown quote.");
      if (body.confirm_max_cents !== quote.maximum_cents)
        return fail(
          res,
          409,
          "capacity",
          "The approved maximum does not match the quote.",
        );
      const replay = runs.has(body.idempotency_key);
      if (!replay) {
        const id = `fnd_${randomUUID().slice(0, 8)}`;
        finds.set(id, {
          id,
          total: Math.min(quote.units, 60),
          startedAt: Date.now(),
          quote,
        });
        runs.set(body.idempotency_key, id);
      }
      return ok(res, {
        reservation_id: `res_${quote.quote_id}`,
        find_id: runs.get(body.idempotency_key),
        maximum_cents: quote.maximum_cents,
        state: "reserved",
        replay,
      });
    }
    const found = /^\/v1\/finds\/([^/]+)(\/rows|\/cancel)?$/.exec(url.pathname);
    if (found) {
      const find = finds.get(found[1]);
      if (!find) return fail(res, 404, "not_found", "No such list.");
      if (found[2] === "/cancel" && req.method === "POST") {
        find.canceled = true;
        find.canceledAt = progress(find).accepted;
        return ok(res, { find_id: find.id, status: "canceled" });
      }
      const state = progress(find);
      if (state.status !== "running") void deliverWebhooks(find);
      if (found[2] === "/rows") {
        const limit = Math.min(
          Number(url.searchParams.get("limit") ?? 100),
          100,
        );
        const start = Number(url.searchParams.get("cursor") ?? 0);
        const end = Math.min(start + limit, state.accepted);
        const rows = [];
        for (let i = start; i < end; i += 1) rows.push(row(find, i));
        return ok(res, {
          find_id: find.id,
          status: state.status,
          accepted_count: state.accepted,
          rows,
          next_cursor: end < state.accepted ? String(end) : null,
        });
      }
      return ok(res, {
        find_id: find.id,
        status: state.status,
        requested_count: find.total,
        accepted_count: state.accepted,
      });
    }
    if (route === "GET /v1/me")
      return ok(res, { email: "demo@example.org", guest: false });
    if (route === "GET /v1/capacity/balance")
      return ok(res, { available_cents: 5000 });
    if (route === "POST /v1/account/webhooks") {
      const { url: target } = await readBody(req);
      const hookId = `hook_${randomUUID().slice(0, 8)}`;
      hooks.set(hookId, target);
      return ok(res, {
        hook_id: hookId,
        event_name: "find.completed",
        events: ["find.completed"],
        secret: SECRET,
      });
    }
    return fail(res, 404, "not_found", `No route ${route}`);
  } catch (error) {
    return fail(res, 500, "internal_failure", error.message);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(
    `Mock SpecStream on http://127.0.0.1:${PORT} (webhook secret ${SECRET})`,
  );
});
