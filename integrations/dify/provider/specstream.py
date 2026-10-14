from typing import Any

import requests
from dify_plugin import ToolProvider
from dify_plugin.errors.tool import ToolProviderCredentialValidationError

from tools.client import SpecStreamClient


class SpecStreamProvider(ToolProvider):
    def _validate_credentials(self, credentials: dict[str, Any]) -> None:
        api_key = str(credentials.get("specstream_api_key") or "").strip()
        if not api_key:
            raise ToolProviderCredentialValidationError("Enter your SpecStream API key.")
        try:
            SpecStreamClient(api_key).get("/v1/me")
        except requests.HTTPError as error:
            status = error.response.status_code if error.response is not None else None
            if status in (401, 403):
                raise ToolProviderCredentialValidationError("Invalid SpecStream API key.") from error
            raise ToolProviderCredentialValidationError(
                "Could not verify the API key with SpecStream. Try again in a moment."
            ) from error
        except requests.RequestException as error:
            raise ToolProviderCredentialValidationError(
                "Could not reach SpecStream. Try again in a moment."
            ) from error
