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

export class Specstream implements INodeType {
  description: INodeTypeDescription = {
    displayName: "SpecStream",
    name: "specstream",
    icon: { light: "file:specstream.svg", dark: "file:specstream.dark.svg" },
    group: ["transform"],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: "Ask for a list in plain words, see the price, approve it, and get every match with its sources.",
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
          { name: "Get Results", value: "getMatchingRows", action: "Get results" },
          { name: "Get Status", value: "getStatus", action: "Get run status" },
          { name: "Read Request", value: "compile", action: "Read a request" },
          { name: "Register Webhook", value: "registerWebhook", action: "Register a run completed webhook" },
          { name: "Review Quote", value: "quoteWork", action: "Review a quote" },
        ],
        default: "compile",
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
        displayName: "Run ID",
        name: "find_id",
        type: "string",
        default: "",
        required: true,
        displayOptions: { show: { operation: ["getStatus", "getMatchingRows"] } },
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
      {
        displayName: "Callback URL",
        name: "url",
        type: "string",
        default: "",
        required: true,
        displayOptions: { show: { operation: ["registerWebhook"] } },
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
      } else if (operation === "getStatus") {
        const findId = String(this.getNodeParameter("find_id", i) || "").trim();
        path = `/v1/finds/${encodeURIComponent(findId)}`;
      } else if (operation === "getMatchingRows") {
        const findId = String(this.getNodeParameter("find_id", i) || "").trim();
        path = `/v1/finds/${encodeURIComponent(findId)}/rows`;
      } else if (operation === "registerWebhook") {
        method = "POST";
        path = "/v1/account/webhooks";
        body = { url: this.getNodeParameter("url", i) as string, event_name: "find.completed" };
      } else {
        throw fail(`Unknown operation ${operation}`);
      }

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
      out.push({ json: data, pairedItem: { item: i } });
    }
    return [out];
  }
}
