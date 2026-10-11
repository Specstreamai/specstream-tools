# Examples

Each example reads a request and brings back the price before anything runs. Every one reads `SPECSTREAM_API_KEY` from the environment.

| Folder | What it shows |
| --- | --- |
| [`python-sdk`](python-sdk) | Read, price, approve, run and print results with `specstream-client` |
| [`typescript-sdk`](typescript-sdk) | The same with `@specstream/sdk` |
| [`openai-agents-sdk`](openai-agents-sdk) | An agent over MCP that quotes and stops for your approval |
| [`langchain-mcp`](langchain-mcp) | The same with LangChain and `langchain-mcp-adapters` |
