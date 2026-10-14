import type {
  IDataObject,
  IExecuteFunctions,
  IHttpRequestMethods,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";
import { NodeConnectionTypes, NodeOperationError } from "n8n-workflow";

import { requireConfirmMaxUsd } from "../../lib/confirm_max_usd.js";

// One row as flat fields: each column's label holds what the list shows, plus the page the
// row's first value was read from and the link to the list.
function flattenRow(listId: string, record: IDataObject): IDataObject {
  const row: IDataObject = {
    id: `${listId}:${String(record.entity_id)}`,
    list_id: listId,
    list_link: `https://specstream.ai/workspace/collections/${listId}`,
    position: record.ordinal as number,
  };
  let source: IDataObject | undefined;
  for (const cell of (record.cells as IDataObject[] | undefined) || []) {
    const label = String(cell.label || cell.column_id || "").trim();
    if (!label) continue;
    row[label] = (cell.display ?? cell.value ?? "") as string;
    const provenance = cell.provenance as IDataObject | null | undefined;
    if (!source && provenance && provenance.source_url) source = provenance;
  }
  row.source_url = (source?.source_url as string) || "";
  row.checked_at = (source?.observed_at as string) || "";
  return row;
}

export class Specstream implements INodeType {
  description: INodeTypeDescription = {
    displayName: "SpecStream",
    name: "specstream",
    icon: { light: "file:specstream.svg", dark: "file:specstream.dark.svg" },
    group: ["transform"],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: "Ask for a list in plain words and get every match from the live web, each with its source. Priced before it runs.",
    defaults: { name: "SpecStream" },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: "specstreamApi", required: true }],
    properties: [
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        options: [
          { name: "Approve Quoted Work", value: "confirmAndRun", action: "Approve quoted work" },
          { name: "Find a List", value: "findList", action: "Find a list", description: "Ask for a list in plain words and start it if the price is within your maximum" },
          { name: "Get List Results", value: "getListRows", action: "Get the rows of a list", description: "One item per matching row, each with the page it was read from" },
          { name: "Read Request", value: "compile", action: "Read a request" },
          { name: "Review Quote", value: "quoteWork", action: "Review a quote" },
        ],
        default: "findList",
      },
      {
        displayName: "What to Find",
        name: "request",
        type: "string",
        typeOptions: { rows: 3 },
        default: "",
        required: true,
        placeholder: "Roofing companies in Columbus, Ohio with their website and phone",
        description: "Describe the list in plain words, with what every row must meet and the details to bring back",
        displayOptions: { show: { operation: ["findList"] } },
      },
      {
        displayName: "Number of Results",
        name: "count",
        type: "number",
        typeOptions: { minValue: 1 },
        default: 25,
        required: true,
        description: "How many matching rows to find. You pay only for rows that match.",
        displayOptions: { show: { operation: ["findList"] } },
      },
      {
        displayName: "Maximum Price (USD)",
        name: "max_price_usd",
        type: "number",
        typeOptions: { minValue: 0, numberPrecision: 2 },
        default: 0,
        required: true,
        description: "The most this list may cost. If the price comes back higher, nothing runs and the node stops with the price.",
        displayOptions: { show: { operation: ["findList"] } },
      },
      {
        displayName: "List ID",
        name: "list_id",
        type: "string",
        default: "",
        required: true,
        placeholder: "fnd_...",
        description: "The List ID returned by Find a List",
        displayOptions: { show: { operation: ["getListRows"] } },
      },
      {
        displayName: "Request",
        name: "q",
        type: "string",
        typeOptions: { rows: 3 },
        default: "",
        required: true,
        description: "What you need, in your own words",
        displayOptions: { show: { operation: ["compile"] } },
      },
      {
        displayName: "Locale",
        name: "locale",
        type: "string",
        default: "en-US",
        displayOptions: { show: { operation: ["compile"] } },
      },
      {
        displayName: "Confirm Max USD",
        name: "confirm_max_usd",
        type: "number",
        default: 0,
        required: true,
        description: "The most you approve for this run, in dollars. It is never filled in for you, and zero is refused.",
        displayOptions: { show: { operation: ["confirmAndRun"] } },
      },
      {
        displayName: "Request Hash",
        name: "ast_hash",
        type: "string",
        default: "",
        required: true,
        displayOptions: { show: { operation: ["quoteWork"] } },
      },
      {
        displayName: "Requested Amount",
        name: "requested_units",
        type: "number",
        default: 25,
        required: true,
        displayOptions: { show: { operation: ["quoteWork"] } },
      },
      {
        displayName: "Work Operation",
        name: "work_operation",
        type: "options",
        options: [
          { name: "Add Details", value: "add_facts" },
          { name: "Find", value: "find" },
          { name: "More Results", value: "extend" },
          { name: "Recheck", value: "refresh" },
        ],
        default: "find",
        required: true,
        displayOptions: { show: { operation: ["quoteWork"] } },
      },
      {
        displayName: "Earlier Run ID",
        name: "parent_find_id",
        type: "string",
        default: "",
        description: "For more results, added details or a recheck: the run to build on",
        displayOptions: { show: { operation: ["quoteWork"] } },
      },
      {
        displayName: "Project ID",
        name: "project_id",
        type: "string",
        default: "",
        displayOptions: { show: { operation: ["quoteWork"] } },
      },
      {
        displayName: "Reviewed Quote ID",
        name: "quote_id",
        type: "string",
        default: "",
        required: true,
        displayOptions: { show: { operation: ["confirmAndRun"] } },
      },
      {
        displayName: "Signed Quote Hash",
        name: "quote_hash",
        type: "string",
        default: "",
        required: true,
        displayOptions: { show: { operation: ["confirmAndRun"] } },
      },
      {
        displayName: "Stable Execution Key",
        name: "idempotency_key",
        type: "string",
        default: "",
        required: true,
        description: "Reuse the same key when you retry, so the work is never bought twice",
        displayOptions: { show: { operation: ["confirmAndRun"] } },
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const out: INodeExecutionData[] = [];
    const credentials = await this.getCredentials("specstreamApi");
    const base = String(credentials.apiBase || "https://api.specstream.ai").replace(/\/$/, "");

    for (let i = 0; i < items.length; i++) {
      const operation = this.getNodeParameter("operation", i) as string;
      const fail = (message: string) => new NodeOperationError(this.getNode(), message, { itemIndex: i });
      const call = async (method: IHttpRequestMethods, path: string, body?: IDataObject): Promise<IDataObject> => {
        let response: IDataObject | undefined;
        try {
          response = (await this.helpers.httpRequestWithAuthentication.call(this, "specstreamApi", {
            method,
            url: `${base}${path}`,
            headers: { Accept: "application/json" },
            body,
            json: true,
            disableFollowRedirect: true,
          })) as IDataObject | undefined;
        } catch (error) {
          throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
        }
        const data = response?.data as IDataObject | undefined;
        if (!response || response.error != null || !data || typeof data !== "object" || Array.isArray(data)) {
          throw fail("SpecStream returned a response this node could not read");
        }
        return data;
      };

      if (operation === "findList") {
        const q = String(this.getNodeParameter("request", i) || "").trim();
        const count = Math.floor(Number(this.getNodeParameter("count", i)));
        const maxCents = Math.round(Number(this.getNodeParameter("max_price_usd", i)) * 100);
        if (!q) throw fail("Describe the list to find");
        if (!Number.isSafeInteger(count) || count < 1) throw fail("Number of Results must be 1 or more");
        if (!Number.isSafeInteger(maxCents) || maxCents <= 0) throw fail("Set a Maximum Price above 0");
        const reading = await call("POST", "/v1/parse", { q, locale: "en-US" });
        if (reading.status !== "runnable") {
          throw fail(
            `SpecStream needs a clearer request before it can price it. It read: "${String(reading.canonical_sentence || q)}". Add the place or what every row must meet.`,
          );
        }
        const quote = await call("POST", "/v1/capacity/quotes", {
          ast_hash: reading.ast_hash as string,
          operation: "find",
          requested_units: count,
        });
        const priceCents = Number(quote.maximum_cents);
        if (!(priceCents <= maxCents)) {
          throw fail(
            `This list can cost up to $${(priceCents / 100).toFixed(2)}, above your maximum of $${(maxCents / 100).toFixed(2)}. Raise the maximum or ask for fewer results.`,
          );
        }
        const run = await call("POST", "/v1/capacity/executions", {
          quote_id: quote.quote_id as string,
          quote_hash: quote.quote_hash as string,
          confirm_max_cents: priceCents,
          idempotency_key: `n8n-${this.getExecutionId()}-${i}-${Date.now()}`,
        });
        const listId = String(run.find_id);
        out.push({
          json: {
            list_id: listId,
            status: run.status || "running",
            request: reading.canonical_sentence || q,
            number_of_results: count,
            maximum_price_usd: priceCents / 100,
            list_link: `https://specstream.ai/workspace/collections/${listId}`,
          },
          pairedItem: { item: i },
        });
        continue;
      }

      if (operation === "getListRows") {
        const listId = String(this.getNodeParameter("list_id", i) || "").trim();
        const page = await call("GET", `/v1/finds/${encodeURIComponent(listId)}/rows`);
        const rows = (page.rows as IDataObject[] | undefined) || [];
        for (const record of rows) {
          out.push({ json: { ...flattenRow(String(page.find_id), record), list_status: page.status as string }, pairedItem: { item: i } });
        }
        continue;
      }
      let path = "";
      let method: IHttpRequestMethods = "GET";
      let body: IDataObject | undefined;

      if (operation === "compile") {
        method = "POST";
        path = "/v1/parse";
        body = {
          q: this.getNodeParameter("q", i) as string,
          locale: (this.getNodeParameter("locale", i) as string) || "en-US",
        };
      } else if (operation === "quoteWork") {
        method = "POST";
        path = "/v1/capacity/quotes";
        body = {
          ast_hash: this.getNodeParameter("ast_hash", i) as string,
          operation: this.getNodeParameter("work_operation", i) as string,
          requested_units: this.getNodeParameter("requested_units", i) as number,
        };
        for (const name of ["parent_find_id", "project_id"]) {
          const value = this.getNodeParameter(name, i) as string;
          if (value) body[name] = value;
        }
      } else if (operation === "confirmAndRun") {
        let amount: number;
        try {
          amount = requireConfirmMaxUsd({ confirm_max_usd: this.getNodeParameter("confirm_max_usd", i) });
        } catch (error) {
          throw fail((error as Error).message);
        }
        const cents = Math.round(amount * 100);
        if (!Number.isSafeInteger(cents) || Math.abs(amount * 100 - cents) > 1e-7) {
          throw fail("Approve the exact maximum with at most two decimal places");
        }
        const quote_id = String(this.getNodeParameter("quote_id", i));
        const quote_hash = String(this.getNodeParameter("quote_hash", i));
        const idempotency_key = String(this.getNodeParameter("idempotency_key", i));
        if (
          !/^cqt_[a-z0-9_]+$/.test(quote_id) ||
          !/^[a-f0-9]{64}$/.test(quote_hash) ||
          idempotency_key.length < 8 ||
          idempotency_key.length > 128
        ) {
          throw fail("A reviewed quote and a stable execution key are required");
        }
        method = "POST";
        path = "/v1/capacity/executions";
        body = { quote_id, quote_hash, confirm_max_cents: cents, idempotency_key };
      } else {
        throw fail(`Unknown operation ${operation}`);
      }

      const data = await call(method, path, body);
      out.push({ json: data, pairedItem: { item: i } });
    }
    return [out];
  }
}
