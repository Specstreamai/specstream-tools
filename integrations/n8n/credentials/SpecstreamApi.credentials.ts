import type {
  IAuthenticateGeneric,
  ICredentialTestRequest,
  ICredentialType,
  INodeProperties,
} from "n8n-workflow";

export class SpecstreamApi implements ICredentialType {
  name = "specstreamApi";
  displayName = "SpecStream API";
  icon = { light: "file:specstream.svg", dark: "file:specstream.dark.svg" } as const;
  documentationUrl = "https://specstream.ai/docs/api";
  properties: INodeProperties[] = [
    {
      displayName: "API Key",
      name: "apiKey",
      type: "string",
      typeOptions: { password: true },
      default: "",
      required: true,
      description: "Create a key under Agents & API in your SpecStream workspace",
    },
    {
      displayName: "API Base URL",
      name: "apiBase",
      type: "string",
      default: "https://api.specstream.ai",
    },
  ];
  authenticate: IAuthenticateGeneric = {
    type: "generic",
    properties: {
      headers: {
        Authorization: "=Bearer {{$credentials.apiKey}}",
      },
    },
  };
  test: ICredentialTestRequest = {
    request: {
      baseURL: "={{$credentials.apiBase || 'https://api.specstream.ai'}}",
      url: "/v1/me",
    },
  };
}
