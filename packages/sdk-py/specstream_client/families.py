"""Lock result families from finder.cross-source.v1 OpenAPI EntityType."""

from __future__ import annotations

FAMILIES: tuple[str, ...] = (
    "local_business",
    "creator",
    "organization",
    "storefront_product",
    "app_listing",
    "job_posting",
    "scholarly_work",
    "tender",
    "grant",
    "software_repository",
    "software_package",
    "dataset",
    "clinical_trial",
    "regulatory_document",
    "vulnerability",
    "book",
    "podcast",
    "web_page",
    "knowledge_entity",
    "person",
)

FAMILY_SET = frozenset(FAMILIES)


def assert_family(entity_type: str) -> str:
    if entity_type not in FAMILY_SET:
        raise ValueError(
            f"unsupported entity_type {entity_type!r}; must be one of: {', '.join(FAMILIES)}"
        )
    return entity_type
