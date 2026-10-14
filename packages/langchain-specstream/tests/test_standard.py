"""LangChain's own standard tests for tools, run against both SpecStream tools."""

from langchain_tests.unit_tests import ToolsUnitTests

from langchain_specstream import SpecStreamFindList, SpecStreamGetListResults

KEY = "ss_live_test_key"


class TestFindListStandard(ToolsUnitTests):
    @property
    def tool_constructor(self):
        return SpecStreamFindList

    @property
    def tool_constructor_params(self):
        return {"api_key": KEY, "max_price_usd": 5}

    @property
    def tool_invoke_params_example(self):
        return {"request": "Dental clinics in Lisbon with online booking", "max_results": 25}

    @property
    def init_from_env_params(self):
        return {"SPECSTREAM_API_KEY": KEY}, {"max_price_usd": 5}, {"api_key": KEY}


class TestGetListResultsStandard(ToolsUnitTests):
    @property
    def tool_constructor(self):
        return SpecStreamGetListResults

    @property
    def tool_constructor_params(self):
        return {"api_key": KEY}

    @property
    def tool_invoke_params_example(self):
        return {"list_id": "fnd_gk5y3d0r97bvyz0t08zzh75kr6"}

    @property
    def init_from_env_params(self):
        return {"SPECSTREAM_API_KEY": KEY}, {}, {"api_key": KEY}
