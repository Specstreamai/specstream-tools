import type {
  IDataObject,
  IHookFunctions,
  INodeType,
  INodeTypeDescription,
  IWebhookFunctions,
  IWebhookResponseData,
  JsonObject,
} from "n8n-workflow";
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from "n8n-workflow";
import { createHmac, timingSafeEqual } from "node:crypto";

type Method = "GET" | "POST" | "DELETE";

async function request(context: IHookFunctions, method: Method, path: string, body?: IDataObject): Promise<IDataObject> {
  const credentials = await context.getCredentials("specstreamApi");
  const base = String(credentials.apiBase || "https://api.specstream.ai").replace(/\/$/, "");
  const response = (await context.helpers.httpRequestWithAuthentication.call(context, "specstreamApi", {
    method,
    url: base + path,
    headers: { Accept: "application/json" },
    body,
    json: true,
    disableFollowRedirect: true,
  })) as IDataObject | undefined;
  if (!response || response.error || !response.data) {
    throw new NodeApiError(context.getNode(), (response ?? {}) as JsonObject, {
      message: "SpecStream returned a response this node could not read",
    });
  }
  return response.data as IDataObject;
}

export class SpecstreamTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: "SpecStream Trigger",
    name: "specstreamTrigger",
    icon: { light: "file:specstream.svg", dark: "file:specstream.dark.svg" },
    group: ["trigger"],
    version: 1,
    subtitle: '={{$parameter["event"]}}',
    description: "Starts a workflow when a run finishes, a monitor finds something, or records are added to a collection",
    defaults: { name: "SpecStream Trigger" },
    inputs: [],
    outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: "specstreamApi", required: true }],
    webhooks: [
      { name: "default", httpMethod: "POST", responseMode: "onReceived", path: "specstream", isFullPath: false },
    ],
    properties: [
      {
        displayName: "Event",
        name: "event",
        type: "options",
        default: "find.completed",
        options: [
          { name: "Monitor Found New or Changed Records", value: "monitor.found" },
          { name: "Records Added to Collection", value: "collection.records_added" },
          { name: "Run Completed", value: "find.completed" },
        ],
      },
    ],
  };

  webhookMethods = {
    default: {
      async checkExists(this: IHookFunctions): Promise<boolean> {
        const saved = this.getWorkflowStaticData("node");
        if (!saved.hook_id) return false;
        const result = await request(this, "GET", "/v1/account/webhooks");
        const hooks = (result.webhooks as IDataObject[] | undefined) ?? [];
        return hooks.some((hook) => hook.hook_id === saved.hook_id && !hook.revoked_at);
      },
      async create(this: IHookFunctions): Promise<boolean> {
        const result = await request(this, "POST", "/v1/account/webhooks", {
          url: this.getNodeWebhookUrl("default") as string,
          events: [this.getNodeParameter("event") as string],
        });
        if (!result.hook_id || !result.secret) {
          throw new NodeOperationError(this.getNode(), "Webhook registration was not confirmed");
        }
        Object.assign(this.getWorkflowStaticData("node"), result);
        return true;
      },
      async delete(this: IHookFunctions): Promise<boolean> {
        const saved = this.getWorkflowStaticData("node");
        if (saved.hook_id) {
          await request(this, "DELETE", "/v1/account/webhooks/" + encodeURIComponent(String(saved.hook_id)));
        }
        delete saved.hook_id;
        delete saved.secret;
        return true;
      },
    },
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const saved = this.getWorkflowStaticData("node");
    const headers = this.getHeaderData();
    const signature = /^t=(\d+),v1=([a-f0-9]{64})$/.exec(String(headers["specstream-signature"] || ""));
    const raw = (this.getRequestObject() as unknown as { rawBody?: Buffer | string }).rawBody;
    if (
      !signature ||
      !saved.secret ||
      (!Buffer.isBuffer(raw) && typeof raw !== "string") ||
      Math.abs(Date.now() / 1000 - Number(signature[1])) > 300
    ) {
      throw new NodeOperationError(this.getNode(), "Unverifiable SpecStream webhook; enable raw request bodies");
    }
    const expected = createHmac("sha256", String(saved.secret)).update(signature[1] + ".").update(raw).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature[2], "hex"))) {
      throw new NodeOperationError(this.getNode(), "Invalid SpecStream signature");
    }
    const body = JSON.parse(raw.toString()) as IDataObject;
    if (body.event !== this.getNodeParameter("event") || !body.id) {
      throw new NodeOperationError(this.getNode(), "Unexpected SpecStream event");
    }
    return { workflowData: [[{ json: body }]] };
  }
}
