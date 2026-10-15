import { createAction } from '@activepieces/pieces-framework';
import { createCustomApiCallAction } from '@activepieces/pieces-common';
import { specstreamAuth } from '../auth';
import { BASE_URL, specstreamApi } from '../common/client';

const baseAction = createCustomApiCallAction({
  auth: specstreamAuth,
  baseUrl: () => BASE_URL,
  authMapping: async (auth, propsValue) => {
    const url = propsValue['url']?.['url'];
    if (typeof url !== 'string' || !specstreamApi.isAllowedUrl(url)) {
      throw new Error(`Custom API calls go to ${BASE_URL} only (a path like /v1/me, or a full https URL on that host), so your API key is never sent anywhere else or without encryption.`);
    }
    if (propsValue['followRedirects'] === true) {
      throw new Error('Follow redirects is not supported for SpecStream: a redirect could carry your API key to another host.');
    }
    return { Authorization: `Bearer ${auth.secret_text}` };
  },
});

export const specstreamCustomApiCallAction = createAction({
  auth: specstreamAuth,
  name: 'custom_api_call',
  displayName: 'Custom API Call',
  description: 'Make a custom API call to a specific endpoint',
  props: baseAction.props,
  requireAuth: baseAction.requireAuth,
  errorHandlingOptions: baseAction.errorHandlingOptions,
  audience: 'human',
  aiMetadata: {
    description:
      'Sends an authenticated request to any SpecStream API path on https://api.specstream.ai (see https://specstream.ai/docs/api), for endpoints the other SpecStream actions do not cover. Returns the HTTP status, headers and body. Not idempotent in general: POST /v1/capacity/executions spends money.',
    idempotent: false,
  },
  run: async (context) =>
    baseAction.run({
      ...context,
      propsValue: { ...context.propsValue, followRedirects: context.propsValue.followRedirects ?? false },
    }),
});
